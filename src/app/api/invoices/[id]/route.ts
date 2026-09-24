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
      `SELECT i.*, c.name AS customer_name, so.order_number AS so_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    if (!header) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const items = await query<any[]>(
      `SELECT id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
              line_subtotal, line_tax, line_discount, line_total
         FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC`,
      [id]
    );
    return NextResponse.json({ data: { ...header, items } });
  } catch (err) {
    console.error("[GET /api/invoices/:id]", err);
    return NextResponse.json({ error: "Unable to load invoice." }, { status: 500 });
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
    const invoice_date = String(body.invoice_date || "").slice(0, 10);
    const due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
    const status = String(body.status || "unpaid");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    if (!customer_id || !invoice_date || !items.length) {
      return NextResponse.json({ error: "Customer, date and at least one item are required." }, { status: 400 });
    }
    const [existing] = await query<any[]>(
      "SELECT id, paid_amount FROM invoices WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

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

    // recompute balance from existing paid_amount
    const paid = Number(existing.paid_amount ?? 0);
    const balance = Math.max(0, grand_total - paid);

    // if user manually set status to paid/unpaid, respect it; else derive
    let derivedStatus = status;
    if (!["draft", "cancelled"].includes(status)) {
      if (paid >= grand_total && grand_total > 0) derivedStatus = "paid";
      else if (paid > 0) derivedStatus = "partially_paid";
      else derivedStatus = "unpaid";
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE invoices SET customer_id = ?, invoice_date = ?, due_date = ?, status = ?,
         subtotal = ?, tax_total = ?, discount_total = ?, grand_total = ?,
         balance = ?, notes = ?, terms = ?
       WHERE id = ? AND company_id = ?`,
      [customer_id, invoice_date, due_date, derivedStatus,
       subtotal, tax_total, discount_total, grand_total,
       balance, notes, terms, id, companyId]
    );
    await conn.query("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
    for (const p of prepared) {
      await conn.query(
        `INSERT INTO invoice_items
           (invoice_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }
    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT i.*, c.name AS customer_name, so.order_number AS so_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ?`,
      [id, companyId]
    );
    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[PUT /api/invoices/:id]", err);
    return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
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
      "SELECT id FROM invoices WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    // Block delete if any cleared payments exist
    const [pay] = await query<any[]>(
      "SELECT COUNT(*) AS cnt FROM customer_payments WHERE invoice_id = ? AND company_id = ? AND status = 'cleared'",
      [id, companyId]
    );
    if ((pay?.cnt ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${pay.cnt} cleared payment(s) are linked to this invoice.` },
        { status: 409 }
      );
    }

    await query("DELETE FROM invoices WHERE id = ? AND company_id = ?", [id, companyId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/invoices/:id]", err);
    return NextResponse.json({ error: "Failed to delete invoice." }, { status: 500 });
  }
}
