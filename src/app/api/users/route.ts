import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import bcrypt from "bcryptjs";

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
   GET /api/users
   List all users of the company with filters + primary role.
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
    const role = searchParams.get("role")?.trim() || "";

    const where: string[] = ["u.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (status) {
      where.push("u.status = ?");
      params.push(status);
    }
    if (role) {
      where.push(
        `EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.name = ?
        )`
      );
      params.push(role);
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.username,
        u.avatar_path,
        u.status,
        u.last_login_at,
        u.created_at,
        b.name AS branch_name,
        (
          SELECT GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ', ')
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
        ) AS roles,
        (
          SELECT r.id FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
          LIMIT 1
        ) AS primary_role_id
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ${where.join(" AND ")}
      ORDER BY u.created_at DESC`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/users
   Body: {
     name, email, password, phone?, username?,
     branch_id?, role_id?, status?
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
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = body.phone ? String(body.phone).trim() : null;
    const username = body.username ? String(body.username).trim() : null;

    /* ---- Validation ---- */
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    /* ---- Duplicate email check (within company) ---- */
    const [dup] = await conn.query(
      `SELECT id FROM users
       WHERE company_id = ? AND LOWER(email) = ? LIMIT 1`,
      [authUser.company_id, email]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    /* ---- Duplicate username check (within company, if provided) ---- */
    if (username) {
      const [dupU] = await conn.query(
        `SELECT id FROM users
         WHERE company_id = ? AND username = ? LIMIT 1`,
        [authUser.company_id, username]
      );
      if ((dupU as any[]).length) {
        return NextResponse.json(
          { error: "This username is already taken" },
          { status: 409 }
        );
      }
    }

    await conn.beginTransaction();

    /* ---- Hash password + insert ---- */
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await conn.query(
      `INSERT INTO users
        (company_id, branch_id, name, email, phone, username, password_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        body.branch_id ? Number(body.branch_id) : authUser.branch_id || null,
        name,
        email,
        phone,
        username,
        passwordHash,
        body.status || "active",
      ]
    );
    const newUserId = (result as any).insertId as number;

    /* ---- Assign role (single-role model) ---- */
    if (body.role_id) {
      await conn.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [newUserId, Number(body.role_id)]
      );
    }

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
         VALUES (?, ?, 'create', 'user', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          newUserId,
          JSON.stringify({ name, email, status: body.status || "active" }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* audit failure shouldn't block user creation */
    }

    await conn.commit();

    return NextResponse.json(
      { message: "User created successfully", id: newUserId },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/users error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}