import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { LEADS_TABLE, ensureLeadsTable } from "@/lib/leadsTable";
import { phoneMatchSql, uniqueKeys } from "@/lib/orderHandover";

/* ============================================================
   GET /api/leads/check-phone?phone=...&exclude=<leadId>
   Warns about an existing lead / customer with the same number.
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    const sp = new URL(req.url).searchParams;
    const keys = uniqueKeys(sp.get("phone")).filter((k) => k.length >= 10);
    if (!keys.length) return NextResponse.json({ data: { leads: [], customers: [] } });
    const exclude = Number(sp.get("exclude")) || 0;
    const pool = getPool();

    const lm = phoneMatchSql(["l.phone", "l.whatsapp", "l.alternate_phone"], keys);
    const [leads] = await pool.query(
      `SELECT l.id, l.lead_number, l.first_name, l.last_name, l.status
         FROM ${LEADS_TABLE} l
        WHERE l.company_id = ? AND l.id <> ? AND ${lm.sql}
        ORDER BY l.id DESC LIMIT 5`,
      [user.company_id, exclude, ...lm.params]
    );
    const cm = phoneMatchSql(["phone", "whatsapp", "alternate_phone"], keys);
    const [customers] = await pool.query(
      `SELECT id, customer_code, name FROM customers
        WHERE company_id = ? AND ${cm.sql} ORDER BY id ASC LIMIT 3`,
      [user.company_id, ...cm.params]
    );
    return NextResponse.json({ data: { leads, customers } });
  } catch (err) {
    console.error("GET /api/leads/check-phone error:", err);
    return NextResponse.json({ data: { leads: [], customers: [] } });
  }
}
