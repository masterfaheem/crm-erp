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
     FROM users
     WHERE id = ? AND status = 'active'
     LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/branches
   List all branches of the company.
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

    const where: string[] = ["b.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(b.name LIKE ? OR b.code LIKE ? OR b.email LIKE ? OR b.phone LIKE ? OR b.city LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (status) {
      where.push("b.status = ?");
      params.push(status);
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        b.id,
        b.name,
        b.code,
        b.email,
        b.phone,
        b.address,
        b.city,
        b.state,
        b.country,
        b.is_head_office,
        b.status,
        b.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id) AS user_count
      FROM branches b
      WHERE ${where.join(" AND ")}
      ORDER BY b.is_head_office DESC, b.name ASC`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/branches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/branches
   Body: {
     name, code, email?, phone?, address?, city?, state?,
     country?, is_head_office?, status?
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

    const name = String(body.name || "").trim();
    const code = String(body.code || "").trim().toUpperCase();
    const email = body.email ? String(body.email).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const address = body.address ? String(body.address).trim() : null;
    const city = body.city ? String(body.city).trim() : null;
    const state = body.state ? String(body.state).trim() : null;
    const country = body.country ? String(body.country).trim() : "Pakistan";
    const isHeadOffice = Boolean(body.is_head_office);
    const status = body.status || "active";

    /* ---- Validation ---- */
    if (!name || !code) {
      return NextResponse.json(
        { error: "Branch name and code are required" },
        { status: 400 }
      );
    }
    if (name.length > 150) {
      return NextResponse.json(
        { error: "Branch name is too long" },
        { status: 400 }
      );
    }
    if (code.length > 30) {
      return NextResponse.json(
        { error: "Branch code is too long" },
        { status: 400 }
      );
    }
    if (!["active", "inactive"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    /* ---- Duplicate code check ---- */
    const [dup] = await conn.query(
      `SELECT id FROM branches
       WHERE company_id = ? AND code = ? LIMIT 1`,
      [authUser.company_id, code]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "A branch with this code already exists" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    /* ---- Only one head office per company ---- */
    if (isHeadOffice) {
      await conn.query(
        `UPDATE branches SET is_head_office = FALSE WHERE company_id = ?`,
        [authUser.company_id]
      );
    }

    /* ---- Insert ---- */
    const [result] = await conn.query(
      `INSERT INTO branches
        (company_id, name, code, email, phone, address, city, state,
         country, is_head_office, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        name,
        code,
        email,
        phone,
        address,
        city,
        state,
        country,
        isHeadOffice,
        status,
      ]
    );
    const branchId = (result as any).insertId as number;

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
         VALUES (?, ?, 'create', 'branch', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          branchId,
          JSON.stringify({ name, code, status, is_head_office: isHeadOffice }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* audit failure shouldn't block creation */
    }

    await conn.commit();

    return NextResponse.json(
      { message: "Branch created successfully", id: branchId },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/branches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}