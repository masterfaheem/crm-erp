import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const [header] = await query<any[]>(
      `SELECT so.*, c.name AS customer_name FROM sales_orders so
        LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = ? AND so.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    if (!header) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });

    const items = await query<any[]>(
      `SELECT id, product_id, description, quantity, delivered_qty, unit_price, tax_rate, discount_percent,
              line_subtotal, line_tax, line_discount, line_total
         FROM sales_order_items WHERE sales_order_id = ? ORDER BY id ASC`,
      [id]
    );
    return NextResponse.json({ data: { ...header, items } });
  } catch (err) {
    console.error("[GET /api/sales-orders/:id]", err);
    return NextResponse.json({ error: "Unable to load sales order." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const pool = getPool(); const conn = await pool.getConnection();
  try {
    const body = await req.json().catch(() => ({}));
    const customer_id = Number(body.customer_id);
    const order_date = String(body.order_date || "").slice(0, 10);
    const delivery_date = body.delivery_date ? String(body.delivery_date).slice(0, 10) : null;
    const status = String(body.status || "draft");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    if (!customer_id || !order_date || !items.length) {
      return NextResponse.json({ error: "Customer, date and at least one item are required." }, { status: 400 });
    }
    const [existing] = await query<any[]>(
      "SELECT id FROM sales_orders WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });

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
    await conn.query(
      `UPDATE sales_orders SET customer_id = ?, order_date = ?, delivery_date = ?, status = ?,
         subtotal = ?, tax_total = ?, discount_total = ?, grand_total = ?, notes = ?, terms = ?
       WHERE id = ? AND company_id = ?`,
      [customer_id, order_date, delivery_date, status,
       subtotal, tax_total, discount_total, grand_total, notes, terms, id, companyId]
    );
    await conn.query("DELETE FROM sales_order_items WHERE sales_order_id = ?", [id]);
    for (const p of prepared) {
      await conn.query(
        `INSERT INTO sales_order_items
           (sales_order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }
    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT so.*, c.name AS customer_name FROM sales_orders so
        LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = ? AND so.company_id = ?`,
      [id, companyId]
    );
    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[PUT /api/sales-orders/:id]", err);
    return NextResponse.json({ error: "Failed to update sales order." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const [existing] = await query<any[]>(
      "SELECT id FROM sales_orders WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    await query("DELETE FROM sales_orders WHERE id = ? AND company_id = ?", [id, companyId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/sales-orders/:id]", err);
    return NextResponse.json({ error: "Failed to delete sales order." }, { status: 500 });
  }
}
