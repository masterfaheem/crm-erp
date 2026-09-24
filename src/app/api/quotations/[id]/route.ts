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
      `SELECT q.*, c.name AS customer_name FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.id = ? AND q.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    if (!header) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

    const items = await query<any[]>(
      `SELECT id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
              line_subtotal, line_tax, line_discount, line_total
         FROM quotation_items WHERE quotation_id = ? ORDER BY id ASC`,
      [id]
    );
    return NextResponse.json({ data: { ...header, items } });
  } catch (err) {
    console.error("[GET /api/quotations/:id]", err);
    return NextResponse.json({ error: "Unable to load quotation." }, { status: 500 });
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
    const quote_date = String(body.quote_date || "").slice(0, 10);
    const valid_until = body.valid_until ? String(body.valid_until).slice(0, 10) : null;
    const status = String(body.status || "draft");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    if (!customer_id || !quote_date || !items.length) {
      return NextResponse.json({ error: "Customer, date and at least one item are required." }, { status: 400 });
    }
    const [existing] = await query<any[]>(
      "SELECT id FROM quotations WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

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
      `UPDATE quotations SET customer_id = ?, quote_date = ?, valid_until = ?, status = ?,
         subtotal = ?, tax_total = ?, discount_total = ?, grand_total = ?, notes = ?, terms = ?
       WHERE id = ? AND company_id = ?`,
      [customer_id, quote_date, valid_until, status,
       subtotal, tax_total, discount_total, grand_total, notes, terms, id, companyId]
    );
    await conn.query("DELETE FROM quotation_items WHERE quotation_id = ?", [id]);
    for (const p of prepared) {
      await conn.query(
        `INSERT INTO quotation_items
           (quotation_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }
    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT q.*, c.name AS customer_name FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.id = ? AND q.company_id = ?`,
      [id, companyId]
    );
    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[PUT /api/quotations/:id]", err);
    return NextResponse.json({ error: "Failed to update quotation." }, { status: 500 });
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
      "SELECT id FROM quotations WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    await query("DELETE FROM quotations WHERE id = ? AND company_id = ?", [id, companyId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/quotations/:id]", err);
    return NextResponse.json({ error: "Failed to delete quotation." }, { status: 500 });
  }
}
