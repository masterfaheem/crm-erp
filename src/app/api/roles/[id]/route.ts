import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { ensureAccessSchema, invalidateAccess, requirePerm } from "@/lib/access";
import { resolvePermissionIds, roleKeys } from "@/lib/rolesAdmin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req);
  if (a instanceof Response) return a;
  try {
    await ensureAccessSchema();
    const id = Number((await params).id);
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, name, description, is_system_role, created_at FROM roles WHERE id = ? AND company_id = ? LIMIT 1",
      [id, a.companyId]
    );
    const role = (rows as Record<string, unknown>[])[0];
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    const [ids] = await pool.query("SELECT permission_id FROM role_permissions WHERE role_id = ?", [id]);
    return NextResponse.json({
      ...role,
      permission_ids: (ids as { permission_id: number }[]).map((r) => r.permission_id),
      permission_keys: await roleKeys(pool, id),
    });
  } catch (err) {
    console.error("GET /api/roles/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req, "roles.manage");
  if (a instanceof Response) return a;
  const conn = await getPool().getConnection();
  try {
    await ensureAccessSchema();
    const id = Number((await params).id);
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const description = body.description ? String(body.description).trim().slice(0, 255) : null;
    if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });

    const [rr] = await conn.query("SELECT id, is_system_role FROM roles WHERE id = ? AND company_id = ? LIMIT 1", [id, a.companyId]);
    const role = (rr as { id: number; is_system_role: number }[])[0];
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    if (Number(role.is_system_role) === 1)
      return NextResponse.json({ error: "Super Admin always has full access and can't be edited" }, { status: 400 });
    const [dup] = await conn.query("SELECT id FROM roles WHERE company_id = ? AND name = ? AND id <> ? LIMIT 1", [a.companyId, name, id]);
    if ((dup as unknown[]).length) return NextResponse.json({ error: "Another role already uses this name" }, { status: 409 });
    const permIds = await resolvePermissionIds(conn, body);

    await conn.beginTransaction();
    await conn.query("UPDATE roles SET name = ?, description = ? WHERE id = ? AND company_id = ?", [name, description, id, a.companyId]);
    await conn.query("DELETE FROM role_permissions WHERE role_id = ?", [id]);
    if (permIds.length) {
      await conn.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ?", [permIds.map((p) => [id, p])]);
    }
    await conn.commit();
    invalidateAccess();
    return NextResponse.json({ message: "Role updated" });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("PUT /api/roles/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await requirePerm(req, "roles.manage");
  if (a instanceof Response) return a;
  const conn = await getPool().getConnection();
  try {
    const id = Number((await params).id);
    const [rr] = await conn.query("SELECT id, is_system_role FROM roles WHERE id = ? AND company_id = ? LIMIT 1", [id, a.companyId]);
    const role = (rr as { id: number; is_system_role: number }[])[0];
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    if (Number(role.is_system_role) === 1) return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });
    const [cnt] = await conn.query("SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?", [id]);
    const n = Number((cnt as { n: number }[])[0]?.n || 0);
    if (n > 0) return NextResponse.json({ error: `This role is given to ${n} user(s). Change their role first.` }, { status: 400 });
    await conn.beginTransaction();
    await conn.query("DELETE FROM role_permissions WHERE role_id = ?", [id]);
    await conn.query("DELETE FROM roles WHERE id = ? AND company_id = ?", [id, a.companyId]);
    await conn.commit();
    invalidateAccess();
    return NextResponse.json({ message: "Role deleted" });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error("DELETE /api/roles/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}
