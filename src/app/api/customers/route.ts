import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ============================================================
   AUTH HELPER
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

/* ============================================================
   GENERATE CUSTOMER CODE
   Format: CUST-0001, CUST-0002, ...
============================================================ */
async function generateCustomerCode(
  conn: any,
  companyId: number
): Promise<string> {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM customers WHERE company_id = ?`,
    [companyId]
  );
  const next = ((rows as any[])[0].cnt as number) + 1;
  return `CUST-${String(next).padStart(4, "0")}`;
}

/* ============================================================
   GET /api/customers
   Query params:
     ?search=       -> name, email, phone, customer_code, company_name
     ?status=       -> active | inactive | blocked
     ?customer_type=-> individual | business | government | reseller
     ?page=         -> default 1
     ?limit=        -> default 50 (max 200)
     ?all=          -> if "1", return up to 1000 for dropdowns
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const customerType = searchParams.get("customer_type")?.trim() || "";
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

    const where: string[] = ["c.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(c.name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ?
          OR c.phone LIKE ? OR c.customer_code LIKE ? OR c.tax_number LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }
    if (status) {
      where.push("c.status = ?");
      params.push(status);
    }
    if (customerType) {
      where.push("c.customer_type = ?");
      params.push(customerType);
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    /* ---- Count ---- */
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM customers c WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    /* ---- List ---- */
    const [rows] = await pool.query(
      `SELECT
        c.id,
        c.customer_code,
        c.customer_type,
        c.name,
        c.company_name,
        c.designation,
        c.email,
        c.phone,
        c.whatsapp,
        c.tax_number,
        c.billing_address,
        c.shipping_address,
        c.city,
        c.state,
        c.country,
        c.postal_code,
        c.credit_limit,
        c.credit_days,
        c.opening_balance,
        c.balance_type,
        c.current_balance,
        c.currency_code,
        c.tax_exempt,
        c.default_tax_rate,
        c.status,
        c.notes,
        c.created_at,
        b.name AS branch_name,
        u.name AS assigned_name,
        (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count
      FROM customers c
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN users u ON u.id = c.assigned_to
      WHERE ${whereSql}
      ORDER BY c.created_at DESC
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
    console.error("GET /api/customers error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/customers
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Customer name is required" },
        { status: 400 }
      );
    }

    /* ---- Duplicate tax number check ---- */
    if (body.tax_number && String(body.tax_number).trim()) {
      const [dup] = await conn.query(
        `SELECT id FROM customers
         WHERE company_id = ? AND tax_number = ? LIMIT 1`,
        [authUser.company_id, String(body.tax_number).trim()]
      );
      if ((dup as any[]).length) {
        return NextResponse.json(
          { error: "A customer with this tax number already exists" },
          { status: 409 }
        );
      }
    }

    await conn.beginTransaction();

    const customerCode = await generateCustomerCode(
      conn,
      authUser.company_id
    );

    const [result] = await conn.query(
      `INSERT INTO customers
        (company_id, branch_id, customer_code, customer_type,
         name, company_name, designation,
         email, phone, alternate_phone, whatsapp, website,
         tax_number, registration_number,
         billing_address, shipping_address, city, state, country, postal_code,
         profession_id, source_id, assigned_to,
         credit_limit, credit_days, opening_balance, balance_type, current_balance, currency_code,
         tax_exempt, default_tax_rate,
         status, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        body.branch_id ? Number(body.branch_id) : authUser.branch_id || null,
        customerCode,
        body.customer_type || "individual",
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
        body.billing_address ? String(body.billing_address).trim() : null,
        body.shipping_address ? String(body.shipping_address).trim() : null,
        body.city ? String(body.city).trim() : null,
        body.state ? String(body.state).trim() : null,
        body.country ? String(body.country).trim() : "Pakistan",
        body.postal_code ? String(body.postal_code).trim() : null,
        body.profession_id ? Number(body.profession_id) : null,
        body.source_id ? Number(body.source_id) : null,
        body.assigned_to ? Number(body.assigned_to) : null,
        Number(body.credit_limit ?? 0),
        Number(body.credit_days ?? 0),
        Number(body.opening_balance ?? 0),
        body.balance_type || "debit",
        Number(body.opening_balance ?? 0),
        body.currency_code || "PKR",
        body.tax_exempt ? true : false,
        Number(body.default_tax_rate ?? 0),
        body.status || "active",
        body.notes ? String(body.notes).trim() : null,
        authUser.id,
        authUser.id,
      ]
    );
    const customerId = (result as any).insertId as number;

    /* ---- Audit log (best-effort) ---- */
    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;

      await conn.query(
        `INSERT INTO audit_logs
           (company_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES (?, ?, 'create', 'customer', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          customerId,
          JSON.stringify({ name, customer_code: customerCode }),
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
        message: "Customer created successfully",
        id: customerId,
        customer_code: customerCode,
      },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/customers error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}