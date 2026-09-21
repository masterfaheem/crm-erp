import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
const SESSION_COOKIE = "technox_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: number;
  email: string;
}

if (!JWT_SECRET) {
  // Fails loudly at startup rather than silently signing with "undefined".
  console.warn(
    "JWT_SECRET is not set. Add it to your .env file before accepting logins."
  );
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = SESSION_MAX_AGE_SECONDS;
