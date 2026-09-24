import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

async function nextSalesOrderNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await query<Array<{ c: number }>>(
    "SELECT COUNT(*) AS c FROM sales_orders WHERE company_id = ? AND YEAR(created_at) = ?",
    [companyId, year]
  );
  const seq = (row?.c ?? 0) + 1;
  return `SO-${year}-${String(seq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const customerId = (searchParams.get("customer_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["so.company_id = ?"];
    const params: any[] = [companyId];
    if (search) { where.push("(so.order_number LIKE ? OR c.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (status) { where.push("so.status = ?"); params.push(status); }
    if (customerId && Number.isFinite(Number(customerId))) { where.push("so.customer_id = ?"); params.push(Number(customerId)); }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM sales_orders so LEFT JOIN customers c ON c.id = so.customer_id ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT so.id, so.order_number, so.customer_id, c.name AS customer_name,
              so.order_date, so.delivery_date, so.status,
              so.subtotal, so.tax_total, so.discount_total, so.shipping_total, so.grand_total,
              so.notes, so.created_at,
              COALESCE(items.cnt, 0) AS item_count
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
         LEFT JOIN (
           SELECT sales_order_id, COUNT(*) AS cnt FROM sales_order_items GROUP BY sales_order_id
         ) items ON items.sales_order_id = so.id
         ${whereSql}
         ORDER BY so.created_at DESC, so.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_orders }] = await query<Array<{ total_orders: number }>>(
      "SELECT COUNT(*) AS total_orders FROM sales_orders WHERE company_id = ?",
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_orders,
    });
  } catch (err) {
    console.error("[GET /api/sales-orders]", err);
    return NextResponse.json({ error: "Unable to load sales orders." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => ({}));
    const customer_id = Number(body.customer_id);
    const order_date = String(body.order_date || "").slice(0, 10);
    const delivery_date = body.delivery_date ? String(body.delivery_date).slice(0, 10) : null;
    const status = String(body.status || "draft");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const quotation_id = body.quotation_id ? Number(body.quotation_id) : null;

    const items: Array<{
      product_id: number | null; description: string;
      quantity: number; unit_price: number; tax_rate: number; discount_percent: number;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!customer_id) return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    if (!order_date) return NextResponse.json({ error: "Order date is required." }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });

    let subtotal = 0, tax_total = 0, discount_total = 0, grand_total = 0;
    const prepared = items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const tax = Number(it.tax_rate) || 0;
      const disc = Number(it.discount_percent) || 0;
      const sub = qty * price;
      const line_discount = (sub * disc) / 100;
      const afterDisc = sub - line_discount;
      const line_tax = (afterDisc * tax) / 100;
      const line_total = afterDisc + line_tax;
      subtotal += sub; discount_total += line_discount; tax_total += line_tax; grand_total += line_total;
      return {
        product_id: it.product_id ?? null,
        description: String(it.description || "").trim(),
        quantity: qty, unit_price: price, tax_rate: tax, discount_percent: disc,
        line_subtotal: sub, line_tax, line_discount, line_total,
      };
    });

    await conn.beginTransaction();
    const order_number = await nextSalesOrderNumber(companyId);

    const [ins] = await conn.query<any>(
      `INSERT INTO sales_orders
         (company_id, branch_id, order_number, customer_id, quotation_id, order_date, delivery_date,
          status, subtotal, tax_total, discount_total, shipping_total, grand_total,
          notes, terms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        companyId, user.branch_id ?? null, order_number, customer_id, quotation_id, order_date, delivery_date,
        status, subtotal, tax_total, discount_total, grand_total, notes, terms, user.id,
      ]
    );
    const orderId = ins.insertId;

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO sales_order_items
           (sales_order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }

    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT so.*, c.name AS customer_name FROM sales_orders so
        LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = ? AND so.company_id = ?`,
      [orderId, companyId]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[POST /api/sales-orders]", err);
    return NextResponse.json({ error: "Failed to create sales order." }, { status: 500 });
  }
}
