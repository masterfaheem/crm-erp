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
     FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/customer-groups
   List groups with member counts.
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const where: string[] = ["g.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(`(g.name LIKE ? OR g.description LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (status) {
      where.push("g.status = ?");
      params.push(status);
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        g.id,
        g.name,
        g.description,
        g.color,
        g.discount_percent,
        g.status,
        g.created_at,
        (SELECT COUNT(*) FROM customer_group_members m WHERE m.group_id = g.id) AS member_count
      FROM customer_groups g
      WHERE ${where.join(" AND ")}
      ORDER BY g.created_at DESC`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/customer-groups error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/customer-groups
   Body: { name, description?, color?, discount_percent?, status? }
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const name = String(body.name || "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const color = body.color ? String(body.color).trim() : "#17D65D";
    const discountPercent = Number(body.discount_percent ?? 0);
    const status = body.status || "active";

    if (!name) {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }
    if (name.length > 150) {
      return NextResponse.json(
        { error: "Group name is too long" },
        { status: 400 }
      );
    }
    if (discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json(
        { error: "Discount must be between 0 and 100" },
        { status: 400 }
      );
    }

    /* ---- Duplicate name check ---- */
    const [dup] = await conn.query(
      `SELECT id FROM customer_groups
       WHERE company_id = ? AND name = ? LIMIT 1`,
      [authUser.company_id, name]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "A group with this name already exists" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO customer_groups
        (company_id, name, description, color, discount_percent, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        name,
        description,
        color,
        discountPercent,
        status,
        authUser.id,
      ]
    );
    const groupId = (result as any).insertId as number;

    /* ---- Audit log (best-effort) ---- */
    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;

      await conn.query(
        `INSERT INTO audit_logs
           (company_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES (?, ?, 'create', 'customer_group', ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          groupId,
          JSON.stringify({ name, discount_percent: discountPercent, status }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json(
      { message: "Group created successfully", id: groupId },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/customer-groups error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}