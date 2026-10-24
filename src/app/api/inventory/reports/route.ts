import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { accessFromRequest, can } from "@/lib/access";
import { STOCK_SQL, STOCK_TABLE, ensureStockTable } from "@/lib/ledger";

/* ============================================================
   GET /api/inventory/reports?type=
     movement&days=90          fast / normal / slow / dead stock
     aging                     how long the stock on hand has been with us (FIFO)
     profit&group=product|invoice|day|category&from=&to=   (needs "See profit")
============================================================ */
type Row = Record<string, unknown>;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const todayPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const ymd = (v: unknown) => {
  if (v instanceof Date) return new Date(v.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};
const LIVE_BILL = "i.status NOT IN ('draft', 'cancelled')";
const TRACKED = "COALESCE(p.track_inventory, 1) = 1 AND COALESCE(p.product_type, 'product') = 'product'";

export async function GET(req: NextRequest) {
  const a = await accessFromRequest(req);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(a, "inventory.view")) return NextResponse.json({ error: "You don't have permission for this." }, { status: 403 });
  const showCost = can(a, "products.cost");
  const c = a.companyId;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") || "movement";
  try {
    await ensureStockTable();
    const pool = getPool();
    const today = todayPKT();

    /* ---------------- fast / slow / dead ---------------- */
    if (type === "movement") {
      const days = [30, 60, 90, 180, 365].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 90;
      const since = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
      const [rows] = await pool.query(
        `SELECT p.id, p.sku, p.name, p.purchase_price, p.sale_price, pc.name AS category_name,
                ${STOCK_SQL} AS stock, DATE_FORMAT(p.created_at, '%Y-%m-%d') AS added_on,
                COALESCE(s.sold, 0) AS sold, COALESCE(s.revenue, 0) AS revenue, s.bills,
                DATE_FORMAT(ls.last_sale, '%Y-%m-%d') AS last_sale,
                DATE_FORMAT(fp.first_purchase, '%Y-%m-%d') AS first_purchase
           FROM products p
           LEFT JOIN product_categories pc ON pc.id = p.category_id
           LEFT JOIN (
             SELECT ii.product_id, SUM(ii.quantity) AS sold, SUM(ii.line_subtotal - COALESCE(ii.line_discount, 0)) AS revenue,
                    COUNT(DISTINCT i.id) AS bills
               FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
              WHERE i.company_id = ? AND ${LIVE_BILL} AND i.invoice_date >= ?
              GROUP BY ii.product_id
           ) s ON s.product_id = p.id
           LEFT JOIN (
             SELECT ii.product_id, MAX(i.invoice_date) AS last_sale
               FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
              WHERE i.company_id = ? AND ${LIVE_BILL} AND ii.quantity > 0
              GROUP BY ii.product_id
           ) ls ON ls.product_id = p.id
           LEFT JOIN (
             SELECT it.product_id, MIN(pb.bill_date) AS first_purchase
               FROM purchase_bill_items it JOIN purchase_bills pb ON pb.id = it.purchase_bill_id
              WHERE pb.company_id = ? AND pb.status NOT IN ('draft', 'cancelled')
              GROUP BY it.product_id
           ) fp ON fp.product_id = p.id
          WHERE p.company_id = ? AND ${TRACKED} AND p.status <> 'discontinued'`,
        [c, since, c, c, c]
      );
      const out = [];
      const sum: Record<string, { products: number; qty: number; value: number }> = {};
      for (const k of ["fast", "normal", "slow", "dead", "new", "restock"]) sum[k] = { products: 0, qty: 0, value: 0 };
      for (const r of rows as Row[]) {
        const stock = Number(r.stock) || 0;
        const sold = Number(r.sold) || 0;
        if (stock <= 0 && sold <= 0) continue;
        const perDay = sold > 0 ? sold / days : 0;
        const cover = perDay > 0 ? Math.round(Math.max(0, stock) / perDay) : null;
        const inSince = [String(r.added_on || ""), String(r.first_purchase || "")].filter(Boolean).sort()[0] || today;
        const age = dayDiff(today, inSince);
        let cls: string;
        if (sold > 0) cls = stock <= 0 ? "restock" : cover! <= 30 ? "fast" : cover! <= 90 ? "normal" : "slow";
        else cls = age >= days ? "dead" : "new";
        const cost = Number(r.purchase_price) || 0;
        const value = Math.max(0, stock) * cost;
        sum[cls].products++;
        sum[cls].qty += Math.max(0, stock);
        sum[cls].value += value;
        /* suggestion: keep ~30 days of stock for things that sell */
        const reorder = perDay > 0 ? Math.max(0, Math.ceil(perDay * 30 - Math.max(0, stock))) : 0;
        out.push({
          id: r.id, sku: r.sku, name: r.name, category_name: r.category_name, stock, sold, bills: Number(r.bills) || 0,
          revenue: r2(Number(r.revenue)), per_month: r2(perDay * 30), cover_days: cover, last_sale: r.last_sale || null,
          days_since_sale: r.last_sale ? dayDiff(today, String(r.last_sale)) : null, in_stock_since: inSince, class: cls,
          reorder, value: showCost ? r2(value) : null,
        });
      }
      const order: Record<string, number> = { restock: 0, fast: 1, normal: 2, slow: 3, dead: 4, new: 5 };
      out.sort((x, y) => order[x.class] - order[y.class] || y.sold - x.sold || (y.value || 0) - (x.value || 0));
      for (const k of Object.keys(sum)) sum[k].value = showCost ? r2(sum[k].value) : (null as unknown as number);
      return NextResponse.json({ data: out, summary: sum, days, since, show_cost: showCost });
    }

    /* ---------------- aged stock (FIFO: oldest units sold first) ---------------- */
    if (type === "aging") {
      const [prods] = await pool.query(
        `SELECT p.id, p.sku, p.name, p.purchase_price, pc.name AS category_name, ${STOCK_SQL} AS stock,
                COALESCE(p.opening_stock, 0) AS opening, DATE_FORMAT(p.created_at, '%Y-%m-%d') AS added_on
           FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
          WHERE p.company_id = ? AND ${TRACKED}`,
        [c]
      );
      const [ins] = await pool.query(
        `SELECT it.product_id, DATE_FORMAT(pb.bill_date, '%Y-%m-%d') AS d, SUM(it.quantity) AS q
           FROM purchase_bill_items it JOIN purchase_bills pb ON pb.id = it.purchase_bill_id
          WHERE pb.company_id = ? AND pb.status NOT IN ('draft', 'cancelled') AND it.quantity > 0
          GROUP BY it.product_id, pb.bill_date
         UNION ALL
         SELECT m.product_id, DATE_FORMAT(m.created_at, '%Y-%m-%d') AS d, SUM(m.qty) AS q
           FROM ${STOCK_TABLE} m
          WHERE m.company_id = ? AND m.qty > 0 AND m.move_type IN ('adjustment', 'exchange_in', 'sale_cancel')
          GROUP BY m.product_id, DATE_FORMAT(m.created_at, '%Y-%m-%d')`,
        [c, c]
      );
      const byP = new Map<number, { d: string; q: number }[]>();
      for (const r of ins as Row[]) {
        const k = Number(r.product_id);
        if (!byP.has(k)) byP.set(k, []);
        byP.get(k)!.push({ d: String(r.d), q: Number(r.q) || 0 });
      }
      const BK = [
        { key: "d0_30", label: "0–30 days", max: 30 },
        { key: "d31_60", label: "31–60 days", max: 60 },
        { key: "d61_90", label: "61–90 days", max: 90 },
        { key: "d91_180", label: "91–180 days", max: 180 },
        { key: "d181_365", label: "181–365 days", max: 365 },
        { key: "d365", label: "Over 1 year", max: Infinity },
      ];
      const totals: Record<string, { qty: number; value: number }> = {};
      for (const b of BK) totals[b.key] = { qty: 0, value: 0 };
      const data = [];
      for (const p of prods as Row[]) {
        let left = Number(p.stock) || 0;
        if (left <= 0) continue;
        const cost = Number(p.purchase_price) || 0;
        const layers = [...(byP.get(Number(p.id)) || [])];
        if (Number(p.opening) > 0) layers.push({ d: String(p.added_on || today), q: Number(p.opening) });
        layers.sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0)); // newest first
        const row: Record<string, number> = {};
        for (const b of BK) row[b.key] = 0;
        let oldest = 0;
        for (const l of layers) {
          if (left <= 0) break;
          const take = Math.min(left, l.q);
          if (take <= 0) continue;
          const age = Math.max(0, dayDiff(today, l.d));
          const b = BK.find((x) => age <= x.max)!;
          row[b.key] += take;
          oldest = Math.max(oldest, age);
          left -= take;
        }
        if (left > 0) {
          /* stock with no receipt record (older than the CRM) -> counted from when the product was added */
          const age = Math.max(0, dayDiff(today, String(p.added_on || today)));
          const b = BK.find((x) => age <= x.max)!;
          row[b.key] += left;
          oldest = Math.max(oldest, age);
        }
        for (const b of BK) {
          totals[b.key].qty += row[b.key];
          totals[b.key].value += row[b.key] * cost;
        }
        data.push({
          id: p.id, sku: p.sku, name: p.name, category_name: p.category_name, stock: Number(p.stock), oldest_days: oldest,
          ...row, value: showCost ? r2(Number(p.stock) * cost) : null,
        });
      }
      data.sort((x, y) => y.oldest_days - x.oldest_days || (y.value || 0) - (x.value || 0));
      for (const b of BK) totals[b.key].value = showCost ? r2(totals[b.key].value) : (null as unknown as number);
      return NextResponse.json({ data, buckets: BK.map(({ key, label }) => ({ key, label })), totals, show_cost: showCost });
    }

    /* ---------------- profit ---------------- */
    if (type === "profit") {
      if (!can(a, "sales.profit")) return NextResponse.json({ error: "You don't have permission to see profit." }, { status: 403 });
      const from = ymd(sp.get("from")) || `${today.slice(0, 8)}01`;
      const to = ymd(sp.get("to")) || today;
      const group = ["product", "invoice", "day", "category"].includes(String(sp.get("group"))) ? String(sp.get("group")) : "product";
      const [lines] = await pool.query(
        `SELECT ii.invoice_id, ii.product_id, ii.description, ii.quantity, ii.line_subtotal, COALESCE(ii.line_discount, 0) AS line_discount,
                ii.unit_cost, p.purchase_price, p.sku, p.name AS product_name, pc.name AS category_name,
                COALESCE(p.track_inventory, 1) AS ti, COALESCE(p.product_type, 'product') AS pt,
                i.invoice_number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS d, i.discount_total, cu.name AS customer_name
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id
           LEFT JOIN products p ON p.id = ii.product_id
           LEFT JOIN product_categories pc ON pc.id = p.category_id
           LEFT JOIN customers cu ON cu.id = i.customer_id
          WHERE i.company_id = ? AND ${LIVE_BILL} AND i.invoice_date BETWEEN ? AND ?`,
        [c, from, to]
      );
      /* order-level discount = bill discount − line discounts, spread over the bill's lines by value */
      const byInv = new Map<number, Row[]>();
      for (const l of lines as Row[]) {
        const k = Number(l.invoice_id);
        if (!byInv.has(k)) byInv.set(k, []);
        byInv.get(k)!.push(l);
      }
      type G = { key: string; label: string; sub: string; qty: number; revenue: number; cost: number; bills: Set<number>; missing: number };
      const groups = new Map<string, G>();
      let missingCost = 0;
      for (const [invId, ls] of byInv) {
        const lineDisc = ls.reduce((s, l) => s + Number(l.line_discount), 0);
        const orderDisc = Math.max(0, Number(ls[0].discount_total) - lineDisc);
        const base = ls.reduce((s, l) => s + Math.max(0, Number(l.line_subtotal) - Number(l.line_discount)), 0);
        for (const l of ls) {
          const net = Number(l.line_subtotal) - Number(l.line_discount);
          const share = base > 0 && net > 0 ? (orderDisc * net) / base : 0;
          const revenue = net - share;
          const q = Number(l.quantity) || 0;
          let unitCost = l.unit_cost === null || l.unit_cost === undefined ? null : Number(l.unit_cost);
          const costed = l.product_id && l.pt === "product" && Number(l.ti) === 1;
          if (costed && unitCost === null) unitCost = Number(l.purchase_price) || null;
          let miss = 0;
          if (costed && !(unitCost && unitCost > 0)) {
            miss = 1;
            missingCost++;
          }
          const cost = costed && unitCost ? q * unitCost : 0;
          let key: string, label: string, sub: string;
          if (group === "invoice") { key = String(invId); label = String(l.invoice_number); sub = `${l.d} · ${l.customer_name || ""}`; }
          else if (group === "day") { key = String(l.d); label = String(l.d); sub = ""; }
          else if (group === "category") { key = String(l.category_name || "Other"); label = key; sub = ""; }
          else { key = l.product_id ? `p${l.product_id}` : `d${String(l.description)}`; label = String(l.product_name || l.description); sub = String(l.sku || ""); }
          if (!groups.has(key)) groups.set(key, { key, label, sub, qty: 0, revenue: 0, cost: 0, bills: new Set(), missing: 0 });
          const g = groups.get(key)!;
          g.qty += q;
          g.revenue += revenue;
          g.cost += cost;
          g.bills.add(invId);
          g.missing += miss;
        }
      }
      const data = [...groups.values()].map((g) => ({
        key: g.key, label: g.label, sub: g.sub, qty: Math.round(g.qty * 1000) / 1000, bills: g.bills.size,
        revenue: r2(g.revenue), cost: r2(g.cost), profit: r2(g.revenue - g.cost),
        margin: g.revenue > 0 ? Math.round(((g.revenue - g.cost) / g.revenue) * 1000) / 10 : null, missing_cost: g.missing,
      }));
      if (group === "day" || group === "invoice") data.sort((x, y) => (x.label < y.label ? 1 : -1));
      else data.sort((x, y) => y.profit - x.profit);
      const tot = data.reduce((s, d) => ({ revenue: s.revenue + d.revenue, cost: s.cost + d.cost }), { revenue: 0, cost: 0 });
      return NextResponse.json({
        data, from, to, group, missing_cost_lines: missingCost,
        totals: { revenue: r2(tot.revenue), cost: r2(tot.cost), profit: r2(tot.revenue - tot.cost), bills: byInv.size,
                  margin: tot.revenue > 0 ? Math.round(((tot.revenue - tot.cost) / tot.revenue) * 1000) / 10 : null },
      });
    }
    return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  } catch (err) {
    console.error("[GET /api/inventory/reports]", err);
    return NextResponse.json({ error: "Unable to build the report." }, { status: 500 });
  }
}
