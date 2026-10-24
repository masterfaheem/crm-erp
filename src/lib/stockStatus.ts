import { getPool } from "@/lib/db";
import { STOCK_SQL, STOCK_TABLE, ensureStockTable } from "@/lib/ledger";
import { ensureCostingTables } from "@/lib/costing";

/* ============================================================
   STOCK STATUS — where / in what condition each unit is
   Total stock (opening + purchases − sales ± adjustments) is split into
   buckets. "Ready to sell" is whatever is not in another bucket.
   Moving units between buckets never changes total stock; only a
   write-off (from damaged / returned / out) takes units out of stock.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;
export const STATUS_MOVE_TABLE = "crm_stock_status_moves";

export const STATUSES = [
  { key: "ready", label: "Ready to sell", short: "Ready", where: "shop", color: "#17D65D" },
  { key: "not_ready", label: "Not ready (checking / cleaning / setup)", short: "Not ready", where: "shop", color: "#F59E0B" },
  { key: "returned", label: "Returned / exchange — to check", short: "Returned", where: "shop", color: "#8B5CF6" },
  { key: "damaged", label: "Damaged / faulty", short: "Damaged", where: "shop", color: "#EF4444" },
  { key: "at_repair", label: "Out at repair", short: "At repair", where: "out", color: "#0EA5E9" },
  { key: "at_vendor", label: "Out with vendor / supplier warranty", short: "With vendor", where: "out", color: "#6366F1" },
] as const;
export type StatusKey = (typeof STATUSES)[number]["key"];
export const BUCKETS = STATUSES.filter((s) => s.key !== "ready").map((s) => s.key) as Exclude<StatusKey, "ready">[];
export const OUT_STATUSES = ["at_repair", "at_vendor"];
export const WRITE_OFF = "written_off";
export const isStatus = (v: unknown): v is StatusKey => STATUSES.some((s) => s.key === v);

let ready = false;
export async function ensureStockStatusTables() {
  if (ready) return;
  await ensureStockTable();
  await ensureCostingTables(); // stock moves need unit_cost (write-offs)
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${STATUS_MOVE_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      qty DECIMAL(14,3) NOT NULL,
      from_status VARCHAR(20) NOT NULL,
      to_status VARCHAR(20) NOT NULL,
      party VARCHAR(150) NULL,
      expected_back DATE NULL,
      note VARCHAR(255) NULL,
      ref_type VARCHAR(20) NULL,
      ref_id INT UNSIGNED NULL,
      ref_number VARCHAR(40) NULL,
      stock_move_id INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_product (company_id, product_id),
      KEY idx_to (company_id, to_status),
      KEY idx_ref (ref_type, ref_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ready = true;
}

/* SQL: units of product p sitting in bucket s */
export const BUCKET_SQL = (s: string) =>
  `COALESCE((SELECT SUM(CASE WHEN sm.to_status = '${s}' THEN sm.qty WHEN sm.from_status = '${s}' THEN -sm.qty ELSE 0 END)
     FROM ${STATUS_MOVE_TABLE} sm WHERE sm.company_id = p.company_id AND sm.product_id = p.id
       AND (sm.to_status = '${s}' OR sm.from_status = '${s}')), 0)`;

/* one product's buckets (locks the product row when inside a transaction) */
export async function productBuckets(conn: Conn, companyId: number, productId: number, lock = false) {
  const [rows] = await conn.query(
    `SELECT p.id, p.name, p.purchase_price, ${STOCK_SQL} AS total,
            ${BUCKETS.map((b) => `${BUCKET_SQL(b)} AS ${b}`).join(", ")}
       FROM products p WHERE p.id = ? AND p.company_id = ?${lock ? " FOR UPDATE" : ""}`,
    [productId, companyId]
  );
  const r = (rows as Record<string, unknown>[])[0];
  if (!r) return null;
  const b: Record<string, number> = {};
  let held = 0;
  for (const k of BUCKETS) {
    b[k] = Number(r[k]) || 0;
    held += b[k];
  }
  const total = Number(r.total) || 0;
  b.ready = Math.round((total - held) * 1000) / 1000;
  return { id: Number(r.id), name: String(r.name), cost: Number(r.purchase_price) || 0, total, buckets: b };
}

export type StatusMoveInput = {
  product_id: number;
  from: StatusKey;
  to: StatusKey | typeof WRITE_OFF;
  qty: number;
  party?: string | null;
  expected_back?: string | null;
  note?: string | null;
  ref_type?: string | null;
  ref_id?: number | null;
  ref_number?: string | null;
};

export class StatusError extends Error {}

/* move units between buckets (or write them off). Call inside a transaction. */
export async function moveStatus(conn: Conn, user: { id: number; company_id: number }, m: StatusMoveInput, opts: { allowShort?: boolean } = {}) {
  const companyId = user.company_id;
  if (m.from === m.to) throw new StatusError("Choose a different status to move to.");
  if (!(m.qty > 0)) throw new StatusError("Enter a quantity above zero.");
  if (m.to === WRITE_OFF && m.from === "ready") throw new StatusError("Write off from Damaged / Returned / Out — or use a stock adjustment.");
  const pb = await productBuckets(conn, companyId, m.product_id, true);
  if (!pb) throw new StatusError("Product not found.");
  const have = pb.buckets[m.from] ?? 0;
  if (!opts.allowShort && have + 0.0001 < m.qty) {
    const label = STATUSES.find((s) => s.key === m.from)?.short || m.from;
    throw new StatusError(`Only ${have} in "${label}" for ${pb.name}.`);
  }
  if (OUT_STATUSES.includes(m.from) && String(m.party || "").trim()) {
    /* coming back: only what that shop / vendor actually has */
    const [pr] = await conn.query(
      `SELECT COALESCE(SUM(CASE WHEN to_status = ? THEN qty ELSE -qty END), 0) AS q FROM ${STATUS_MOVE_TABLE}
        WHERE company_id = ? AND product_id = ? AND (to_status = ? OR from_status = ?) AND COALESCE(party, '') = ?`,
      [m.from, companyId, m.product_id, m.from, m.from, String(m.party).trim().slice(0, 150)]
    );
    const withParty = Number((pr as { q: number }[])[0]?.q) || 0;
    if (withParty + 0.0001 < m.qty) throw new StatusError(`${String(m.party).trim()} has only ${withParty} of ${pb.name}.`);
  }
  if (OUT_STATUSES.includes(m.to) && !String(m.party || "").trim()) {
    throw new StatusError("Write who has it (repair shop / vendor name).");
  }
  let stockMoveId: number | null = null;
  if (m.to === WRITE_OFF) {
    /* leaves stock for good: a stock adjustment at today's cost (books: stock loss) */
    const [res] = await conn.query(
      `INSERT INTO ${STOCK_TABLE} (company_id, product_id, qty, unit_cost, move_type, ref_type, note, created_by)
       VALUES (?, ?, ?, ?, 'adjustment', 'adjustment', ?, ?)`,
      [companyId, m.product_id, -m.qty, pb.cost || null,
       `Written off (${STATUSES.find((s) => s.key === m.from)?.short || m.from})${m.note ? `: ${m.note}` : ""}`.slice(0, 255), user.id]
    );
    stockMoveId = (res as { insertId: number }).insertId;
  }
  const [ins] = await conn.query(
    `INSERT INTO ${STATUS_MOVE_TABLE}
       (company_id, product_id, qty, from_status, to_status, party, expected_back, note, ref_type, ref_id, ref_number, stock_move_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, m.product_id, m.qty, m.from, m.to, (m.party || "").trim().slice(0, 150) || null, m.expected_back || null,
     (m.note || "").trim().slice(0, 255) || null, m.ref_type || null, m.ref_id ?? null, m.ref_number || null, stockMoveId, user.id]
  );
  return { id: (ins as { insertId: number }).insertId, stock_move_id: stockMoveId };
}
