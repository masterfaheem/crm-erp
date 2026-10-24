import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { LEADS_TABLE } from "@/lib/leadsTable";
import { phoneMatchSql, uniqueKeys } from "@/lib/orderHandover";
import { ensurePosTables, openLeadsForCustomer } from "@/lib/posSale";

/* ============================================================
   GET /api/pos/lead-match?customer_id=
   For a walk-in bill: the customer's open lead (it will be marked
   Won) + last known source / profession to pre-fill the form.
============================================================ */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const customerId = Number(new URL(req.url).searchParams.get("customer_id"));
  if (!customerId) return NextResponse.json({ data: { open_leads: [], last: null, past_purchases: 0 } });
  try {
    await ensurePosTables();
    const pool = getPool();
    const open = await openLeadsForCustomer(pool, user.company_id, customerId);

    /* most recent lead of any status with these numbers (for pre-fill) */
    let last: Record<string, unknown> | null = null;
    const [[c]] = (await pool.query(
      "SELECT phone, whatsapp, alternate_phone FROM customers WHERE id = ? AND company_id = ?",
      [customerId, user.company_id]
    )) as unknown as [Record<string, unknown>[]];
    if (c) {
      const keys = uniqueKeys(c.phone, c.whatsapp, c.alternate_phone).filter((k) => k.length >= 10);
      if (keys.length) {
        const m = phoneMatchSql(["l.phone", "l.whatsapp", "l.alternate_phone"], keys);
        const [rows] = await pool.query(
          `SELECT l.lead_number, l.status, l.source, l.profession, l.profession_other
             FROM ${LEADS_TABLE} l WHERE l.company_id = ? AND ${m.sql} ORDER BY l.id DESC LIMIT 1`,
          [user.company_id, ...m.params]
        );
        last = (rows as Record<string, unknown>[])[0] || null;
      }
    }
    const [[pp]] = (await pool.query(
      "SELECT COUNT(*) AS n FROM invoices WHERE company_id = ? AND customer_id = ? AND status <> 'cancelled'",
      [user.company_id, customerId]
    )) as unknown as [{ n: number }[]];

    return NextResponse.json({ data: { open_leads: open, last, past_purchases: Number(pp?.n || 0) } });
  } catch (err) {
    console.error("GET /api/pos/lead-match error:", err);
    return NextResponse.json({ data: { open_leads: [], last: null, past_purchases: 0 } });
  }
}
