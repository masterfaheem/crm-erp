import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

/* ============================================================
   GET /api/units
   Query: ?search=&status=
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) return unauthorized();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const where: string[] = ["u.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push("(u.name LIKE ? OR u.short_name LIKE ? OR u.description LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) {
      where.push("u.status = ?");
      params.push(status);
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
         u.id, u.name, u.short_name, u.description, u.status, u.created_at,
         (SELECT COUNT(*) FROM products p WHERE p.unit_id = u.id) AS product_count
       FROM units u
       WHERE ${where.join(" AND ")}
       ORDER BY u.name ASC`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/units error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ============================================================
   POST /api/units
   Body: { name, short_name, description?, status? }
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const authUser = await requireUser(req);
    if (!authUser) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const short_name = String(body.short_name || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const status = body.status === "inactive" ? "inactive" : "active";

    if (!name || !short_name) {
      return NextResponse.json(
        { error: "Name and short name are required" },
        { status: 400 }
      );
    }

    const [dup] = await conn.query(
      `SELECT id FROM units
        WHERE company_id = ? AND (name = ? OR short_name = ?)
        LIMIT 1`,
      [authUser.company_id, name, short_name]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "A unit with this name or short name already exists" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO units (company_id, name, short_name, description, status)
       VALUES (?, ?, ?, ?, ?)`,
      [authUser.company_id, name, short_name, description, status]
    );
    const newId = (result as any).insertId as number;

    try {
      await conn.query(
        `INSERT INTO audit_logs
           (company_id, user_id, action, entity_type, entity_id, new_values)
         VALUES (?, ?, 'create', 'unit', ?, ?)`,
        [authUser.company_id, authUser.id, newId, JSON.stringify({ name, short_name, status })]
      );
    } catch {}

    await conn.commit();
    return NextResponse.json({ message: "Unit created", id: newId }, { status: 201 });
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/units error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    conn.release();
  }
}
