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
    `SELECT id, company_id, branch_id, name, email
     FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ---------- GET ---------- */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pool = getPool();

    const [roleRows] = await pool.query(
      `SELECT id, name, description, is_system_role, created_at
       FROM roles
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [id, user.company_id]
    );
    const role = (roleRows as any[])[0];
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const [permRows] = await pool.query(
      `SELECT permission_id FROM role_permissions WHERE role_id = ?`,
      [id]
    );
    const permissionIds = (permRows as any[]).map((r) => r.permission_id);

    return NextResponse.json({ ...role, permission_ids: permissionIds });
  } catch (err) {
    console.error("GET /api/roles/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ---------- PUT ---------- */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const [roleRows] = await conn.query(
      `SELECT id, is_system_role FROM roles
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, user.company_id]
    );
    const role = (roleRows as any[])[0];
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const [dup] = await conn.query(
      `SELECT id FROM roles
       WHERE company_id = ? AND name = ? AND id <> ? LIMIT 1`,
      [user.company_id, name, id]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "Another role already uses this name" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    await conn.query(
      `UPDATE roles SET name = ?, description = ?
       WHERE id = ? AND company_id = ?`,
      [name, description, id, user.company_id]
    );

    await conn.query(`DELETE FROM role_permissions WHERE role_id = ?`, [id]);

    if (permissionIds.length) {
      const values = permissionIds.map((pid) => [Number(id), pid]);
      await conn.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    return NextResponse.json({ message: "Role updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/roles/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ---------- DELETE ---------- */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;
    const user = await requireUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [roleRows] = await conn.query(
      `SELECT id, is_system_role, name FROM roles
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, user.company_id]
    );
    const role = (roleRows as any[])[0];
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.is_system_role) {
      return NextResponse.json(
        { error: "System roles cannot be deleted" },
        { status: 400 }
      );
    }

    const [assignedRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM user_roles WHERE role_id = ?`,
      [id]
    );
    const assigned = (assignedRows as any[])[0].cnt as number;
    if (assigned > 0) {
      return NextResponse.json(
        {
          error: `This role is assigned to ${assigned} user${
            assigned > 1 ? "s" : ""
          }. Reassign them first.`,
        },
        { status: 400 }
      );
    }

    await conn.query(`DELETE FROM roles WHERE id = ? AND company_id = ?`, [
      id,
      user.company_id,
    ]);

    return NextResponse.json({ message: "Role deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/roles/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}