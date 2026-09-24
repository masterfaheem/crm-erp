// lib/requireAuth.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  verifySession,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@/lib/auth"; // <-- adjust path to your auth.ts

export type AuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export function requireAuth(): AuthResult {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }
  const session = verifySession(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      ),
    };
  }
  return { ok: true, session };
}
