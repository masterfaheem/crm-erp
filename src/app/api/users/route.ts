import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { can, requirePerm, invalidateAccess, ensureAccessSchema, USER_ACCESS_TABLE } from "@/lib/access";
import {
  audit,
  findDuplicate,
  isSystemRole,
  parseUserInput,
  roleExists,
  saveUserAccess,
  validateUser,
} from "@/lib/usersAdmin";

/* ============================================================
   GET /api/users  — team list
   People without users.view only get id + name (for "assign to" dropdowns)
============================================================ */
export async function GET(req: NextRequest) {
  const a = await requirePerm(req);
  if (a instanceof Response) return a;
  try {
    await ensureAccessSchema();
    const pool = getPool();

    if (!can(a, "users.view", "users.manage")) {
      const [rows] = await pool.query(
        "SELECT id, name FROM users WHERE company_id = ? AND status = 'active' ORDER BY name",
        [a.companyId]
      );
      return NextResponse.json({ data: rows });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const role = searchParams.get("role")?.trim() || "";

    const where: string[] = ["u.company_id = ?"];
    const params: (string | number)[] = [a.companyId];
    if (search) {
      where.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (status) {
      where.push("u.status = ?");
      params.push(status);
    }
    if (role) {
      where.push("EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = ?)");
      params.push(role);
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.username, u.avatar_path, u.status,
              u.last_login_at, u.created_at, u.branch_id, b.name AS branch_name,
              r.id AS primary_role_id, r.name AS roles, COALESCE(r.is_system_role, 0) AS is_super_admin,
              COALESCE(ac.custom, 0) AS custom_access,
              (SELECT COUNT(*) FROM crm_user_permissions up WHERE up.user_id = u.id) AS custom_count
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN roles r ON r.id = (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = u.id ORDER BY ur.role_id LIMIT 1)
         LEFT JOIN ${USER_ACCESS_TABLE} ac ON ac.user_id = u.id
        WHERE ${where.join(" AND ")}
        ORDER BY u.status = 'active' DESC, u.created_at DESC`,
      params
    );
    return NextResponse.json({ data: rows, me: a.userId, can_manage: can(a, "users.manage") });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ============================================================
   POST /api/users — add a team member
   Body: { name, email?, phone?, username?, password, role_id?, branch_id?,
           status?, custom?: boolean, permissions?: string[] }
   Login works with any of email / username / phone + password.
============================================================ */
export async function POST(req: NextRequest) {
  const a = await requirePerm(req, "users.manage");
  if (a instanceof Response) return a;

  const conn = await getPool().getConnection();
  try {
    await ensureAccessSchema();
    const u = parseUserInput(await req.json().catch(() => ({})));
    const bad = validateUser(u, true);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (u.role_id && !(await roleExists(conn, u.role_id, a.companyId)))
      return NextResponse.json({ error: "Role not found" }, { status: 400 });
    if (!u.role_id && !u.custom)
      return NextResponse.json({ error: "Choose a role or tick custom permissions" }, { status: 400 });
    if (!a.isSuperAdmin && (await isSystemRole(conn, u.role_id, a.companyId)))
      return NextResponse.json({ error: "Only a Super Admin can create another Super Admin" }, { status: 403 });
    const dup = await findDuplicate(conn, u, null);
    if (dup) return NextResponse.json({ error: dup }, { status: 409 });

    await conn.beginTransaction();
    const hash = await bcrypt.hash(u.password, 10);
    const [res] = await conn.query(
      `INSERT INTO users (company_id, branch_id, name, email, phone, username, password_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.companyId, u.branch_id ?? a.branchId ?? null, u.name, u.email, u.phone, u.username, hash, u.status]
    );
    const id = (res as { insertId: number }).insertId;
    await saveUserAccess(conn, id, u, a.userId);
    await audit(conn, a.companyId, a.userId, "create", id, {
      name: u.name, email: u.email, phone: u.phone, username: u.username, role_id: u.role_id,
      custom: u.custom, permissions: u.custom ? u.permissions : undefined,
    }, req);
    await conn.commit();
    invalidateAccess(id);
    return NextResponse.json({ message: "User created", id }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("POST /api/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}

