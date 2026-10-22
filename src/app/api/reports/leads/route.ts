import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { LEADS_TABLE, cleanDate, ensureLeadsTable, nowPKT } from "@/lib/leadsTable";
import { HANDOVER_TABLE } from "@/lib/orderHandover";

/* ============================================================
   GET /api/reports/leads?from=YYYY-MM-DD&to=YYYY-MM-DD&source=&assigned_to=
   Everything the marketing / sales team needs from lead fields.
============================================================ */
type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const sp = new URL(req.url).searchParams;
    const from = cleanDate(sp.get("from"));
    const to = cleanDate(sp.get("to"));
    const where: string[] = ["l.company_id = ?"];
    const params: unknown[] = [user.company_id];
    if (from) {
      where.push("DATE(l.created_at) >= ?");
      params.push(from);
    }
    if (to) {
      where.push("DATE(l.created_at) <= ?");
      params.push(to);
    }
    const source = sp.get("source");
    if (source) {
      where.push("l.source = ?");
      params.push(source);
    }
    const assigned = sp.get("assigned_to");
    if (assigned === "unassigned") where.push("l.assigned_to IS NULL");
    else if (Number(assigned)) {
      where.push("l.assigned_to = ?");
      params.push(Number(assigned));
    }
    const W = where.join(" AND ");
    const pool = getPool();
    const q = async (sql: string, extra: unknown[] = []) =>
      (await pool.query(sql, [...params, ...extra]))[0] as Row[];

    const FROM = `FROM ${LEADS_TABLE} l LEFT JOIN ${HANDOVER_TABLE} h ON h.lead_id = l.id`;
    /* per-group stats: total, won, lost, open, revenue */
    const STATS = `COUNT(*) AS total,
       SUM(l.status = 'won') AS won,
       SUM(l.status = 'lost') AS lost,
       SUM(l.status NOT IN ('won','lost')) AS open,
       COALESCE(SUM(h.total_amount), 0) AS revenue,
       SUM(h.id IS NOT NULL) AS orders`;

    const by = (col: string) =>
      q(`SELECT ${col} AS k, ${STATS} ${FROM} WHERE ${W} GROUP BY ${col} ORDER BY total DESC`);

    const [
      totalsRows,
      byStatus,
      bySource,
      byCity,
      byProfession,
      byBudget,
      byPriority,
      byLostReason,
      byAssigned,
      byDay,
      byWeekday,
      byHour,
      useCaseRows,
      speedRows,
    ] = await Promise.all([
      q(`SELECT ${STATS},
            AVG(CASE WHEN h.id IS NOT NULL THEN h.total_amount END) AS avg_order,
            SUM(l.whatsapp IS NULL AND l.phone IS NULL) AS no_number,
            SUM(l.source IS NULL) AS no_source,
            SUM(l.city IS NULL) AS no_city,
            SUM(l.budget_range IS NULL) AS no_budget,
            SUM(l.profession IS NULL) AS no_profession
          ${FROM} WHERE ${W}`),
      by("l.status"),
      by("l.source"),
      q(`SELECT l.city AS k, ${STATS} ${FROM} WHERE ${W} GROUP BY l.city ORDER BY total DESC LIMIT 25`),
      q(`SELECT CASE WHEN l.profession = 'other' THEN CONCAT('other:', IFNULL(l.profession_other,'Other')) ELSE l.profession END AS k,
              ${STATS} ${FROM} WHERE ${W} GROUP BY k ORDER BY total DESC LIMIT 20`),
      by("l.budget_range"),
      by("l.priority"),
      q(`SELECT CASE WHEN l.lost_reason = 'other' THEN CONCAT('other:', IFNULL(l.lost_reason_other,'Other')) ELSE l.lost_reason END AS k,
              COUNT(*) AS total ${FROM} WHERE ${W} AND l.status = 'lost' GROUP BY k ORDER BY total DESC`),
      q(`SELECT IFNULL(u.name, 'Unassigned') AS k, ${STATS}
           ${FROM} LEFT JOIN users u ON u.id = l.assigned_to WHERE ${W} GROUP BY k ORDER BY total DESC`),
      q(`SELECT DATE_FORMAT(l.created_at, '%Y-%m-%d') AS k, COUNT(*) AS total, SUM(l.status = 'won') AS won
           ${FROM} WHERE ${W} GROUP BY k ORDER BY k ASC`),
      q(`SELECT DAYOFWEEK(l.created_at) AS k, COUNT(*) AS total, SUM(l.status = 'won') AS won
           ${FROM} WHERE ${W} GROUP BY k ORDER BY k`),
      q(`SELECT HOUR(l.created_at) AS k, COUNT(*) AS total ${FROM} WHERE ${W} GROUP BY k ORDER BY k`),
      q(`SELECT l.use_cases, l.use_case_custom, l.status, h.total_amount ${FROM} WHERE ${W} AND l.use_cases IS NOT NULL`),
      q(`SELECT AVG(TIMESTAMPDIFF(HOUR, l.created_at, h.created_at)) AS hours_to_order
           ${FROM} WHERE ${W} AND h.id IS NOT NULL`),
    ]);

    /* follow-ups (separate query: needs time params after the filters) */
    const now = nowPKT();
    const [fu] = await pool.query(
      `SELECT SUM(l.follow_up_done = 0 AND l.follow_up_at < ?) AS overdue,
              SUM(l.follow_up_done = 0 AND l.follow_up_at >= ?) AS upcoming,
              SUM(l.follow_up_done = 1) AS done
         FROM ${LEADS_TABLE} l WHERE ${W} AND l.follow_up_at IS NOT NULL`,
      [now, now, ...params]
    );

    /* use cases are comma-separated -> count each */
    const ucMap = new Map<string, { k: string; total: number; won: number; revenue: number }>();
    for (const r of useCaseRows) {
      for (const key of String(r.use_cases || "").split(",").filter(Boolean)) {
        const k = key === "custom" ? `custom:${r.use_case_custom || "Custom"}` : key;
        const e = ucMap.get(k) || { k, total: 0, won: 0, revenue: 0 };
        e.total++;
        if (r.status === "won") e.won++;
        e.revenue += Number(r.total_amount || 0);
        ucMap.set(k, e);
      }
    }

    const num = (rows: Row[]) =>
      rows.map((r) => {
        const o: Row = {};
        for (const [k, v] of Object.entries(r)) o[k] = k === "k" ? v : v === null ? 0 : Number(v);
        return o;
      });

    const t = totalsRows[0] || {};
    const totals = Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, v === null ? 0 : Number(v)])
    );

    return NextResponse.json({
      data: {
        range: { from, to },
        totals,
        speed: { hours_to_order: Number(speedRows[0]?.hours_to_order || 0) },
        follow_ups: Object.fromEntries(
          Object.entries((fu as Row[])[0] || {}).map(([k, v]) => [k, Number(v || 0)])
        ),
        by_status: num(byStatus),
        by_source: num(bySource),
        by_city: num(byCity),
        by_profession: num(byProfession),
        by_budget: num(byBudget),
        by_priority: num(byPriority),
        by_lost_reason: num(byLostReason),
        by_assigned: num(byAssigned),
        by_use_case: Array.from(ucMap.values()).sort((a, b) => b.total - a.total),
        by_day: num(byDay),
        by_weekday: num(byWeekday),
        by_hour: num(byHour),
      },
    });
  } catch (err) {
    console.error("GET /api/reports/leads error:", err);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
