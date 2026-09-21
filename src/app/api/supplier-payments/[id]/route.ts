import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

async function requireUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, company_id FROM users
     WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/supplier-payments/[id]
============================================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT sp.*, s.name AS supplier_name, s.supplier_code
       FROM supplier_payments sp
       LEFT JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.id = ? AND sp.company_id = ?
       LIMIT 1`,
      [id, authUser.company_id]
    );
    const payment = (rows as any[])[0];
    if (!payment)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    return NextResponse.json(payment);
  } catch (err) {
    console.error("GET /api/supplier-payments/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/supplier-payments/[id]
============================================================ */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const [existingRows] = await conn.query(
      `SELECT * FROM supplier_payments
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    const supplierId =
      body.supplier_id !== undefined
        ? Number(body.supplier_id)
        : existing.supplier_id;
    const amount =
      body.amount !== undefined ? Number(body.amount) : Number(existing.amount);
    const paymentDate = body.payment_date ?? existing.payment_date;

    if (!supplierId || !amount || amount <= 0)
      return NextResponse.json(
        { error: "Supplier and a positive amount are required" },
        { status: 400 }
      );

    await conn.beginTransaction();

    /* ---- Reverse old balance impact ---- */
    await conn.query(
      `UPDATE suppliers
       SET current_balance = current_balance + ?
       WHERE id = ? AND company_id = ?`,
      [existing.amount, existing.supplier_id, authUser.company_id]
    );

    await conn.query(
      `UPDATE supplier_payments SET
        supplier_id = ?, payment_date = ?, amount = ?,
        payment_method = ?, reference_number = ?,
        bank_name = ?, cheque_number = ?, cheque_date = ?,
        notes = ?, status = ?
       WHERE id = ? AND company_id = ?`,
      [
        supplierId,
        paymentDate,
        amount,
        body.payment_method ?? existing.payment_method,
        body.reference_number !== undefined
          ? body.reference_number
            ? String(body.reference_number).trim()
            : null
          : existing.reference_number,
        body.bank_name !== undefined
          ? body.bank_name
            ? String(body.bank_name).trim()
            : null
          : existing.bank_name,
        body.cheque_number !== undefined
          ? body.cheque_number
            ? String(body.cheque_number).trim()
            : null
          : existing.cheque_number,
        body.cheque_date !== undefined
          ? body.cheque_date
          : existing.cheque_date,
        body.notes !== undefined
          ? body.notes
            ? String(body.notes).trim()
            : null
          : existing.notes,
        body.status ?? existing.status,
        id,
        authUser.company_id,
      ]
    );

    /* ---- Apply new balance impact ---- */
    await conn.query(
      `UPDATE suppliers
       SET current_balance = current_balance - ?
       WHERE id = ? AND company_id = ?`,
      [amount, supplierId, authUser.company_id]
    );

    await conn.commit();
    return NextResponse.json({ message: "Payment updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/supplier-payments/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/supplier-payments/[id]
============================================================ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [existingRows] = await conn.query(
      `SELECT * FROM supplier_payments
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    await conn.beginTransaction();

    await conn.query(
      `UPDATE suppliers
       SET current_balance = current_balance + ?
       WHERE id = ? AND company_id = ?`,
      [existing.amount, existing.supplier_id, authUser.company_id]
    );

    await conn.query(
      `DELETE FROM supplier_payments WHERE id = ? AND company_id = ?`,
      [id, authUser.company_id]
    );

    await conn.commit();
    return NextResponse.json({ message: "Payment deleted successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("DELETE /api/supplier-payments/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}