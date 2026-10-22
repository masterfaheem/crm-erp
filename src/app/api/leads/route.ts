import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEADS_TABLE,
  LEAD_SELECT,
  buildLeadFilters,
  ensureLeadsTable,
  formatLeadNumber,
  mapLeadRow,
  nextLeadNumberBase,
  parseLeadInput,
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
    const fu = sp.get("follow_up") || "";
    const orderSql =
      fu === "done"
        ? "l.follow_up_at DESC"
        : fu
        ? "l.follow_up_at ASC"
        : "l.id DESC";
    const pool = getPool();

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${LEADS_TABLE} l WHERE ${whereSql}`,
      params
    );
    const total = Number((countRows as { total: number }[])[0]?.total || 0);

    const [rows] = await pool.query(
      `${LEAD_SELECT} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
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
    const { values, error } = parseLeadInput(body, false);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Next lead number: LEAD-0001, LEAD-0002, ...
      const next = (await nextLeadNumberBase(conn, user.company_id)) + 1;
      const row: Record<string, unknown> = {
        company_id: user.company_id,
        branch_id: user.branch_id ?? null,
        lead_number: formatLeadNumber(next),
        created_by: user.id,
        ...values,
      };
      const cols = Object.keys(row);
      const [result] = await conn.query(
        `INSERT INTO ${LEADS_TABLE} (${cols.join(", ")}) VALUES (${cols
          .map(() => "?")
          .join(", ")})`,
        cols.map((c) => row[c])
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
