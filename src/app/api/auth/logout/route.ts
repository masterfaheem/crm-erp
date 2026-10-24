import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { forgetSession } from "@/lib/access";

/* ============================================================
   POST /api/auth/logout
   Clears the real session cookie and ends the session on the
   server, so the old token can't be used again.
============================================================ */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      await getPool().query("DELETE FROM sessions WHERE token = ?", [token]);
    } catch (e) {
      console.error("logout: session delete failed", e);
    }
    forgetSession(token);
  }
  const res = NextResponse.json({ ok: true });
  for (const name of [SESSION_COOKIE_NAME, "session"]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
  }
  return res;
}
