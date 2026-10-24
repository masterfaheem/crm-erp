import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { accessFromRequest, can } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { STOCK_SQL } from "@/lib/ledger";
import {
  BUCKETS, BUCKET_SQL, OUT_STATUSES, STATUSES, STATUS_MOVE_TABLE, StatusError, WRITE_OFF,
  ensureStockStatusTables, isStatus, moveStatus,
} from "@/lib/stockStatus";

/* ============================================================
   GET  /api/inventory/status                 -> every product split by status (+ totals)
        ?view=out                             -> units out at repair / with vendors
        ?view=history&product_id=             -> status history of one product
   POST /api/inventory/status  { product_id, from, to, qty, party, expected_back, note }
============================================================ */
type Row = Record<string, unknown>;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const a = await accessFromRequest(req);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(a, "inventory.view")) return NextResponse.json({ error: "You don't have permission for this." }, { status: 403 });
  const showCost = can(a, "products.cost");
  const c = a.companyId;
  try {
    await ensureStockStatusTables();
    const pool = getPool();
    const sp = new URL(req.url).searchParams;
    const view = sp.get("view") || "board";

    if (view === "history") {
      const pid = Number(sp.get("product_id")) || 0;
      const [rows] = await pool.query(
        `SELECT sm.id, sm.qty, sm.from_status, sm.to_status, sm.party, DATE_FORMAT(sm.expected_back, '%Y-%m-%d') AS expected_back,
                sm.note, sm.ref_type, sm.ref_number, sm.created_at, u.name AS by_name
           FROM ${STATUS_MOVE_TABLE} sm LEFT JOIN users u ON u.id = sm.created_by
          WHERE sm.company_id = ? AND sm.product_id = ? ORDER BY sm.id DESC LIMIT 200`,
        [c, pid]
      );
      return NextResponse.json({ data: rows });
    }

    if (view === "out") {
      /* open qty per product / status / party */
      const [rows] = await pool.query(
        `SELECT x.product_id, p.name, p.sku, x.status, x.party, x.qty, x.first_sent, x.expected_back,
                DATEDIFF(CURRENT_DATE, x.first_sent) AS days_out, p.purchase_price
           FROM (
             SELECT sm.product_id, s.status, COALESCE(sm.party, '') AS party,
                    SUM(CASE WHEN sm.to_status = s.status THEN sm.qty ELSE -sm.qty END) AS qty,
                    DATE(MIN(CASE WHEN sm.to_status = s.status THEN sm.created_at END)) AS first_sent,
                    DATE_FORMAT(MAX(CASE WHEN sm.to_status = s.status THEN sm.expected_back END), '%Y-%m-%d') AS expected_back
               FROM ${STATUS_MOVE_TABLE} sm
               JOIN (SELECT 'at_repair' AS status UNION ALL SELECT 'at_vendor') s
                 ON sm.to_status = s.status OR sm.from_status = s.status
              WHERE sm.company_id = ?
              GROUP BY sm.product_id, s.status, COALESCE(sm.party, '')
           ) x JOIN products p ON p.id = x.product_id
          WHERE x.qty > 0
          ORDER BY x.first_sent`,
        [c]
      );
      const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
      return NextResponse.json({
        data: (rows as Row[]).map((r) => ({
          ...r,
          qty: Number(r.qty),
          days_out: Number(r.days_out) || 0,
          overdue: !!r.expected_back && String(r.expected_back) < today,
          value: showCost ? r2(Number(r.qty) * Number(r.purchase_price || 0)) : null,
          purchase_price: undefined,
        })),
      });
    }

    /* board */
    const search = (sp.get("search") || "").trim();
    const categoryId = Number(sp.get("category_id")) || 0;
    const where = ["p.company_id = ?", "COALESCE(p.track_inventory, 1) = 1", "COALESCE(p.product_type, 'product') = 'product'"];
    const params: (string | number)[] = [c];
    if (search) {
      where.push("(p.name LIKE ? OR p.sku LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (categoryId) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.sku, p.name, p.status, p.purchase_price, p.sale_price, pc.name AS category_name, pc.color AS category_color,
              ${STOCK_SQL} AS total, ${BUCKETS.map((b) => `${BUCKET_SQL(b)} AS ${b}`).join(", ")}
         FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE ${where.join(" AND ")}
        ORDER BY p.name`,
      params
    );
    const kpi: Record<string, { qty: number; value: number; products: number }> = {};
    for (const s of STATUSES) kpi[s.key] = { qty: 0, value: 0, products: 0 };
    const data = (rows as Row[]).map((r) => {
      const cost = Number(r.purchase_price) || 0;
      const total = Number(r.total) || 0;
      const b: Record<string, number> = {};
      let held = 0;
      for (const k of BUCKETS) {
        b[k] = Number(r[k]) || 0;
        held += b[k];
      }
      b.ready = Math.round((total - held) * 1000) / 1000;
      for (const s of STATUSES) {
        const q = b[s.key];
        if (q > 0) {
          kpi[s.key].qty += q;
          kpi[s.key].value += q * cost;
          kpi[s.key].products++;
        }
      }
      return {
        id: r.id, sku: r.sku, name: r.name, status: r.status, category_name: r.category_name, category_color: r.category_color,
        total, ...b, cost: showCost ? cost : null, sale_price: Number(r.sale_price) || 0,
        value: showCost ? r2(Math.max(0, total) * cost) : null,
        mismatch: b.ready < 0,
      };
    });
    for (const k of Object.keys(kpi)) kpi[k].value = showCost ? r2(kpi[k].value) : (null as unknown as number);
    return NextResponse.json({ data, kpi, statuses: STATUSES, show_cost: showCost });
  } catch (err) {
    console.error("[GET /api/inventory/status]", err);
    return NextResponse.json({ error: "Unable to load stock status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await accessFromRequest(req);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(a, "inventory.adjust")) return NextResponse.json({ error: "You don't have permission to change stock." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Row;
  const from = String(body.from || "");
  const to = String(body.to || "");
  const qty = Number(body.qty);
  const productId = Number(body.product_id) || 0;
  if (!productId) return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  if (!isStatus(from) || !(isStatus(to) || to === WRITE_OFF)) return NextResponse.json({ error: "Choose valid statuses." }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0 || Math.round(qty * 1000) !== qty * 1000) {
    return NextResponse.json({ error: "Enter a valid quantity." }, { status: 400 });
  }
  const eb = String(body.expected_back || "").trim();
  if (eb && !/^\d{4}-\d{2}-\d{2}$/.test(eb)) return NextResponse.json({ error: "Expected back date is not valid." }, { status: 400 });
  const note = String(body.note || "").trim();
  if (to === WRITE_OFF && !note) return NextResponse.json({ error: "Write the reason for the write-off." }, { status: 400 });
  if (OUT_STATUSES.includes(from) && !String(body.party || "").trim()) {
    return NextResponse.json({ error: "Choose whom it is coming back from (repair shop / vendor)." }, { status: 400 });
  }

  await ensureStockStatusTables();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const res = await moveStatus(conn, { id: a.userId, company_id: a.companyId }, {
      product_id: productId, from, to: to as never, qty,
      party: OUT_STATUSES.includes(to) || OUT_STATUSES.includes(from) ? String(body.party || "") : null,
      expected_back: OUT_STATUSES.includes(to) ? eb || null : null,
      note,
    });
    await conn.commit();
    await writeAudit(req, { id: a.userId, company_id: a.companyId }, to === WRITE_OFF ? "stock_write_off" : "stock_status_move", "products", productId);
    return NextResponse.json({ ok: true, ...res }, { status: 201 });
  } catch (e) {
    await conn.rollback().catch(() => {});
    if (e instanceof StatusError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[POST /api/inventory/status]", e);
    return NextResponse.json({ error: "Couldn't save — nothing changed." }, { status: 500 });
  } finally {
    conn.release();
  }
}
