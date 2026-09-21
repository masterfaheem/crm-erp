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
     FROM users
     WHERE id = ? AND status = 'active'
     LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/audit-logs
   Query params:
     ?search=        -> action / entity_type / entity_id / user name
     ?action=        -> login | create | update | delete | register | logout
     ?entity_type=   -> user | branch | role | company | lead | ...
     ?user_id=       -> filter by user
     ?date_from=     -> YYYY-MM-DD
     ?date_to=       -> YYYY-MM-DD
     ?page=          -> default 1
     ?limit=         -> default 50 (max 200)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const action = searchParams.get("action")?.trim() || "";
    const entityType = searchParams.get("entity_type")?.trim() || "";
    const userIdFilter = searchParams.get("user_id")?.trim() || "";
    const dateFrom = searchParams.get("date_from")?.trim() || "";
    const dateTo = searchParams.get("date_to")?.trim() || "";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["a.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(a.action LIKE ? OR a.entity_type LIKE ?
          OR CAST(a.entity_id AS CHAR) LIKE ?
          OR u.name LIKE ?
          OR u.email LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (action) {
      where.push("a.action = ?");
      params.push(action);
    }
    if (entityType) {
      where.push("a.entity_type = ?");
      params.push(entityType);
    }
    if (userIdFilter) {
      where.push("a.user_id = ?");
      params.push(Number(userIdFilter));
    }
    if (dateFrom) {
      where.push("a.created_at >= ?");
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      where.push("a.created_at <= ?");
      params.push(`${dateTo} 23:59:59`);
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    /* ---- Count ---- */
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    /* ---- List ---- */
    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.old_values,
        a.new_values,
        a.ip_address,
        a.user_agent,
        a.created_at,
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    /* ---- Distinct action + entity values for filter dropdowns ---- */
    const [actionRows] = await pool.query(
      `SELECT DISTINCT action FROM audit_logs
       WHERE company_id = ?
       ORDER BY action ASC`,
      [authUser.company_id]
    );
    const [entityRows] = await pool.query(
      `SELECT DISTINCT entity_type FROM audit_logs
       WHERE company_id = ? AND entity_type IS NOT NULL
       ORDER BY entity_type ASC`,
      [authUser.company_id]
    );

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      filters: {
        actions: (actionRows as any[]).map((r) => r.action),
        entity_types: (entityRows as any[]).map((r) => r.entity_type),
      },
    });
  } catch (err) {
    console.error("GET /api/audit-logs error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}