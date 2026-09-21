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
   GET /api/contacts
   Query params:
     ?search=       -> name, email, phone, customer name
     ?customer_id=  -> filter by customer
     ?status=       -> active | inactive
     ?page=         -> default 1
     ?limit=        -> default 50 (max 200)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const customerId = searchParams.get("customer_id")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["c.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
          OR c.designation LIKE ? OR cu.name LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (customerId) {
      where.push("c.customer_id = ?");
      params.push(Number(customerId));
    }
    if (status) {
      where.push("c.status = ?");
      params.push(status);
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    /* ---- Count ---- */
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM customer_contacts c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    /* ---- List ---- */
    const [rows] = await pool.query(
      `SELECT
        c.id,
        c.customer_id,
        c.name,
        c.designation,
        c.department,
        c.email,
        c.phone,
        c.alternate_phone,
        c.whatsapp,
        c.address,
        c.city,
        c.state,
        c.country,
        c.postal_code,
        c.is_primary,
        c.status,
        c.notes,
        c.created_at,
        cu.name AS customer_name,
        cu.customer_code AS customer_code
      FROM customer_contacts c
      LEFT JOIN customers cu ON cu.id = c.customer_id
      WHERE ${whereSql}
      ORDER BY c.is_primary DESC, c.name ASC
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
    console.error("GET /api/contacts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/contacts
   Body: {
     customer_id, name, designation?, department?,
     email?, phone?, alternate_phone?, whatsapp?,
     address?, city?, state?, country?, postal_code?,
     is_primary?, status?, notes?
   }
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

    const customerId = Number(body.customer_id);
    const name = String(body.name || "").trim();

    if (!customerId || !name) {
      return NextResponse.json(
        { error: "Customer and contact name are required" },
        { status: 400 }
      );
    }

    /* ---- Verify customer belongs to this company ---- */
    const [custRows] = await conn.query(
      `SELECT id FROM customers
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [customerId, authUser.company_id]
    );
    if (!(custRows as any[]).length) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    await conn.beginTransaction();

    /* ---- Only one primary contact per customer ---- */
    const isPrimary = Boolean(body.is_primary);
    if (isPrimary) {
      await conn.query(
        `UPDATE customer_contacts SET is_primary = FALSE
         WHERE customer_id = ?`,
        [customerId]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO customer_contacts
        (company_id, customer_id, name, designation, department,
         email, phone, alternate_phone, whatsapp,
         address, city, state, country, postal_code,
         is_primary, status, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        customerId,
        name,
        body.designation ? String(body.designation).trim() : null,
        body.department ? String(body.department).trim() : null,
        body.email ? String(body.email).trim() : null,
        body.phone ? String(body.phone).trim() : null,
        body.alternate_phone ? String(body.alternate_phone).trim() : null,
        body.whatsapp ? String(body.whatsapp).trim() : null,
        body.address ? String(body.address).trim() : null,
        body.city ? String(body.city).trim() : null,
        body.state ? String(body.state).trim() : null,
        body.country ? String(body.country).trim() : "Pakistan",
        body.postal_code ? String(body.postal_code).trim() : null,
        isPrimary,
        body.status || "active",
        body.notes ? String(body.notes).trim() : null,
        authUser.id,
        authUser.id,
      ]
    );
    const contactId = (result as any).insertId as number;

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
         VALUES (?, ?, 'create', 'contact', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          contactId,
          JSON.stringify({ name, customer_id: customerId }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json(
      { message: "Contact created successfully", id: contactId },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/contacts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}