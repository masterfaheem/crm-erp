import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { ensureLedgerReady } from "@/lib/ledgerSetup";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { nextCustomerPaymentNumber, recalcCustomer, recalcInvoice } from "@/lib/ledger";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  await ensureLedgerReady().catch((e) => console.error("ledger setup", e));
  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const method = (searchParams.get("method") || "").trim();
    const customerId = (searchParams.get("customer_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["cp.company_id = ?"];
    const params: any[] = [companyId];
    if (search) {
      where.push("(cp.payment_number LIKE ? OR cp.reference LIKE ? OR c.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push("cp.status = ?"); params.push(status); }
    if (method) { where.push("cp.method = ?"); params.push(method); }
    if (customerId && Number.isFinite(Number(customerId))) {
      where.push("cp.customer_id = ?"); params.push(Number(customerId));
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM customer_payments cp
        LEFT JOIN customers c ON c.id = cp.customer_id ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT cp.*, c.name AS customer_name, i.invoice_number
         FROM customer_payments cp
         LEFT JOIN customers c ON c.id = cp.customer_id
         LEFT JOIN invoices  i ON i.id = cp.invoice_id
         ${whereSql}
         ORDER BY cp.created_at DESC, cp.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_payments }] = await query<Array<{ total_payments: number }>>(
      "SELECT COUNT(*) AS total_payments FROM customer_payments WHERE company_id = ?",
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_payments,
    });
  } catch (err) {
    console.error("[GET /api/customer-payments]", err);
    return NextResponse.json({ error: "Unable to load payments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;

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

    if (!customer_id) { conn.release(); return NextResponse.json({ error: "Customer is required." }, { status: 400 }); }
    if (!payment_date) { conn.release(); return NextResponse.json({ error: "Payment date is required." }, { status: 400 }); }
    if (!amount || amount <= 0) { conn.release(); return NextResponse.json({ error: "Amount must be > 0." }, { status: 400 }); }

    await conn.beginTransaction();
    const payment_number = await nextCustomerPaymentNumber(conn, companyId);

    const [ins] = await conn.query<any>(
      `INSERT INTO customer_payments
         (company_id, branch_id, payment_number, customer_id, invoice_id, payment_date, amount,
          method, reference, bank_name, cheque_number, cheque_date, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId, user.branch_id ?? null, payment_number, customer_id, invoice_id, payment_date, amount,
        method, reference, bank_name, cheque_number, cheque_date, status, notes, user.id,
      ]
    );
    const paymentId = ins.insertId;

    if (invoice_id) await recalcInvoice(conn, invoice_id, companyId);
    else await recalcCustomer(conn, companyId, customer_id);

    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT cp.*, c.name AS customer_name, i.invoice_number
         FROM customer_payments cp
         LEFT JOIN customers c ON c.id = cp.customer_id
         LEFT JOIN invoices  i ON i.id = cp.invoice_id
        WHERE cp.id = ? AND cp.company_id = ?`,
      [paymentId, companyId]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[POST /api/customer-payments]", err);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
