import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

async function recalcInvoice(conn: any, invoiceId: number, companyId: number) {
  const [sum] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM customer_payments
      WHERE company_id = ? AND invoice_id = ? AND status = 'cleared'`,
    [companyId, invoiceId]
  ) as any[];
  const paid = Number(sum?.paid ?? 0);
  const [inv] = await conn.query(
    "SELECT grand_total FROM invoices WHERE id = ? AND company_id = ?",
    [invoiceId, companyId]
  ) as any[];
  const total = Number(inv?.grand_total ?? 0);
  const balance = Math.max(0, total - paid);
  let status = "unpaid";
  if (paid >= total && total > 0) status = "paid";
  else if (paid > 0) status = "partially_paid";
  await conn.query(
    "UPDATE invoices SET paid_amount = ?, balance = ?, status = ? WHERE id = ? AND company_id = ?",
    [paid, balance, status, invoiceId, companyId]
  );
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
    const payment_date = String(body.payment_date || "").slice(0, 10);
    const amount = Number(body.amount) || 0;
    const method = String(body.method || "cash");
    const reference = body.reference ? String(body.reference).trim() : null;
    const bank_name = body.bank_name ? String(body.bank_name).trim() : null;
    const cheque_number = body.cheque_number ? String(body.cheque_number).trim() : null;
    const cheque_date = body.cheque_date ? String(body.cheque_date).slice(0, 10) : null;
    const status = String(body.status || "cleared");
    const notes = body.notes ? String(body.notes).trim() : null;
    const invoice_id = body.invoice_id ? Number(body.invoice_id) : null;

    const [existing] = await query<any[]>(
      "SELECT id, invoice_id FROM customer_payments WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    await conn.beginTransaction();
    await conn.query(
      `UPDATE customer_payments SET
         customer_id = ?, invoice_id = ?, payment_date = ?, amount = ?,
         method = ?, reference = ?, bank_name = ?, cheque_number = ?, cheque_date = ?,
         status = ?, notes = ?
       WHERE id = ? AND company_id = ?`,
      [customer_id, invoice_id, payment_date, amount, method, reference, bank_name,
       cheque_number, cheque_date, status, notes, id, companyId]
    );

    // Recalc both old and new invoice
    if (existing.invoice_id) await recalcInvoice(conn, existing.invoice_id, companyId);
    if (invoice_id && invoice_id !== existing.invoice_id) await recalcInvoice(conn, invoice_id, companyId);

    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT cp.*, c.name AS customer_name, i.invoice_number
         FROM customer_payments cp
         LEFT JOIN customers c ON c.id = cp.customer_id
         LEFT JOIN invoices  i ON i.id = cp.invoice_id
        WHERE cp.id = ? AND cp.company_id = ?`,
      [id, companyId]
    );
    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[PUT /api/customer-payments/:id]", err);
    return NextResponse.json({ error: "Failed to update payment." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const pool = getPool(); const conn = await pool.getConnection();
  try {
    const [existing] = await query<any[]>(
      "SELECT id, invoice_id FROM customer_payments WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    await conn.beginTransaction();
    await conn.query("DELETE FROM customer_payments WHERE id = ? AND company_id = ?", [id, companyId]);
    if (existing.invoice_id) await recalcInvoice(conn, existing.invoice_id, companyId);
    await conn.commit(); conn.release();

    return NextResponse.json({ success: true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[DELETE /api/customer-payments/:id]", err);
    return NextResponse.json({ error: "Failed to delete payment." }, { status: 500 });
  }
}
