import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import bcrypt from "bcryptjs";

/* ============================================================
   POST /api/auth/login
   Body: { email, password }
   Sets an HTTP-only session cookie on success.
============================================================ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Look up the user by email (case-insensitive via lowercase compare).
    // Emails are stored unique per company; if multiple companies could
    // share an email, we pick the first active match. Adjust if needed.
    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.company_id,
         u.branch_id,
         u.name,
         u.email,
         u.password_hash,
         u.status,
         c.name AS company_name,
         c.status AS company_status
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE LOWER(u.email) = ?
       ORDER BY u.id ASC
       LIMIT 1`,
      [email]
    );

    const user = (rows as any[])[0];

    // Generic error to avoid leaking which emails exist
    if (!user) {
      return NextResponse.json(
        { message: "Invalid email or password." },
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

    // Verify password hash
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Issue JWT session
    const token = signSession({
      userId: user.id,
      email: user.email,
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