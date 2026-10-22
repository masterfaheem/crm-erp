import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ensureStockTable, STOCK_SQL, STOCK_TABLE } from "@/lib/ledger";

/* Live stock = opening stock + purchases − sales ± adjustments */
const HEALTH_SQL = `CASE
  WHEN COALESCE(x.track_inventory, 1) = 0 THEN 'untracked'
  WHEN x.current_stock <= 0 THEN 'out'
  WHEN COALESCE(x.reorder_level, 0) > 0 AND x.current_stock <= x.reorder_level THEN 'low'
  WHEN COALESCE(x.min_stock, 0) > 0 AND x.current_stock <= x.min_stock THEN 'low'
  WHEN COALESCE(x.max_stock, 0) > 0 AND x.current_stock > x.max_stock THEN 'overstock'
  ELSE 'healthy' END`;

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;

  try {
    await ensureStockTable();
    const sp = new URL(req.url).searchParams;
    const search = (sp.get("search") || "").trim();
    const categoryId = Number(sp.get("category_id") || 0);
    const productType = (sp.get("product_type") || "").trim();
    const health = (sp.get("health") || "").trim();
    const page = Math.max(1, Number(sp.get("page") || 1));
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["p.company_id = ?"];
    const params: (string | number)[] = [companyId];
    if (search) {
      where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (categoryId) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }
    if (productType) {
      where.push("p.product_type = ?");
      params.push(productType);
    }

    const base = `
      SELECT p.id, p.sku, p.barcode, p.name, p.description, p.product_type,
             ${STOCK_SQL} AS current_stock,
             p.opening_stock, p.min_stock, p.max_stock, p.reorder_level,
             p.purchase_price, p.sale_price, p.status, p.track_inventory,
             p.category_id, c.name AS category_name, c.color AS category_color,
             p.unit_id, u.name AS unit_name, u.short_name AS unit_short_name,
             COALESCE((SELECT MAX(m.created_at) FROM ${STOCK_TABLE} m
                        WHERE m.product_id = p.id AND m.company_id = p.company_id), p.created_at) AS last_updated
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id AND c.company_id = p.company_id
        LEFT JOIN units u ON u.id = p.unit_id AND u.company_id = p.company_id
       WHERE ${where.join(" AND ")}`;

    const wrapped = `SELECT x.*, ${HEALTH_SQL} AS health,
                            ROUND(GREATEST(x.current_stock, 0) * COALESCE(x.purchase_price, 0), 2) AS stock_value
                       FROM (${base}) x`;
    const filtered = health ? `SELECT * FROM (${wrapped}) y WHERE y.health = ?` : wrapped;
    const fParams = health ? [...params, health] : params;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM (${filtered}) z`,
      fParams
    );
    const rows = await query<Record<string, unknown>[]>(
      `SELECT * FROM (${filtered}) z ORDER BY
         FIELD(z.health, 'out', 'low', 'healthy', 'overstock', 'untracked'), z.name
       LIMIT ? OFFSET ?`,
      [...fParams, limit, offset]
    );

    /* KPIs for the whole catalogue (ignores filters) */
    const [k] = await query<Record<string, unknown>[]>(
      `SELECT COUNT(*) AS total_products,
              COALESCE(SUM(CASE WHEN t.health <> 'untracked' THEN GREATEST(t.current_stock, 0) ELSE 0 END), 0) AS total_stock_qty,
              COALESCE(SUM(CASE WHEN t.health <> 'untracked' THEN t.stock_value ELSE 0 END), 0) AS total_stock_value,
              SUM(t.health = 'low') AS low_stock_count,
              SUM(t.health = 'out') AS out_of_stock_count,
              SUM(t.health = 'healthy') AS healthy_count
         FROM (SELECT x.*, ${HEALTH_SQL} AS health,
                      ROUND(GREATEST(x.current_stock, 0) * COALESCE(x.purchase_price, 0), 2) AS stock_value
                 FROM (${base.replace(`WHERE ${where.join(" AND ")}`, "WHERE p.company_id = ? AND COALESCE(p.product_type, 'product') = 'product'")}) x) t`,
      [companyId]
    );

    const num = (v: unknown) => Number(v) || 0;
    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        current_stock: num(r.current_stock),
        stock_value: num(r.stock_value),
        track_inventory: num(r.track_inventory ?? 1) === 1,
      })),
      pagination: { page, limit, total: num(total), total_pages: Math.ceil(num(total) / limit) || 0 },
      kpis: {
        total_products: num(k?.total_products),
        total_stock_qty: num(k?.total_stock_qty),
        total_stock_value: num(k?.total_stock_value),
        low_stock_count: num(k?.low_stock_count),
        out_of_stock_count: num(k?.out_of_stock_count),
        healthy_count: num(k?.healthy_count),
      },
    });
  } catch (err) {
    console.error("[GET /api/inventory/stock]", err);
    return NextResponse.json({ error: "Unable to load stock levels." }, { status: 500 });
  }
}
