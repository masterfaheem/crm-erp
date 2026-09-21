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
    `SELECT id, company_id, branch_id FROM users
     WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

async function generatePaymentNumber(conn: any, companyId: number) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM supplier_payments WHERE company_id = ?`,
    [companyId]
  );
  const next = ((rows as any[])[0].cnt as number) + 1;
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `SPAY-${ym}-${String(next).padStart(4, "0")}`;
}

/* ============================================================
   GET /api/supplier-payments
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const supplierId = searchParams.get("supplier_id")?.trim() || "";
    const method = searchParams.get("method")?.trim() || "";
    const dateFrom = searchParams.get("date_from")?.trim() || "";
    const dateTo = searchParams.get("date_to")?.trim() || "";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["sp.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(sp.payment_number LIKE ? OR sp.reference_number LIKE ?
          OR s.name LIKE ? OR s.supplier_code LIKE ? OR sp.notes LIKE ?)`
      );
      const t = `%${search}%`;
      params.push(t, t, t, t, t);
    }
    if (supplierId) {
      where.push("sp.supplier_id = ?");
      params.push(Number(supplierId));
    }
    if (method) {
      where.push("sp.payment_method = ?");
      params.push(method);
    }
    if (dateFrom) {
      where.push("sp.payment_date >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("sp.payment_date <= ?");
      params.push(dateTo);
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM supplier_payments sp
       LEFT JOIN suppliers s ON s.id = sp.supplier_id
       WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    const [rows] = await pool.query(
      `SELECT
        sp.id,
        sp.payment_number,
        sp.payment_date,
        sp.amount,
        sp.payment_method,
        sp.reference_number,
        sp.bank_name,
        sp.cheque_number,
        sp.cheque_date,
        sp.notes,
        sp.status,
        sp.created_at,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.supplier_code,
        u.name AS paid_by_name
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN users u ON u.id = sp.paid_by
      WHERE ${whereSql}
      ORDER BY sp.payment_date DESC, sp.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [sumRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount
       FROM supplier_payments sp
       WHERE sp.company_id = ?`,
      [authUser.company_id]
    );
    const totalAmount = (sumRows as any[])[0].total_amount as number;

    return NextResponse.json({
      data: rows,
      total_amount: totalAmount,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /api/supplier-payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/supplier-payments
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const supplierId = Number(body.supplier_id);
    const amount = Number(body.amount);
    const paymentDate = body.payment_date || null;

    if (!supplierId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "Supplier and a positive amount are required" },
        { status: 400 }
      );
    }
    if (!paymentDate) {
      return NextResponse.json(
        { error: "Payment date is required" },
        { status: 400 }
      );
    }

    const [supRows] = await conn.query(
      `SELECT id, name FROM suppliers
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [supplierId, authUser.company_id]
    );
    if (!(supRows as any[]).length)
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );

    await conn.beginTransaction();
    const paymentNumber = await generatePaymentNumber(conn, authUser.company_id);

    const [result] = await conn.query(
      `INSERT INTO supplier_payments
        (company_id, supplier_id, purchase_bill_id, payment_number,
         payment_date, amount, payment_method, reference_number,
         bank_name, cheque_number, cheque_date, notes, status, paid_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        supplierId,
        body.purchase_bill_id ? Number(body.purchase_bill_id) : null,
        paymentNumber,
        paymentDate,
        amount,
        body.payment_method || "cash",
        body.reference_number ? String(body.reference_number).trim() : null,
        body.bank_name ? String(body.bank_name).trim() : null,
        body.cheque_number ? String(body.cheque_number).trim() : null,
        body.cheque_date || null,
        body.notes ? String(body.notes).trim() : null,
        body.status || "completed",
        authUser.id,
      ]
    );
    const paymentId = (result as any).insertId as number;

    /* ---- Adjust supplier balance (payments reduce what we owe) ---- */
    await conn.query(
      `UPDATE suppliers
       SET current_balance = current_balance - ?
       WHERE id = ? AND company_id = ?`,
      [amount, supplierId, authUser.company_id]
    );

    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
      const ua = req.headers.get("user-agent") || null;
      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES (?, ?, 'create', 'supplier_payment', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          paymentId,
          JSON.stringify({ supplier_id: supplierId, amount, paymentNumber }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();
    return NextResponse.json(
      {
        message: "Payment recorded successfully",
        id: paymentId,
        payment_number: paymentNumber,
      },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/supplier-payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}