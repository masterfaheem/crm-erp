import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

export interface AuthUser {
  id: number;
  company_id: number;
  branch_id: number | null;
  name: string;
  email: string;
}

export async function requireUser(req: NextRequest): Promise<AuthUser | null> {
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
  const arr = rows as AuthUser[];
  return arr.length ? arr[0] : null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
