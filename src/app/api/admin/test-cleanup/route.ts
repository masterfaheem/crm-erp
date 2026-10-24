import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { accessFromRequest } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { STOCK_TABLE, ensureStockTable, recalcCustomer } from "@/lib/ledger";
import { ensurePosTables, INVOICE_LEAD_TABLE, POS_REQUEST_TABLE } from "@/lib/posSale";
import { ensureSalesOpsTables, EXCHANGE_ITEM_TABLE, EXCHANGE_TABLE, INVOICE_META_TABLE } from "@/lib/salesOps";
import { ensureHandoverTable, HANDOVER_TABLE } from "@/lib/orderHandover";
import { REFUND_TABLE } from "@/lib/ledger";
import { LEADS_TABLE } from "@/lib/leadsTable";
import { ensureCostingTables, OPENING_COST_TABLE, recomputeAvgCost } from "@/lib/costing";

/* ============================================================
   SUPER ADMIN ONLY — remove TEST documents & products before go-live.
   GET  -> everything that exists (to pick from)
   POST { invoice_ids, sales_order_ids, purchase_bill_ids, purchase_order_ids,
          quotation_ids, product_ids, dry_run, confirm: "DELETE TEST DATA" }
   Everything in one transaction. Nothing outside the given ids is touched.
   Products are removed only when no remaining document uses them.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;
type Row = Record<string, unknown>;
const CONFIRM = "DELETE TEST DATA";

async function superAdmin(req: NextRequest) {
  const a = await accessFromRequest(req);
  if (!a) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!a.isSuperAdmin) return { err: NextResponse.json({ error: "Super Admin only." }, { status: 403 }) };
  return { a };
}

async function tableExists(conn: Conn, name: string) {
  const [r] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name]
  );
  return Number((r as Row[])[0]?.n) > 0;
}
const ids = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
const q = async (conn: Conn, sql: string, p: unknown[]) => ((await conn.query(sql, p)) as [Row[]])[0];

export async function GET(req: NextRequest) {
  const { a, err } = await superAdmin(req);
  if (err) return err;
  const c = a.companyId;
  const pool = getPool();
  await ensureStockTable();
  const has = async (t: string) => tableExists(pool, t);
  const out: Record<string, Row[]> = {};
  out.invoices = await q(pool,
    `SELECT i.id, i.invoice_number AS number, i.invoice_date AS date, i.status, i.grand_total AS total, cu.name AS party
       FROM invoices i LEFT JOIN customers cu ON cu.id = i.customer_id WHERE i.company_id = ? ORDER BY i.id`, [c]);
  out.sales_orders = await q(pool,
    `SELECT s.id, s.order_number AS number, s.order_date AS date, s.status, s.grand_total AS total, cu.name AS party
       FROM sales_orders s LEFT JOIN customers cu ON cu.id = s.customer_id WHERE s.company_id = ? ORDER BY s.id`, [c]);
  out.purchase_bills = await q(pool, `SELECT * FROM purchase_bills WHERE company_id = ? ORDER BY id`, [c]);
  out.purchase_orders = (await has("purchase_orders")) ? await q(pool, `SELECT * FROM purchase_orders WHERE company_id = ? ORDER BY id`, [c]) : [];
  out.quotations = (await has("quotations")) ? await q(pool, `SELECT * FROM quotations WHERE company_id = ? ORDER BY id`, [c]) : [];
  out.products = await q(pool,
    `SELECT p.id, p.sku, p.name, p.opening_stock, p.purchase_price,
            (SELECT COALESCE(SUM(m.qty),0) FROM ${STOCK_TABLE} m WHERE m.product_id = p.id AND m.company_id = p.company_id) AS moved
       FROM products p WHERE p.company_id = ? ORDER BY p.id`, [c]);
  return NextResponse.json({ data: out, confirm_phrase: CONFIRM });
}

export async function POST(req: NextRequest) {
  const { a, err } = await superAdmin(req);
  if (err) return err;
  const c = a.companyId;
  const body = (await req.json().catch(() => ({}))) as Row;
  const sel = {
    invoices: ids(body.invoice_ids),
    sales_orders: ids(body.sales_order_ids),
    purchase_bills: ids(body.purchase_bill_ids),
    purchase_orders: ids(body.purchase_order_ids),
    quotations: ids(body.quotation_ids),
    products: ids(body.product_ids),
  };
  const dry = body.dry_run !== false;
  if (!dry && body.confirm !== CONFIRM) {
    return NextResponse.json({ error: `Type "${CONFIRM}" to confirm.` }, { status: 400 });
  }
  if (!Object.values(sel).some((l) => l.length)) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });

  /* DDL first (it would commit an open transaction) */
  await ensureStockTable();
  await ensurePosTables();
  await ensureSalesOpsTables();
  await ensureHandoverTable();
  await ensureCostingTables();

  const pool = getPool();
  const conn = await pool.getConnection();
  const log: string[] = [];
  const del = async (label: string, sql: string, p: unknown[]) => {
    const [r] = await conn.query(sql, p);
    const n = Number((r as { affectedRows?: number }).affectedRows || 0);
    if (n) log.push(`${label}: ${n}`);
    return n;
  };
  const IN = (l: number[]) => l.map(() => "?").join(",");
  try {
    await conn.beginTransaction();
    const hasPO = await tableExists(conn, "purchase_orders");
    const hasQ = await tableExists(conn, "quotations");
    const problems: string[] = [];

    /* ---- make sure every id belongs to this company ---- */
    const own = async (table: string, list: number[]) => {
      if (!list.length) return;
      const r = await q(conn, `SELECT id FROM ${table} WHERE company_id = ? AND id IN (${IN(list)}) FOR UPDATE`, [c, ...list]);
      const found = new Set(r.map((x) => Number(x.id)));
      const miss = list.filter((i) => !found.has(i));
      if (miss.length) problems.push(`${table}: not found ${miss.join(", ")}`);
    };
    await own("invoices", sel.invoices);
    await own("sales_orders", sel.sales_orders);
    await own("purchase_bills", sel.purchase_bills);
    if (sel.purchase_orders.length) {
      if (hasPO) await own("purchase_orders", sel.purchase_orders);
      else problems.push("purchase_orders table missing");
    }
    if (sel.quotations.length) {
      if (hasQ) await own("quotations", sel.quotations);
      else problems.push("quotations table missing");
    }
    await own("products", sel.products);

    /* ---- an exchange ties two bills together: both must go, or neither ---- */
    if (sel.invoices.length) {
      const ex = await q(conn,
        `SELECT exchange_number, exchange_invoice_id, original_invoice_id FROM ${EXCHANGE_TABLE}
          WHERE company_id = ? AND (exchange_invoice_id IN (${IN(sel.invoices)}) OR original_invoice_id IN (${IN(sel.invoices)}))`,
        [c, ...sel.invoices, ...sel.invoices]);
      for (const e of ex) {
        if (!sel.invoices.includes(Number(e.exchange_invoice_id)) || !sel.invoices.includes(Number(e.original_invoice_id))) {
          problems.push(`Exchange ${e.exchange_number} links bills ${e.original_invoice_id} & ${e.exchange_invoice_id} — select both`);
        }
      }
    }
    if (problems.length) {
      await conn.rollback();
      return NextResponse.json({ error: "Can't clean up", problems }, { status: 400 });
    }

    const customers = new Set<number>();
    const leadsTouched: string[] = [];

    /* ================= invoices ================= */
    if (sel.invoices.length) {
      const L = sel.invoices;
      const inv = await q(conn, `SELECT id, invoice_number, customer_id FROM invoices WHERE id IN (${IN(L)})`, L);
      inv.forEach((i) => i.customer_id && customers.add(Number(i.customer_id)));

      /* CRM leads the bill turned "Won" go back (made-at-POS leads -> lost) */
      const links = await q(conn, `SELECT * FROM ${INVOICE_LEAD_TABLE} WHERE invoice_id IN (${IN(L)})`, L);
      for (const l of links) {
        const other = await q(conn,
          `SELECT COUNT(*) AS n FROM ${INVOICE_LEAD_TABLE} il JOIN invoices i ON i.id = il.invoice_id
            WHERE il.lead_id = ? AND il.invoice_id NOT IN (${IN(L)}) AND i.status <> 'cancelled'`, [l.lead_id, ...L]);
        if (Number(other[0]?.n) > 0) continue;
        if (Number(l.lead_created) === 1) {
          await conn.query(
            `UPDATE ${LEADS_TABLE} SET status = 'lost', lost_reason = 'other', lost_reason_other = 'Test bill removed' WHERE id = ? AND company_id = ?`,
            [l.lead_id, c]);
          leadsTouched.push(`lead ${l.lead_id} -> lost (made by test bill)`);
        } else {
          const st = l.prev_status && l.prev_status !== "won" ? String(l.prev_status) : "negotiation";
          await conn.query(`UPDATE ${LEADS_TABLE} SET status = ?, sales_channel = NULL WHERE id = ? AND company_id = ?`, [st, l.lead_id, c]);
          leadsTouched.push(`lead ${l.lead_id} -> ${st}`);
        }
      }
      await del("lead links", `DELETE FROM ${INVOICE_LEAD_TABLE} WHERE invoice_id IN (${IN(L)})`, L);

      const exc = await q(conn, `SELECT id FROM ${EXCHANGE_TABLE} WHERE company_id = ? AND exchange_invoice_id IN (${IN(L)})`, [c, ...L]);
      const excIds = exc.map((e) => Number(e.id));
      if (excIds.length) {
        await del("exchange lines", `DELETE FROM ${EXCHANGE_ITEM_TABLE} WHERE exchange_id IN (${IN(excIds)})`, excIds);
        await del("refunds (exchange)", `DELETE FROM ${REFUND_TABLE} WHERE company_id = ? AND source = 'exchange' AND source_id IN (${IN(excIds)})`, [c, ...excIds]);
        await del("exchanges", `DELETE FROM ${EXCHANGE_TABLE} WHERE id IN (${IN(excIds)})`, excIds);
      }
      await del("refunds", `DELETE FROM ${REFUND_TABLE} WHERE company_id = ? AND invoice_id IN (${IN(L)})`, [c, ...L]);
      await del("customer payments", `DELETE FROM customer_payments WHERE company_id = ? AND invoice_id IN (${IN(L)})`, [c, ...L]);
      await del("stock moves (bills)", `DELETE FROM ${STOCK_TABLE} WHERE company_id = ? AND ref_type = 'invoice' AND ref_id IN (${IN(L)})`, [c, ...L]);
      await del("bill info", `DELETE FROM ${INVOICE_META_TABLE} WHERE invoice_id IN (${IN(L)})`, L);
      await del("POS requests", `DELETE FROM ${POS_REQUEST_TABLE} WHERE company_id = ? AND invoice_id IN (${IN(L)})`, [c, ...L]);
      await conn.query(`UPDATE ${HANDOVER_TABLE} SET invoice_id = NULL WHERE company_id = ? AND invoice_id IN (${IN(L)})`, [c, ...L]);
      await del("bill lines", `DELETE FROM invoice_items WHERE invoice_id IN (${IN(L)})`, L);
      await del("bills", `DELETE FROM invoices WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
    }

    /* ================= sales orders ================= */
    if (sel.sales_orders.length) {
      const L = sel.sales_orders;
      const so = await q(conn, `SELECT customer_id FROM sales_orders WHERE id IN (${IN(L)})`, L);
      so.forEach((s) => s.customer_id && customers.add(Number(s.customer_id)));
      const ho = await q(conn, `SELECT id, lead_id, payment_id FROM ${HANDOVER_TABLE} WHERE company_id = ? AND sales_order_id IN (${IN(L)})`, [c, ...L]);
      const payIds = ho.map((h) => Number(h.payment_id)).filter(Boolean);
      if (payIds.length) await del("advance payments", `DELETE FROM customer_payments WHERE company_id = ? AND id IN (${IN(payIds)})`, [c, ...payIds]);
      ho.forEach((h) => leadsTouched.push(`lead ${h.lead_id}: its order handover was removed (lead itself kept)`));
      await del("order handovers", `DELETE FROM ${HANDOVER_TABLE} WHERE company_id = ? AND sales_order_id IN (${IN(L)})`, [c, ...L]);
      await conn.query(`UPDATE invoices SET sales_order_id = NULL WHERE company_id = ? AND sales_order_id IN (${IN(L)})`, [c, ...L]);
      await del("order lines", `DELETE FROM sales_order_items WHERE sales_order_id IN (${IN(L)})`, L);
      await del("sales orders", `DELETE FROM sales_orders WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
    }

    /* ================= purchase bills ================= */
    if (sel.purchase_bills.length) {
      const L = sel.purchase_bills;
      const sp = await q(conn, `SELECT supplier_id, amount FROM supplier_payments WHERE company_id = ? AND purchase_bill_id IN (${IN(L)})`, [c, ...L]);
      for (const p of sp) {
        await conn.query("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ? AND company_id = ?", [Number(p.amount) || 0, p.supplier_id, c]);
      }
      await del("supplier payments", `DELETE FROM supplier_payments WHERE company_id = ? AND purchase_bill_id IN (${IN(L)})`, [c, ...L]);
      await del("stock moves (purchases)", `DELETE FROM ${STOCK_TABLE} WHERE company_id = ? AND ref_type = 'purchase_bill' AND ref_id IN (${IN(L)})`, [c, ...L]);
      const pbProducts = (await q(conn, `SELECT DISTINCT product_id FROM purchase_bill_items WHERE purchase_bill_id IN (${IN(L)}) AND product_id IS NOT NULL`, L))
        .map((x) => Number(x.product_id));
      await del("purchase bill lines", `DELETE FROM purchase_bill_items WHERE purchase_bill_id IN (${IN(L)})`, L);
      await del("purchase bills", `DELETE FROM purchase_bills WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
      /* products that stay: cost re-averaged without the removed bills */
      await recomputeAvgCost(conn, c, pbProducts.filter((p) => !sel.products.includes(p)));
    }

    /* ================= purchase orders / quotations ================= */
    if (sel.purchase_orders.length) {
      const L = sel.purchase_orders;
      await del("PO lines", `DELETE FROM purchase_order_items WHERE purchase_order_id IN (${IN(L)})`, L);
      await del("purchase orders", `DELETE FROM purchase_orders WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
    }
    if (sel.quotations.length) {
      const L = sel.quotations;
      await conn.query(`UPDATE sales_orders SET quotation_id = NULL WHERE company_id = ? AND quotation_id IN (${IN(L)})`, [c, ...L]);
      await del("quotation lines", `DELETE FROM quotation_items WHERE quotation_id IN (${IN(L)})`, L);
      await del("quotations", `DELETE FROM quotations WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
    }

    /* ================= products (only if nothing left uses them) ================= */
    if (sel.products.length) {
      const L = sel.products;
      const refs: [string, string][] = [
        ["invoice_items", "bills"], ["sales_order_items", "sales orders"], ["purchase_bill_items", "purchase bills"],
        [EXCHANGE_ITEM_TABLE, "exchanges"],
      ];
      if (hasPO) refs.push(["purchase_order_items", "purchase orders"]);
      if (hasQ) refs.push(["quotation_items", "quotations"]);
      const used: string[] = [];
      for (const [t, label] of refs) {
        const r = await q(conn, `SELECT product_id, COUNT(*) AS n FROM ${t} WHERE product_id IN (${IN(L)}) GROUP BY product_id`, L);
        r.forEach((x) => used.push(`product ${x.product_id} still on ${x.n} ${label}`));
      }
      if (used.length) {
        await conn.rollback();
        return NextResponse.json({ error: "Some products are still used — select those documents too", problems: used }, { status: 400 });
      }
      await del("stock moves (products)", `DELETE FROM ${STOCK_TABLE} WHERE company_id = ? AND product_id IN (${IN(L)})`, [c, ...L]);
      await del("opening costs", `DELETE FROM ${OPENING_COST_TABLE} WHERE company_id = ? AND product_id IN (${IN(L)})`, [c, ...L]);
      await del("products", `DELETE FROM products WHERE company_id = ? AND id IN (${IN(L)})`, [c, ...L]);
    }

    for (const cid of customers) await recalcCustomer(conn, c, cid);

    if (dry) {
      await conn.rollback();
      return NextResponse.json({ dry_run: true, would_delete: log, leads: leadsTouched, customers_recalculated: customers.size });
    }
    await conn.commit();
    await writeAudit(req, { id: a.userId, company_id: c }, "test_data_cleanup", "system", null);
    return NextResponse.json({ ok: true, deleted: log, leads: leadsTouched, customers_recalculated: customers.size });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error("[test-cleanup]", e);
    return NextResponse.json({ error: "Cleanup failed — nothing was changed." }, { status: 500 });
  } finally {
    conn.release();
  }
}
