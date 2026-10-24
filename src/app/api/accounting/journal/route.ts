import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ACC_TABLE, JE_TABLE, JL_TABLE, createManualEntry, ensureDefaultAccounts, syncJournal } from "@/lib/accounting";
import { writeAudit } from "@/lib/audit";
import { bad, todayPKT, ymd } from "../_shared";

type Row = Record<string, unknown>;

/* ============================================================
   GET  /api/accounting/journal?from=&to=&source=&search=&page=
   POST /api/accounting/journal
        { kind: "expense", account_id, paid_from: "cash"|"bank"|"wallet"|<account id>, amount, date, memo }
        { kind: "manual", date, memo, lines: [{ account_id, debit, credit, description }] }
============================================================ */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  try {
    await syncJournal(user.company_id);
    const sp = new URL(req.url).searchParams;
    const w: string[] = ["e.company_id = ?"];
    const p: unknown[] = [user.company_id];
    const from = ymd(sp.get("from"));
    const to = ymd(sp.get("to"));
    if (from) { w.push("e.entry_date >= ?"); p.push(from); }
    if (to) { w.push("e.entry_date <= ?"); p.push(to); }
    const source = sp.get("source");
    if (source === "manual") w.push("e.is_auto = 0");
    else if (source) { w.push("e.source_type = ?"); p.push(source); }
    const search = (sp.get("search") || "").trim();
    if (search) { w.push("(e.source_ref LIKE ? OR e.memo LIKE ? OR e.entry_number LIKE ?)"); p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = 50;
    const pool = getPool();
    const [[cnt]] = (await pool.query(`SELECT COUNT(*) AS n FROM ${JE_TABLE} e WHERE ${w.join(" AND ")}`, p)) as unknown as [[Row]];
    const [entries] = await pool.query(
      `SELECT e.id, e.entry_number, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date, e.source_type, e.source_id, e.source_ref,
              e.memo, e.is_auto, e.reversed_by, u.name AS created_by_name
         FROM ${JE_TABLE} e LEFT JOIN users u ON u.id = e.created_by
        WHERE ${w.join(" AND ")} ORDER BY e.entry_date DESC, e.id DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit]
    );
    const ids = (entries as Row[]).map((e) => e.id);
    const lines = new Map<number, Row[]>();
    if (ids.length) {
      const [ls] = await pool.query(
        `SELECT l.entry_id, l.debit, l.credit, l.description, l.party_type, l.party_id, a.code, a.name AS account_name,
                COALESCE(c.name, s.name) AS party_name
           FROM ${JL_TABLE} l JOIN ${ACC_TABLE} a ON a.id = l.account_id
           LEFT JOIN customers c ON l.party_type = 'customer' AND c.id = l.party_id
           LEFT JOIN suppliers s ON l.party_type = 'supplier' AND s.id = l.party_id
          WHERE l.entry_id IN (?) ORDER BY l.entry_id, l.debit DESC, l.id`,
        [ids]
      ).catch(async () =>
        pool.query(
          `SELECT l.entry_id, l.debit, l.credit, l.description, l.party_type, l.party_id, a.code, a.name AS account_name, c.name AS party_name
             FROM ${JL_TABLE} l JOIN ${ACC_TABLE} a ON a.id = l.account_id
             LEFT JOIN customers c ON l.party_type = 'customer' AND c.id = l.party_id
            WHERE l.entry_id IN (?) ORDER BY l.entry_id, l.debit DESC, l.id`,
          [ids]
        )
      );
      for (const l of ls as Row[]) {
        const k = Number(l.entry_id);
        if (!lines.has(k)) lines.set(k, []);
        lines.get(k)!.push({ ...l, debit: Number(l.debit), credit: Number(l.credit) });
      }
    }
    return NextResponse.json({
      data: (entries as Row[]).map((e) => ({ ...e, lines: lines.get(Number(e.id)) || [] })),
      pagination: { page, limit, total: Number(cnt?.n || 0), total_pages: Math.ceil(Number(cnt?.n || 0) / limit) },
    });
  } catch (e) {
    console.error("GET /api/accounting/journal", e);
    return bad("Could not load journal.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = ymd(b.date) || todayPKT();
  const memo = String(b.memo || "").trim().slice(0, 500);
  try {
    await ensureDefaultAccounts(user.company_id);
    const pool = getPool();
    let result;
    if (b.kind === "expense") {
      const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
      if (!(amount > 0)) return bad("Enter the amount");
      if (memo.length < 2) return bad("Write what the expense was for");
      const accountId = Number(b.account_id);
      const [[acc]] = (await pool.query(`SELECT id, type FROM ${ACC_TABLE} WHERE id = ? AND company_id = ? AND is_active = 1`, [accountId, user.company_id])) as unknown as [[Row | undefined]];
      if (!acc || acc.type !== "expense") return bad("Choose an expense account");
      let fromId = Number(b.paid_from) || 0;
      if (!fromId) {
        const [[k]] = (await pool.query(`SELECT id FROM ${ACC_TABLE} WHERE company_id = ? AND system_key = ?`, [user.company_id, String(b.paid_from || "cash")])) as unknown as [[Row | undefined]];
        fromId = Number(k?.id || 0);
      }
      const [[fromAcc]] = (await pool.query(`SELECT id, type FROM ${ACC_TABLE} WHERE id = ? AND company_id = ?`, [fromId, user.company_id])) as unknown as [[Row | undefined]];
      if (!fromAcc || !["asset", "liability", "equity"].includes(String(fromAcc.type))) return bad("Choose where the money was paid from");
      result = await createManualEntry(user, {
        entry_date: date, memo, source_type: "expense",
        lines: [{ account_id: accountId, debit: amount, credit: 0, description: memo }, { account_id: fromId, debit: 0, credit: amount, description: memo }],
      });
    } else {
      if (memo.length < 2) return bad("Write a short description");
      const lines = (Array.isArray(b.lines) ? b.lines : []).map((l: Row) => ({
        account_id: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description ? String(l.description) : null,
      }));
      result = await createManualEntry(user, { entry_date: date, memo, lines });
    }
    await writeAudit(req, user, b.kind === "expense" ? "expense_entry" : "journal_entry", "journal", result.id);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/must be equal|at least two|not both|valid date|not valid/.test(msg)) return bad(msg);
    console.error("POST /api/accounting/journal", e);
    return bad("Could not save the entry.", 500);
  }
}
