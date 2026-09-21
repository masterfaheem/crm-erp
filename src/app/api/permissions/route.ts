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
   GET /api/permissions
   Returns:
     - data:    flat list of all permissions
     - grouped: { [module]: PermissionItem[] }
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, module, action, permission_key, description
       FROM permissions
       ORDER BY module ASC, action ASC`
    );

    const list = rows as any[];

    // Group by module for the frontend matrix
    const grouped: Record<
      string,
      {
        id: number;
        action: string;
        permission_key: string;
        description: string | null;
      }[]
    > = {};

    for (const p of list) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push({
        id: p.id,
        action: p.action,
        permission_key: p.permission_key,
        description: p.description,
      });
    }

    return NextResponse.json({ data: list, grouped });
  } catch (err) {
    console.error("GET /api/permissions error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}