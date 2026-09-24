import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  verifySession,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@/lib/auth";

export type AuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export async function requireAuth(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

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
