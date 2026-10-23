import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { requirePerm, invalidateAccess, ensureAccessSchema, USER_ACCESS_TABLE, USER_PERMS_TABLE } from "@/lib/access";
import {
  activeSuperAdmins,
  audit,
  findDuplicate,
  isSystemRole,
  parseUserInput,
  roleExists,
  saveUserAccess,
  validateUser,
} from "@/lib/usersAdmin";

type Ctx = { params: Promise<{ id: string }> };

/* GET /api/users/[id] — user + role + custom ticks */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req, "users.view", "users.manage");
  if (a instanceof Response) return a;
  try {
    await ensureAccessSchema();
    const id = Number((await params).id);
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.username, u.avatar_path, u.branch_id, u.status,
              u.last_login_at, u.created_at,
              (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = u.id ORDER BY ur.role_id LIMIT 1) AS role_id,
              COALESCE(ac.custom, 0) AS custom
         FROM users u
         LEFT JOIN ${USER_ACCESS_TABLE} ac ON ac.user_id = u.id
        WHERE u.id = ? AND u.company_id = ?
        LIMIT 1`,
      [id, a.companyId]
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const [p] = await pool.query(`SELECT permission_key FROM ${USER_PERMS_TABLE} WHERE user_id = ?`, [id]);
    return NextResponse.json({
      ...row,
      custom: Number(row.custom) === 1,
      permissions: (p as { permission_key: string }[]).map((r) => r.permission_key),
    });
  } catch (err) {
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* PUT /api/users/[id] — edit details, password (optional) and access */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req, "users.manage");
  if (a instanceof Response) return a;
  const conn = await getPool().getConnection();
  try {
    await ensureAccessSchema();
    const id = Number((await params).id);
    const [ex] = await conn.query("SELECT * FROM users WHERE id = ? AND company_id = ? LIMIT 1", [id, a.companyId]);
    const existing = (ex as Record<string, unknown>[])[0];
    if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const u = parseUserInput(await req.json().catch(() => ({})));
    const bad = validateUser(u, false);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (u.role_id && !(await roleExists(conn, u.role_id, a.companyId)))
      return NextResponse.json({ error: "Role not found" }, { status: 400 });
    if (!u.role_id && !u.custom)
      return NextResponse.json({ error: "Choose a role or tick custom permissions" }, { status: 400 });

    const [cr] = await conn.query("SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id LIMIT 1", [id]);
    const currentRole = (cr as { role_id: number }[])[0]?.role_id ?? null;
    const wasAdmin = await isSystemRole(conn, currentRole, a.companyId);
    const willBeAdmin = await isSystemRole(conn, u.role_id, a.companyId);

    if (!a.isSuperAdmin && (wasAdmin || willBeAdmin))
      return NextResponse.json({ error: "Only a Super Admin can change a Super Admin" }, { status: 403 });
    if (id === a.userId && wasAdmin && (!willBeAdmin || u.status !== "active"))
      return NextResponse.json({ error: "You can't remove your own Super Admin access" }, { status: 400 });
    if (wasAdmin && (!willBeAdmin || u.status !== "active") && (await activeSuperAdmins(conn, a.companyId, id)) === 0)
      return NextResponse.json({ error: "At least one active Super Admin must remain" }, { status: 400 });

    const dup = await findDuplicate(conn, u, id);
    if (dup) return NextResponse.json({ error: dup }, { status: 409 });

    await conn.beginTransaction();
    const sets = ["name = ?", "email = ?", "phone = ?", "username = ?", "branch_id = ?", "status = ?"];
    const vals: unknown[] = [u.name, u.email, u.phone, u.username, u.branch_id, u.status];
    if (u.password) {
      sets.push("password_hash = ?");
      vals.push(await bcrypt.hash(u.password, 10));
    }
    vals.push(id, a.companyId);
    await conn.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND company_id = ?`, vals);
    await saveUserAccess(conn, id, u, a.userId);
    // sign the user out everywhere when suspended or password changed
    if (u.status !== "active" || u.password) {
      await conn.query("DELETE FROM sessions WHERE user_id = ?", [id]).catch(() => {});
    }
    await audit(conn, a.companyId, a.userId, "update", id, {
      name: u.name, email: u.email, phone: u.phone, username: u.username, status: u.status,
      role_id: u.role_id, custom: u.custom, permissions: u.custom ? u.permissions : undefined,
      password_changed: !!u.password,
    }, req);
    await conn.commit();
    invalidateAccess(id);
    return NextResponse.json({ message: "User updated" });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}

/* DELETE /api/users/[id] — not yourself, not the last Super Admin */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req, "users.manage");
  if (a instanceof Response) return a;
  const conn = await getPool().getConnection();
  try {
    const id = Number((await params).id);
    if (id === a.userId) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    const [t] = await conn.query("SELECT id, name FROM users WHERE id = ? AND company_id = ? LIMIT 1", [id, a.companyId]);
    const target = (t as { id: number; name: string }[])[0];
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const [cr] = await conn.query("SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id LIMIT 1", [id]);
    const isAdmin = await isSystemRole(conn, (cr as { role_id: number }[])[0]?.role_id ?? null, a.companyId);
    if (isAdmin && !a.isSuperAdmin)
      return NextResponse.json({ error: "Only a Super Admin can delete a Super Admin" }, { status: 403 });
    if (isAdmin && (await activeSuperAdmins(conn, a.companyId, id)) === 0)
      return NextResponse.json({ error: "At least one active Super Admin must remain" }, { status: 400 });

    await conn.beginTransaction();
    await conn.query("DELETE FROM user_roles WHERE user_id = ?", [id]);
    await conn.query(`DELETE FROM ${USER_PERMS_TABLE} WHERE user_id = ?`, [id]);
    await conn.query(`DELETE FROM ${USER_ACCESS_TABLE} WHERE user_id = ?`, [id]);
    await conn.query("DELETE FROM sessions WHERE user_id = ?", [id]).catch(() => {});
    await conn.query("DELETE FROM users WHERE id = ? AND company_id = ?", [id, a.companyId]);
    await audit(conn, a.companyId, a.userId, "delete", id, { name: target.name }, req);
    await conn.commit();
    invalidateAccess(id);
    return NextResponse.json({ message: "User deleted" });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("DELETE /api/users/[id] error:", err);
    // most likely the user is linked to records (leads, bills…) -> suggest suspending
    return NextResponse.json(
      { error: "Couldn't delete this user (they may be linked to records). Set status to Inactive instead." },
      { status: 409 }
    );
  } finally {
    conn.release();
  }
}
