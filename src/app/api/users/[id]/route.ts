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
   GET /api/users/[id]
   Returns the user row + primary role id.
============================================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        u.branch_id,
        u.status,
        u.last_login_at,
        u.created_at,
        (
          SELECT r.id
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
          LIMIT 1
        ) AS role_id
       FROM users u
       WHERE u.id = ? AND u.company_id = ?
       LIMIT 1`,
      [id, user.company_id]
    );

    const row = (rows as any[])[0];
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/users/[id]
   Updates the user, optionally the password, and the role.
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
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    /* ---- Fetch existing ---- */
    const [existingRows] = await conn.query(
      `SELECT * FROM users WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    /* ---- Prepare values ---- */
    const name = String(body.name ?? existing.name).trim();
    const email = String(body.email ?? existing.email).trim().toLowerCase();
    const phone =
      body.phone !== undefined
        ? body.phone
          ? String(body.phone).trim()
          : null
        : existing.phone;
    const username =
      body.username !== undefined
        ? body.username
          ? String(body.username).trim()
          : null
        : existing.username;
    const branchId =
      body.branch_id !== undefined
        ? body.branch_id
          ? Number(body.branch_id)
          : null
        : existing.branch_id;
    const status = body.status ?? existing.status;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    /* ---- Duplicate email check ---- */
    const [dup] = await conn.query(
      `SELECT id FROM users
       WHERE company_id = ? AND LOWER(email) = ? AND id <> ?
       LIMIT 1`,
      [authUser.company_id, email, id]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "Another user already has this email" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    /* ---- Build update ---- */
    const updates: string[] = [
      "name = ?",
      "email = ?",
      "phone = ?",
      "username = ?",
      "branch_id = ?",
      "status = ?",
    ];
    const updateParams: any[] = [
      name,
      email,
      phone,
      username,
      branchId,
      status,
    ];

    /* ---- Optional password change ---- */
    if (body.password && String(body.password).length > 0) {
      if (String(body.password).length < 8) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
      const hash = await bcrypt.hash(String(body.password), 10);
      updates.push("password_hash = ?");
      updateParams.push(hash);
    }

    updateParams.push(id, authUser.company_id);
    await conn.query(
      `UPDATE users SET ${updates.join(", ")}
       WHERE id = ? AND company_id = ?`,
      updateParams
    );

    /* ---- Sync role (single-role model) ---- */
    if (body.role_id !== undefined) {
      await conn.query(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
      if (body.role_id) {
        await conn.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [id, Number(body.role_id)]
        );
      }
    }

    await conn.commit();

    return NextResponse.json({ message: "User updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/users/[id]
   Guards:
     - cannot delete yourself
     - cannot delete the last active user in the company
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
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetId = Number(id);

    if (targetId === authUser.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const [targetRows] = await conn.query(
      `SELECT id FROM users WHERE id = ? AND company_id = ? LIMIT 1`,
      [targetId, authUser.company_id]
    );
    if (!(targetRows as any[]).length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM users
       WHERE company_id = ? AND status = 'active'`,
      [authUser.company_id]
    );
    const activeCount = (countRows as any[])[0].cnt as number;
    if (activeCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last active user" },
        { status: 400 }
      );
    }

    await conn.query(`DELETE FROM users WHERE id = ? AND company_id = ?`, [
      targetId,
      authUser.company_id,
    ]);

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}