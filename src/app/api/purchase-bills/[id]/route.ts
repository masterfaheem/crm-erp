import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const [header] = await query<any[]>(
      `SELECT pb.*, s.name AS supplier_name, po.po_number
         FROM purchase_bills pb
         LEFT JOIN suppliers s ON s.id = pb.supplier_id
         LEFT JOIN purchase_orders po ON po.id = pb.purchase_order_id
        WHERE pb.id = ? AND pb.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    if (!header) return NextResponse.json({ error: "Purchase bill not found." }, { status: 404 });

    const items = await query<any[]>(
      `SELECT id, product_id, description, quantity,
              unit_price, tax_rate, discount_percent,
              line_subtotal, line_tax, line_discount, line_total
         FROM purchase_bill_items
        WHERE purchase_bill_id = ?
        ORDER BY id ASC`,
      [id]
    );

    return NextResponse.json({ data: { ...header, items } });
  } catch (err) {
    console.error("[GET /api/purchase-bills/:id]", err);
    return NextResponse.json({ error: "Unable to load purchase bill." }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => ({}));

    const supplier_id = Number(body.supplier_id);
    const supplier_invoice = body.supplier_invoice ? String(body.supplier_invoice).trim() : null;
    const purchase_order_id = body.purchase_order_id ? Number(body.purchase_order_id) : null;
    const bill_date = String(body.bill_date || "").slice(0, 10);
    const due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
    const status = String(body.status || "unpaid");
    const notes = body.notes ? String(body.notes).trim() : null;
    const paid_amount = Number(body.paid_amount) || 0;

    const items: Array<{
      product_id: number | null;
      description: string;
      quantity: number;
      unit_price: number;
      tax_rate: number;
      discount_percent: number;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!supplier_id || !bill_date || !items.length) {
      return NextResponse.json(
        { error: "Supplier, bill date and at least one line item are required." },
        { status: 400 }
      );
    }

    const [existing] = await query<any[]>(
      "SELECT id FROM purchase_bills WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Purchase bill not found." }, { status: 404 });

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
      subtotal += sub;
      discount_total += line_discount;
      tax_total += line_tax;
      grand_total += line_total;
      return {
        product_id: it.product_id ?? null,
        description: String(it.description || "").trim(),
        quantity: qty, unit_price: price,
        tax_rate: tax, discount_percent: disc,
        line_subtotal: sub, line_tax, line_discount, line_total,
      };
    });

    const balance = Math.max(0, grand_total - paid_amount);

    await conn.beginTransaction();

    await conn.query(
      `UPDATE purchase_bills SET
         supplier_invoice = ?, supplier_id = ?, purchase_order_id = ?,
         bill_date = ?, due_date = ?, status = ?,
         subtotal = ?, tax_total = ?, discount_total = ?, grand_total = ?,
         paid_amount = ?, balance = ?, notes = ?
       WHERE id = ? AND company_id = ?`,
      [
        supplier_invoice, supplier_id, purchase_order_id,
        bill_date, due_date, status,
        subtotal, tax_total, discount_total, grand_total,
        paid_amount, balance, notes, id, companyId,
      ]
    );

    await conn.query("DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?", [id]);

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO purchase_bill_items
           (purchase_bill_id, product_id, description, quantity,
            unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, p.product_id, p.description, p.quantity,
          p.unit_price, p.tax_rate, p.discount_percent,
          p.line_subtotal, p.line_tax, p.line_discount, p.line_total,
        ]
      );
    }

    await conn.commit();
    conn.release();

    const [row] = await query<any[]>(
      `SELECT pb.*, s.name AS supplier_name
         FROM purchase_bills pb
         LEFT JOIN suppliers s ON s.id = pb.supplier_id
        WHERE pb.id = ? AND pb.company_id = ?`,
      [id, companyId]
    );

    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    conn.release();
    console.error("[PUT /api/purchase-bills/:id]", err);
    return NextResponse.json({ error: "Failed to update purchase bill." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const [existing] = await query<any[]>(
      "SELECT id FROM purchase_bills WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Purchase bill not found." }, { status: 404 });

    await query("DELETE FROM purchase_bills WHERE id = ? AND company_id = ?", [id, companyId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/purchase-bills/:id]", err);
    return NextResponse.json({ error: "Failed to delete purchase bill." }, { status: 500 });
  }
}
