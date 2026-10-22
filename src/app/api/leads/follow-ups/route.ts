import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { LEADS_TABLE, ensureLeadsTable, nowPKT } from "@/lib/leadsTable";

/* ============================================================
   GET /api/leads/follow-ups
   Counts for the follow-up reminders (badge + tabs).
   The list itself comes from GET /api/leads?follow_up=<scope>
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const now = nowPKT();
    const endOfDay = `${now.slice(0, 10)} 23:59:59`;
    const [rows] = await getPool().query(
      `SELECT
         SUM(follow_up_done = 0 AND follow_up_at < ?)                AS overdue,
         SUM(follow_up_done = 0 AND follow_up_at BETWEEN ? AND ?)    AS today,
         SUM(follow_up_done = 0 AND follow_up_at > ?)                AS upcoming,
         SUM(follow_up_done = 1)                                     AS done
       FROM ${LEADS_TABLE}
       WHERE company_id = ? AND follow_up_at IS NOT NULL`,
      [now, now, endOfDay, endOfDay, user.company_id]
    );
    const r = (rows as Record<string, unknown>[])[0] || {};
    const n = (k: string) => Number(r[k] || 0);
    return NextResponse.json({
      data: {
        overdue: n("overdue"),
        today: n("today"),
        upcoming: n("upcoming"),
        done: n("done"),
        due: n("overdue") + n("today"),
        now,
      },
    });
  } catch (err) {
    console.error("GET /api/leads/follow-ups error:", err);
    return NextResponse.json({ error: "Failed to load follow-ups" }, { status: 500 });
  }
}
