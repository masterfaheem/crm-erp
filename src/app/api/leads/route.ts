import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEADS_TABLE,
  LEAD_PRIORITIES,
  LEAD_SELECT,
  LEAD_SOURCE_VALUES,
  LEAD_STATUSES,
  buildLeadFilters,
  cleanDate,
  cleanStr,
  ensureLeadsTable,
  formatLeadNumber,
  mapLeadRow,
  nextLeadNumberBase,
} from "@/lib/leadsTable";

/* ============================================================
   GET /api/leads
   ?page= ?limit= + all filters (see buildLeadFilters)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const sp = new URL(req.url).searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(sp.get("limit") || "20", 10) || 20)
    );
    const offset = (page - 1) * limit;

    const { whereSql, params } = buildLeadFilters(sp, user.company_id);
    const pool = getPool();

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${LEADS_TABLE} l WHERE ${whereSql}`,
      params
    );
    const total = Number((countRows as { total: number }[])[0]?.total || 0);

    const [rows] = await pool.query(
      `${LEAD_SELECT} WHERE ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      data: (rows as unknown[]).map(mapLeadRow),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

/* ============================================================
   POST /api/leads  -> create lead
============================================================ */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const body = await req.json().catch(() => ({}));

    const firstName = cleanStr(body.first_name, 120);
    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required" },
        { status: 400 }
      );
    }

    const source = cleanStr(body.source, 50);
    if (source && !LEAD_SOURCE_VALUES.includes(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    const status = LEAD_STATUSES.includes(body.status) ? body.status : "new";
    const priority = LEAD_PRIORITIES.includes(body.priority)
      ? body.priority
      : "medium";
    const assignedTo = body.assigned_to ? Number(body.assigned_to) || null : null;
    const estimated = Number(body.estimated_value) || 0;

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Next lead number: LEAD-0001, LEAD-0002, ...
      const next = (await nextLeadNumberBase(conn, user.company_id)) + 1;
      const leadNumber = formatLeadNumber(next);

      const [result] = await conn.query(
        `INSERT INTO ${LEADS_TABLE}
          (company_id, branch_id, lead_number, first_name, last_name,
           company_name, designation, email, phone, alternate_phone, whatsapp,
           source, city, assigned_to, status, priority, estimated_value,
           expected_close_date, address, description, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          user.company_id,
          user.branch_id ?? null,
          leadNumber,
          firstName,
          cleanStr(body.last_name, 120),
          cleanStr(body.company_name, 200),
          cleanStr(body.designation, 120),
          cleanStr(body.email, 190),
          cleanStr(body.phone, 40),
          cleanStr(body.alternate_phone, 40),
          cleanStr(body.whatsapp, 40),
          source,
          cleanStr(body.city, 100),
          assignedTo,
          status,
          priority,
          estimated,
          cleanDate(body.expected_close_date),
          cleanStr(body.address, 5000),
          cleanStr(body.description, 10000),
          user.id,
        ]
      );
      await conn.commit();

      const insertId = (result as { insertId: number }).insertId;
      const [rows] = await pool.query(`${LEAD_SELECT} WHERE l.id = ?`, [
        insertId,
      ]);
      return NextResponse.json(
        { data: mapLeadRow((rows as unknown[])[0]) },
        { status: 201 }
      );
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("POST /api/leads error:", err);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
