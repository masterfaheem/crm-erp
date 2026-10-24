import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ACC_TABLE, JE_TABLE, JL_TABLE, syncJournal } from "@/lib/accounting";
import { bad, ymd } from "../_shared";

type Row = Record<string, unknown>;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* GET /api/accounting/ledger?account_id=&from=&to=  — one account, running balance */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  try {
    await syncJournal(user.company_id);
    const sp = new URL(req.url).searchParams;
    const accountId = Number(sp.get("account_id"));
    const from = ymd(sp.get("from"));
    const to = ymd(sp.get("to"));
    const pool = getPool();
    const [[acc]] = (await pool.query(`SELECT * FROM ${ACC_TABLE} WHERE id = ? AND company_id = ?`, [accountId, user.company_id])) as unknown as [[Row | undefined]];
    if (!acc) return bad("Account not found", 404);
    const debitNature = acc.type === "asset" || acc.type === "expense";
    const sign = (d: number, c: number) => (debitNature ? d - c : c - d);
    let opening = 0;
    if (from) {
      const [[o]] = (await pool.query(
        `SELECT COALESCE(SUM(l.debit), 0) AS d, COALESCE(SUM(l.credit), 0) AS c FROM ${JL_TABLE} l JOIN ${JE_TABLE} e ON e.id = l.entry_id
          WHERE e.company_id = ? AND l.account_id = ? AND e.entry_date < ?`,
        [user.company_id, accountId, from]
      )) as unknown as [[Row]];
      opening = r2(sign(Number(o.d), Number(o.c)));
    }
    const w = ["e.company_id = ?", "l.account_id = ?"];
    const p: unknown[] = [user.company_id, accountId];
    if (from) { w.push("e.entry_date >= ?"); p.push(from); }
    if (to) { w.push("e.entry_date <= ?"); p.push(to); }
    const [rows] = await pool.query(
      `SELECT e.id AS entry_id, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS d, e.entry_number, e.source_type, e.source_id, e.source_ref, e.memo,
              l.debit, l.credit, l.description, l.party_type, l.party_id, c.name AS party_name
         FROM ${JL_TABLE} l JOIN ${JE_TABLE} e ON e.id = l.entry_id
         LEFT JOIN customers c ON l.party_type = 'customer' AND c.id = l.party_id
        WHERE ${w.join(" AND ")} ORDER BY e.entry_date, e.id, l.id LIMIT 5000`,
      p
    );
    let run = opening;
    const list = (rows as Row[]).map((r) => {
      run = r2(run + sign(Number(r.debit), Number(r.credit)));
      return { ...r, debit: Number(r.debit), credit: Number(r.credit), balance: run };
    });
    return NextResponse.json({
      data: { account: acc, opening, closing: run, lines: list, debit_nature: debitNature },
    });
  } catch (e) {
    console.error("GET /api/accounting/ledger", e);
    return bad("Could not load the ledger.", 500);
  }
}
