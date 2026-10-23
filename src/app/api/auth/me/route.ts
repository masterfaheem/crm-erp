// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { accessFromRequest } from "@/lib/access";

/* GET /api/auth/me — signed-in user + what they are allowed to do */
export async function GET(req: NextRequest) {
  try {
    const access = await accessFromRequest(req);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.phone, u.username,
         u.company_id, u.branch_id,
         u.status, u.last_login_at,
         c.name AS company_name,
         b.name AS branch_name
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = ? AND u.status = 'active'
       LIMIT 1`,
      [access.userId]
    );

    const user = (rows as Record<string, unknown>[])[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ...user,
      role: access.roleName,
      role_id: access.roleId,
      is_super_admin: access.isSuperAdmin,
      custom_access: access.custom,
      permissions: [...access.perms],
    });
  } catch (err) {
    console.error("[me] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
