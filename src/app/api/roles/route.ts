import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { ensureAccessSchema, invalidateAccess, requirePerm } from "@/lib/access";
import { resolvePermissionIds } from "@/lib/rolesAdmin";

/* GET /api/roles — roles with their ticked permission keys */
export async function GET(req: NextRequest) {
  const a = await requirePerm(req);
  if (a instanceof Response) return a;
  try {
    await ensureAccessSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.description, r.is_system_role, r.created_at,
              (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
         FROM roles r
        WHERE r.company_id = ?
        ORDER BY r.is_system_role DESC, r.name ASC`,
      [a.companyId]
    );
    const roles = rows as Record<string, unknown>[];
    const ids = roles.map((r) => r.id);
    const keysBy = new Map<number, string[]>();
    if (ids.length) {
      const [pk] = await pool.query(
        `SELECT rp.role_id, p.permission_key FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id IN (?)`,
        [ids]
      );
      for (const r of pk as { role_id: number; permission_key: string }[]) {
        const arr = keysBy.get(Number(r.role_id)) || [];
        arr.push(r.permission_key);
        keysBy.set(Number(r.role_id), arr);
      }
    }
    return NextResponse.json({
      data: roles.map((r) => ({ ...r, permission_keys: keysBy.get(Number(r.id)) || [] })),
    });
  } catch (err) {
    console.error("GET /api/roles error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* POST /api/roles — { name, description?, permission_keys: string[] } */
export async function POST(req: NextRequest) {
  const a = await requirePerm(req, "roles.manage");
  if (a instanceof Response) return a;
  const conn = await getPool().getConnection();
  try {
    await ensureAccessSchema();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const description = body.description ? String(body.description).trim().slice(0, 255) : null;
    if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ error: "Role name is too long (max 100 chars)" }, { status: 400 });
    const [dup] = await conn.query("SELECT id FROM roles WHERE company_id = ? AND name = ? LIMIT 1", [a.companyId, name]);
    if ((dup as unknown[]).length) return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    const permIds = await resolvePermissionIds(conn, body);

    await conn.beginTransaction();
    const [res] = await conn.query(
      "INSERT INTO roles (company_id, name, description, is_system_role) VALUES (?, ?, ?, FALSE)",
      [a.companyId, name, description]
    );
    const roleId = (res as { insertId: number }).insertId;
    if (permIds.length) {
      await conn.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ?", [permIds.map((p) => [roleId, p])]);
    }
    await conn.commit();
    invalidateAccess();
    return NextResponse.json({ message: "Role created", id: roleId }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("POST /api/roles error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}
