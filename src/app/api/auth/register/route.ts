import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import bcrypt from "bcryptjs";

/* ============================================================
   POST /api/auth/register
   Body: {
     company_name, name, email, password,
     phone?, branch_name?   (optional — defaults to head office)
   }
   Creates a new company + head office branch + user, assigns
   Super Admin role, then signs the user in.
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => null);

    const companyName = String(body?.company_name || "").trim();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const phone = body?.phone ? String(body.phone).trim() : null;
    const branchName = body?.branch_name
      ? String(body.branch_name).trim()
      : "Head Office";

    /* ---------- Validation ---------- */
    if (!companyName || !name || !email || !password) {
      return NextResponse.json(
        {
          message:
            "Company name, your name, email, and password are required.",
        },
        { status: 400 }
      );
    }

    if (companyName.length > 150) {
      return NextResponse.json(
        { message: "Company name is too long." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    /* ---------- Duplicate email check (across all companies) ---------- */
    const [dup] = await conn.query(
      `SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1`,
      [email]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        {
          message:
            "An account with this email already exists. Try signing in instead.",
        },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    /* ---------- 1. Create company ---------- */
    const [companyResult] = await conn.query(
      `INSERT INTO companies (name, email, phone, status)
       VALUES (?, ?, ?, 'active')`,
      [companyName, email, phone]
    );
    const companyId = (companyResult as any).insertId as number;

    /* ---------- 2. Create head-office branch ---------- */
    const branchCode = "HO-" + String(companyId).padStart(4, "0");
    const [branchResult] = await conn.query(
      `INSERT INTO branches
         (company_id, name, code, email, phone, is_head_office, status)
       VALUES (?, ?, ?, ?, ?, TRUE, 'active')`,
      [companyId, branchName, branchCode, email, phone]
    );
    const branchId = (branchResult as any).insertId as number;

    /* ---------- 3. Create user ---------- */
    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await conn.query(
      `INSERT INTO users
         (company_id, branch_id, name, email, phone, password_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [companyId, branchId, name, email, phone, passwordHash]
    );
    const userId = (userResult as any).insertId as number;

    /* ---------- 4. Ensure Super Admin role exists for this company ---------- */
    const [existingRoleRows] = await conn.query(
      `SELECT id FROM roles WHERE company_id = ? AND name = 'Super Admin' LIMIT 1`,
      [companyId]
    );
    let superAdminRoleId: number;

    if ((existingRoleRows as any[]).length) {
      superAdminRoleId = (existingRoleRows as any[])[0].id;
    } else {
      const [roleResult] = await conn.query(
        `INSERT INTO roles (company_id, name, description, is_system_role)
         VALUES (?, 'Super Admin', 'Full access to everything', TRUE)`,
        [companyId]
      );
      superAdminRoleId = (roleResult as any).insertId as number;

      // Attach ALL permissions to the new Super Admin role
      await conn.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT ?, id FROM permissions`,
        [superAdminRoleId]
      );
    }

    /* ---------- 5. Assign Super Admin to the new user ---------- */
    await conn.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
      [userId, superAdminRoleId]
    );

    /* ---------- 6. Issue session ---------- */
    const token = signSession({ userId, email });

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const ua = req.headers.get("user-agent") || null;

    await conn.query(
      `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [userId, token, ip, ua ? ua.slice(0, 500) : null, SESSION_MAX_AGE]
    );

    /* ---------- 7. Audit log ---------- */
    try {
      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
         VALUES (?, ?, 'register', 'company', ?, ?, ?)`,
        [companyId, userId, companyId, ip, ua ? ua.slice(0, 500) : null]
      );
    } catch {
      /* best-effort; don't block registration */
    }

    await conn.commit();

    /* ---------- 8. Set cookie + respond ---------- */
    const res = NextResponse.json(
      {
        user: {
          id: userId,
          name,
          email,
          company_id: companyId,
          branch_id: branchId,
          company_name: companyName,
        },
      },
      { status: 201 }
    );

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}