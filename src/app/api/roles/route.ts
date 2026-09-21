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
   TYPES
============================================================ */
interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  is_system_role: number;
  permission_count: number;
  user_count: number;
  created_at: string;
}

/* ============================================================
   GET /api/roles
   List all roles for the company with counts.
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT
        r.id,
        r.name,
        r.description,
        r.is_system_role,
        r.created_at,
        (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
      FROM roles r
      WHERE r.company_id = ?
      ORDER BY r.is_system_role DESC, r.name ASC`,
      [user.company_id]
    );

    return NextResponse.json({ data: rows as RoleRow[] });
  } catch (err) {
    console.error("GET /api/roles error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/roles
   Body: { name, description?, permission_ids: number[] }
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const name = String(body.name || "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const permissionIds: number[] = Array.isArray(body.permission_ids)
      ? body.permission_ids.map((n: any) => Number(n)).filter(Boolean)
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "Role name is required" },
        { status: 400 }
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: "Role name is too long (max 100 chars)" },
        { status: 400 }
      );
    }

    // Duplicate name check within company
    const [dup] = await conn.query(
      `SELECT id FROM roles WHERE company_id = ? AND name = ? LIMIT 1`,
      [user.company_id, name]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO roles (company_id, name, description, is_system_role)
       VALUES (?, ?, ?, FALSE)`,
      [user.company_id, name, description]
    );
    const roleId = (result as any).insertId as number;

    if (permissionIds.length) {
      const values = permissionIds.map((pid) => [roleId, pid]);
      await conn.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    return NextResponse.json(
      { message: "Role created successfully", id: roleId },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/roles error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}