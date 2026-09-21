import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ============================================================
   AUTH
============================================================ */
async function requireUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, company_id, branch_id, name, email
     FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

async function generateSupplierCode(conn: any, companyId: number) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM suppliers WHERE company_id = ?`,
    [companyId]
  );
  const next = ((rows as any[])[0].cnt as number) + 1;
  return `SUP-${String(next).padStart(4, "0")}`;
}

/* ============================================================
   GET /api/suppliers
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const all = searchParams.get("all") === "1";

    const page = all
      ? 1
      : Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = all
      ? 1000
      : Math.min(
          200,
          Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
        );
    const offset = all ? 0 : (page - 1) * limit;

    const where: string[] = ["s.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(s.name LIKE ? OR s.company_name LIKE ? OR s.email LIKE ?
          OR s.phone LIKE ? OR s.supplier_code LIKE ? OR s.tax_number LIKE ?)`
      );
      const t = `%${search}%`;
      params.push(t, t, t, t, t, t);
    }
    if (status) {
      where.push("s.status = ?");
      params.push(status);
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM suppliers s WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    const [rows] = await pool.query(
      `SELECT
        s.id,
        s.supplier_code,
        s.supplier_type,
        s.name,
        s.company_name,
        s.designation,
        s.email,
        s.phone,
        s.whatsapp,
        s.tax_number,
        s.address,
        s.city,
        s.state,
        s.country,
        s.opening_balance,
        s.balance_type,
        s.current_balance,
        s.currency_code,
        s.bank_name,
        s.bank_account_name,
        s.bank_account_number,
        s.bank_iban,
        s.payment_terms,
        s.status,
        s.notes,
        s.created_at
      FROM suppliers s
      WHERE ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /api/suppliers error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/suppliers
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    if (body.tax_number && String(body.tax_number).trim()) {
      const [dup] = await conn.query(
        `SELECT id FROM suppliers
         WHERE company_id = ? AND tax_number = ? LIMIT 1`,
        [authUser.company_id, String(body.tax_number).trim()]
      );
      if ((dup as any[]).length) {
        return NextResponse.json(
          { error: "A supplier with this tax number already exists" },
          { status: 409 }
        );
      }
    }

    await conn.beginTransaction();
    const code = await generateSupplierCode(conn, authUser.company_id);

    const [result] = await conn.query(
      `INSERT INTO suppliers
        (company_id, branch_id, supplier_code, supplier_type,
         name, company_name, designation,
         email, phone, alternate_phone, whatsapp, website,
         tax_number, registration_number,
         address, city, state, country, postal_code,
         opening_balance, balance_type, current_balance, currency_code,
         bank_name, bank_account_name, bank_account_number, bank_iban,
         payment_terms, status, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        body.branch_id ? Number(body.branch_id) : authUser.branch_id || null,
        code,
        body.supplier_type || "business",
        name,
        body.company_name ? String(body.company_name).trim() : null,
        body.designation ? String(body.designation).trim() : null,
        body.email ? String(body.email).trim() : null,
        body.phone ? String(body.phone).trim() : null,
        body.alternate_phone ? String(body.alternate_phone).trim() : null,
        body.whatsapp ? String(body.whatsapp).trim() : null,
        body.website ? String(body.website).trim() : null,
        body.tax_number ? String(body.tax_number).trim() : null,
        body.registration_number
          ? String(body.registration_number).trim()
          : null,
        body.address ? String(body.address).trim() : null,
        body.city ? String(body.city).trim() : null,
        body.state ? String(body.state).trim() : null,
        body.country ? String(body.country).trim() : "Pakistan",
        body.postal_code ? String(body.postal_code).trim() : null,
        Number(body.opening_balance ?? 0),
        body.balance_type || "credit",
        Number(body.opening_balance ?? 0),
        body.currency_code || "PKR",
        body.bank_name ? String(body.bank_name).trim() : null,
        body.bank_account_name
          ? String(body.bank_account_name).trim()
          : null,
        body.bank_account_number
          ? String(body.bank_account_number).trim()
          : null,
        body.bank_iban ? String(body.bank_iban).trim() : null,
        body.payment_terms ? String(body.payment_terms).trim() : null,
        body.status || "active",
        body.notes ? String(body.notes).trim() : null,
        authUser.id,
        authUser.id,
      ]
    );
    const supplierId = (result as any).insertId as number;

    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
      const ua = req.headers.get("user-agent") || null;
      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES (?, ?, 'create', 'supplier', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          supplierId,
          JSON.stringify({ name, supplier_code: code }),
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
        message: "Supplier created successfully",
        id: supplierId,
        supplier_code: code,
      },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/suppliers error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}