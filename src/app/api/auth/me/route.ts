// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    console.log("[me] cookie name:", SESSION_COOKIE_NAME);
    console.log("[me] token present:", !!token);
    console.log(
      "[me] all cookies:",
      req.cookies.getAll().map((c) => c.name)
    );

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifySession(token);
    console.log("[me] payload:", payload);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.phone,
         u.company_id, u.branch_id,
         u.status, u.last_login_at,
         c.name AS company_name,
         b.name AS branch_name,
         (SELECT r.name FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = ? AND u.status = 'active'
       LIMIT 1`,
      [payload.userId]
    );

    const user = (rows as any[])[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(user);
  } catch (err) {
    console.error("[me] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}