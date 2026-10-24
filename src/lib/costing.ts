import { getPool } from "@/lib/db";
import { STOCK_TABLE, ensureStockTable } from "@/lib/ledger";

/* ============================================================
   PRODUCT COST (weighted average)
   - opening cost is frozen per product (crm_opening_costs) so the
     opening-stock value in the books never moves when cost changes
   - after every purchase bill save / delete the product's cost becomes
       (opening qty × opening cost + Σ purchased qty × bill cost)
       / (opening qty + Σ purchased qty)
     (bill cost = line total incl. discount & tax, same as the books)
   - each manual stock adjustment keeps the cost of that day
   Sales already keep their own cost on the bill line (unit_cost).
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;
export const OPENING_COST_TABLE = "crm_opening_costs";

let ready = false;
export async function ensureCostingTables() {
  if (ready) return;
  await ensureStockTable();
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${OPENING_COST_TABLE} (
      company_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      opening_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [c] = await pool.query(`SHOW COLUMNS FROM ${STOCK_TABLE} LIKE 'unit_cost'`);
  if (!(c as unknown[]).length) {
    await pool.query(`ALTER TABLE ${STOCK_TABLE} ADD COLUMN unit_cost DECIMAL(14,2) NULL AFTER qty`);
  }
  ready = true;
}

/* value of opening stock: opening qty × frozen opening cost (falls back to today's cost) */
export const OPENING_COST_SQL = (p = "p") =>
  `COALESCE((SELECT oc.opening_cost FROM ${OPENING_COST_TABLE} oc WHERE oc.company_id = ${p}.company_id AND oc.product_id = ${p}.id), ${p}.purchase_price, 0)`;

export async function setOpeningCost(conn: Conn, companyId: number, productId: number, cost: number) {
  await conn.query(
    `INSERT INTO ${OPENING_COST_TABLE} (company_id, product_id, opening_cost) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE opening_cost = VALUES(opening_cost)`,
    [companyId, productId, Math.round(cost * 100) / 100]
  );
}

/* keep today's cost as the opening cost (only if not saved yet) */
async function freezeOpeningCost(conn: Conn, companyId: number, ids: number[]) {
  if (!ids.length) return;
  await conn.query(
    `INSERT IGNORE INTO ${OPENING_COST_TABLE} (company_id, product_id, opening_cost)
     SELECT company_id, id, COALESCE(purchase_price, 0) FROM products WHERE company_id = ? AND id IN (?)`,
    [companyId, ids]
  );
}

export async function productsOnPurchaseBill(conn: Conn, billId: number): Promise<number[]> {
  const [r] = await conn.query(
    "SELECT DISTINCT product_id FROM purchase_bill_items WHERE purchase_bill_id = ? AND product_id IS NOT NULL",
    [billId]
  );
  return (r as { product_id: number }[]).map((x) => Number(x.product_id)).filter(Boolean);
}

/* recompute weighted-average cost of these products from opening + all live purchase bills */
export async function recomputeAvgCost(conn: Conn, companyId: number, productIds: number[]) {
  const ids = [...new Set(productIds.map(Number).filter((n) => n > 0))];
  if (!ids.length) return;
  await freezeOpeningCost(conn, companyId, ids);
  const [rows] = await conn.query(
    `SELECT p.id, GREATEST(COALESCE(p.opening_stock, 0), 0) AS oq, ${OPENING_COST_SQL("p")} AS oc,
            COALESCE(b.q, 0) AS bq, COALESCE(b.v, 0) AS bv
       FROM products p
       LEFT JOIN (
         SELECT it.product_id, SUM(it.quantity) AS q,
                SUM(COALESCE(it.line_total, it.quantity * it.unit_price)) AS v
           FROM purchase_bill_items it JOIN purchase_bills pb ON pb.id = it.purchase_bill_id
          WHERE pb.company_id = ? AND pb.status NOT IN ('draft', 'cancelled') AND it.product_id IN (?)
          GROUP BY it.product_id
       ) b ON b.product_id = p.id
      WHERE p.company_id = ? AND p.id IN (?)`,
    [companyId, ids, companyId, ids]
  );
  for (const r of rows as { id: number; oq: number; oc: number; bq: number; bv: number }[]) {
    const bq = Number(r.bq) || 0;
    const oq = Number(r.oq) || 0;
    const oc = Number(r.oc) || 0;
    /* no purchases left -> back to the opening cost */
    const totalQ = oq + bq;
    const cost = bq > 0 && totalQ > 0 ? (oq * oc + Number(r.bv)) / totalQ : oc;
    await conn.query("UPDATE products SET purchase_price = ? WHERE id = ? AND company_id = ?", [
      Math.round(cost * 100) / 100,
      r.id,
      companyId,
    ]);
  }
}
