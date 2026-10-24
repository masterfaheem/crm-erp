import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import bcrypt from "bcryptjs";
import { ensureAccessSchema } from "@/lib/access";

/* ============================================================
   POST /api/auth/login
   Body: { identifier (email | username | phone), password }
   Sets an HTTP-only session cookie on success.
============================================================ */
/* ---------------- brute-force guard ----------------
   8 wrong passwords for the same login (or 30 from one IP) in 15 minutes
   -> wait before trying again. Kept in memory (resets on restart). */
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, number[]>();
function recent(key: string) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}
function noteFail(...keys: string[]) {
  if (fails.size > 10000) fails.clear();
  for (const k of keys) fails.set(k, [...recent(k), Date.now()]);
}
function tooMany(loginKey: string, ipKey: string) {
  return recent(loginKey).length >= 8 || recent(ipKey).length >= 30;
}

export async function POST(req: NextRequest) {
  const ipAddr =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  try {
    const body = await req.json().catch(() => null);

    // one box: email, username or phone number
    const identifier = String(body?.identifier ?? body?.email ?? "").trim();
    const login = identifier.toLowerCase();
    const password = String(body?.password || "");

    if (!login || !password) {
      return NextResponse.json(
        { message: "Email / username / phone and password are required." },
        { status: 400 }
      );
    }

    const loginKey = `u:${login}`;
    const ipKey = `ip:${ipAddr}`;
    if (tooMany(loginKey, ipKey)) {
      return NextResponse.json(
        { message: "Too many wrong attempts. Please wait 15 minutes and try again." },
        { status: 429 }
      );
    }

    const pool = getPool();
    await ensureAccessSchema().catch((e) => console.error("access schema", e));

    const SELECT = `SELECT
         u.id, u.company_id, u.branch_id, u.name, u.email, u.phone, u.username,
         u.password_hash, u.status,
         c.name AS company_name, c.status AS company_status
       FROM users u
       JOIN companies c ON c.id = u.company_id`;

    // 1) email or username
    let [rows] = await pool.query(
      `${SELECT}
       WHERE LOWER(u.email) = ? OR LOWER(u.username) = ?
       ORDER BY (u.status = 'active') DESC, u.id ASC
       LIMIT 1`,
      [login, login]
    );
    // 2) phone number (compare last 10 digits: 0300..., +92 300..., 92300...)
    const digits = login.replace(/\D/g, "");
    if (!(rows as unknown[]).length && digits.length >= 10 && !/[a-z@]/.test(login)) {
      const [cands] = await pool.query(
        `${SELECT} WHERE u.phone IS NOT NULL AND u.phone <> '' ORDER BY (u.status = 'active') DESC, u.id ASC`
      );
      const key = digits.slice(-10);
      rows = (cands as { phone: string }[]).filter(
        (r) => String(r.phone).replace(/\D/g, "").slice(-10) === key
      ) as typeof rows;
    }

    const user = (rows as any[])[0];

    // Generic error to avoid leaking which emails exist
    if (!user) {
      noteFail(loginKey, ipKey);
      return NextResponse.json(
        { message: "Wrong login details or password." },
        { status: 401 }
      );
    }

    // Verify password hash
    const ok = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      noteFail(loginKey, ipKey);
      return NextResponse.json(
        { message: "Wrong login details or password." },
        { status: 401 }
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        {
          message:
            user.status === "suspended"
              ? "Your account has been suspended. Contact your administrator."
              : "Your account is not active. Contact your administrator.",
        },
        { status: 403 }
      );
    }

    if (user.company_status && user.company_status !== "active") {
      return NextResponse.json(
        { message: "Your company account is inactive." },
        { status: 403 }
      );
    }

    // Issue JWT session
    const token = signSession({
      userId: user.id,
      email: user.email || "",
    });

    // Record login time + IP/UA
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const ua = req.headers.get("user-agent") || null;

    await pool.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = ?`,
      [user.id]
    );

    await pool.query(
      `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [user.id, token, ip, ua ? ua.slice(0, 500) : null, SESSION_MAX_AGE]
    );

    // Clean up any expired sessions for this user (housekeeping)
    await pool.query(
      `DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()`,
      [user.id]
    );

    // Write to audit log (non-blocking — but await so it's reliable)
    try {
      await pool.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
         VALUES (?, ?, 'login', 'user', ?, ?, ?)`,
        [user.company_id, user.id, user.id, ip, ua ? ua.slice(0, 500) : null]
      );
    } catch {
      /* audit failure should not block login */
    }

    // Set the session cookie
    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company_id: user.company_id,
        branch_id: user.branch_id,
        company_name: user.company_name,
      },
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}