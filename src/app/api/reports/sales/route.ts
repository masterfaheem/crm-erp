import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accessFromRequest, can } from "@/lib/access";
import { cleanDate } from "@/lib/leadsTable";
import { HANDOVER_TABLE, ensureHandoverTable } from "@/lib/orderHandover";
import { ensureSalesOpsTables } from "@/lib/salesOps";
import { exchangeNoSql } from "@/lib/format";

/* ============================================================
   GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
   Sales, profit, products, customers, receivables,
   online-order operations and reviews.
============================================================ */
type Row = Record<string, unknown>;
const toNum = (rows: Row[]) =>
  rows.map((r) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r))
      o[k] = typeof v === "string" && v !== "" && !isNaN(Number(v)) && k !== "k" && k !== "name" && k !== "code" ? Number(v) : v;
    return o;
  });

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureHandoverTable();
    await ensureSalesOpsTables();
    const sp = new URL(req.url).searchParams;
    const from = cleanDate(sp.get("from"));
    const to = cleanDate(sp.get("to"));

    const w: string[] = ["i.company_id = ?", "i.status <> 'cancelled'"];
    const p: unknown[] = [user.company_id];
    if (from) {
      w.push("i.invoice_date >= ?");
      p.push(from);
    }
    if (to) {
      w.push("i.invoice_date <= ?");
      p.push(to);
    }
    const W = w.join(" AND ");
    const pool = getPool();
    const q = async (sql: string, extra: unknown[] = []) =>
      toNum((await pool.query(sql, [...p, ...extra]))[0] as Row[]);

    const hw: string[] = ["h.company_id = ?"];
    const hp: unknown[] = [user.company_id];
    if (from) {
      hw.push("DATE(h.created_at) >= ?");
      hp.push(from);
    }
    if (to) {
      hw.push("DATE(h.created_at) <= ?");
      hp.push(to);
    }
    const HW = hw.join(" AND ");
    const hq = async (sql: string) => toNum((await pool.query(sql, hp))[0] as Row[]);

    const [
      totals,
      channel,
      byDay,
      topProducts,
      topCustomers,
      receivables,
      ordersByStatus,
      opsSpeed,
      reviews,
      advanceMethods,
      byCityOnline,
    ] = await Promise.all([
      /* exchange bills (EXC-) only carry the price difference: counted in sales, not as new bills */
      q(`SELECT SUM(NOT ${exchangeNoSql("i.invoice_number")}) AS bills, COALESCE(SUM(i.grand_total),0) AS sales,
                COALESCE(SUM(i.paid_amount),0) AS paid, COALESCE(SUM(i.balance),0) AS outstanding,
                COALESCE(AVG(CASE WHEN NOT ${exchangeNoSql("i.invoice_number")} THEN i.grand_total END),0) AS avg_bill,
                COUNT(DISTINCT i.customer_id) AS customers,
                SUM(${exchangeNoSql("i.invoice_number")}) AS exchanges
           FROM invoices i WHERE ${W}`),
      q(`SELECT CASE WHEN h.id IS NULL OR il.invoice_id IS NOT NULL THEN 'walk_in' ELSE 'online' END AS k,
                SUM(NOT ${exchangeNoSql("i.invoice_number")}) AS bills, COALESCE(SUM(i.grand_total),0) AS sales
           FROM invoices i LEFT JOIN ${HANDOVER_TABLE} h ON h.invoice_id = i.id
           LEFT JOIN crm_invoice_leads il ON il.invoice_id = i.id
          WHERE ${W} GROUP BY k`),
      q(`SELECT DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS k, COUNT(*) AS bills, SUM(i.grand_total) AS sales
           FROM invoices i WHERE ${W} GROUP BY k ORDER BY k`),
      q(`SELECT COALESCE(p.name, ii.description, 'Item') AS name, p.sku AS code,
                SUM(ii.quantity) AS qty, SUM(ii.line_total) AS revenue,
                /* cost saved on the bill at the time of sale; older bills fall back to the
                   product's current cost. Unknown cost -> no profit shown (never guessed). Tax excluded. */
                SUM(CASE WHEN COALESCE(ii.unit_cost, NULLIF(p.purchase_price, 0)) IS NOT NULL
                         THEN ii.line_total - COALESCE(ii.line_tax, 0) - ii.quantity * COALESCE(ii.unit_cost, p.purchase_price) END) AS profit
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id
           LEFT JOIN products p ON p.id = ii.product_id
          WHERE ${W}
          GROUP BY COALESCE(ii.product_id, CONCAT('d:', ii.description)), name, code
          ORDER BY revenue DESC LIMIT 15`),
      q(`SELECT c.name AS name, c.customer_code AS code, COUNT(*) AS bills, SUM(i.grand_total) AS sales
           FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE ${W} GROUP BY c.id, c.name, c.customer_code ORDER BY sales DESC LIMIT 10`),
      q(`SELECT c.name AS name, c.customer_code AS code, COUNT(*) AS bills, SUM(i.balance) AS balance
           FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE ${W} AND i.balance > 0 GROUP BY c.id, c.name, c.customer_code ORDER BY balance DESC LIMIT 10`),
      hq(`SELECT h.status AS k, COUNT(*) AS n, COALESCE(SUM(h.total_amount),0) AS amount,
                 COALESCE(SUM(h.cod_amount),0) AS cod
            FROM ${HANDOVER_TABLE} h WHERE ${HW} GROUP BY h.status`),
      hq(`SELECT AVG(TIMESTAMPDIFF(HOUR, h.created_at, h.shipped_at)) AS hours_to_ship,
                 AVG(TIMESTAMPDIFF(HOUR, h.shipped_at, h.delivered_at)) AS hours_in_transit,
                 AVG(TIMESTAMPDIFF(HOUR, h.created_at, h.delivered_at)) AS hours_total
            FROM ${HANDOVER_TABLE} h WHERE ${HW}`),
      hq(`SELECT h.review_rating AS k, COUNT(*) AS n FROM ${HANDOVER_TABLE} h
           WHERE ${HW} AND h.review_rating IS NOT NULL GROUP BY h.review_rating ORDER BY k DESC`),
      /* how money came in (all cleared payments in range: POS + online orders) */
      toNum(
        (
          await pool.query(
            `SELECT CASE
                      WHEN cp.method = 'online' AND cp.reference LIKE 'JazzCash%' THEN 'jazzcash'
                      WHEN cp.method = 'online' AND cp.reference LIKE 'Easypaisa%' THEN 'easypaisa'
                      WHEN cp.method = 'online' THEN 'wallet'
                      ELSE cp.method END AS k,
                    COUNT(*) AS n, COALESCE(SUM(cp.amount),0) AS amount
               FROM customer_payments cp
              WHERE cp.company_id = ? AND cp.status = 'cleared'
                ${from ? "AND cp.payment_date >= ?" : ""} ${to ? "AND cp.payment_date <= ?" : ""}
              GROUP BY k ORDER BY amount DESC`,
            [user.company_id, ...(from ? [from] : []), ...(to ? [to] : [])]
          )
        )[0] as Row[]
      ),
      hq(`SELECT h.delivery_city AS k, COUNT(*) AS n, COALESCE(SUM(h.total_amount),0) AS amount
            FROM ${HANDOVER_TABLE} h WHERE ${HW} GROUP BY k ORDER BY n DESC LIMIT 15`),
    ]);

    /* money paid back to customers in the range (cancelled bills / exchanges) */
    let refunds = { amount: 0, n: 0 };
    try {
      const [rf] = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS amount, COUNT(*) AS n FROM crm_customer_refunds
          WHERE company_id = ? ${from ? "AND refund_date >= ?" : ""} ${to ? "AND refund_date <= ?" : ""}`,
        [user.company_id, ...(from ? [from] : []), ...(to ? [to] : [])]
      );
      const r0 = (rf as { amount: number; n: number }[])[0];
      refunds = { amount: Number(r0?.amount || 0), n: Number(r0?.n || 0) };
    } catch {
      /* no refunds yet */
    }

    /* credit still to collect: customers whose khata shows a balance due (all time) */
    const [codRows] = await pool.query(
      `SELECT COALESCE(SUM(c.current_balance),0) AS cod_due, COUNT(*) AS n
         FROM customers c WHERE c.company_id = ? AND c.current_balance > 0`,
      [user.company_id]
    );

    const showProfit = can(await accessFromRequest(req), "sales.profit");
    return NextResponse.json({
      data: {
        range: { from, to },
        totals: totals[0] || {},
        channel,
        by_day: byDay,
        top_products: showProfit ? topProducts : topProducts.map((t) => ({ ...t, profit: null })),
        can_see_profit: showProfit,
        top_customers: topCustomers,
        receivables,
        orders_by_status: ordersByStatus,
        ops_speed: opsSpeed[0] || {},
        reviews,
        advance_methods: advanceMethods,
        online_by_city: byCityOnline,
        cod_due: toNum(codRows as Row[])[0] || { cod_due: 0, n: 0 },
        refunds,
      },
    });
  } catch (err) {
    console.error("GET /api/reports/sales error:", err);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
