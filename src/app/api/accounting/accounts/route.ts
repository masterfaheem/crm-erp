import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ACC_TABLE, ACC_TYPES, accountTotals, ensureDefaultAccounts, syncJournal } from "@/lib/accounting";
import { bad } from "../_shared";

/* GET  /api/accounting/accounts       -> chart of accounts with balances (today)
   POST /api/accounting/accounts       -> { code, name, type } new account */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  try {
    const sync = await syncJournal(user.company_id);
    const rows = await accountTotals(user.company_id, null, null);
    return NextResponse.json({ data: rows, sync });
  } catch (e) {
    console.error("GET /api/accounting/accounts", e);
    return bad("Could not load accounts.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(b.code || "").trim().slice(0, 20);
  const name = String(b.name || "").trim().slice(0, 150);
  const type = String(b.type || "");
  if (!/^[A-Za-z0-9-]{2,20}$/.test(code)) return bad("Code: 2–20 letters / numbers");
  if (name.length < 2) return bad("Write the account name");
  if (!ACC_TYPES.includes(type as never)) return bad("Choose the account type");
  try {
    await ensureDefaultAccounts(user.company_id);
    const subtype = type === "expense" ? "expense" : type === "income" ? "other_income" : type === "equity" ? "equity" : null;
    const [r] = await getPool().query(
      `INSERT INTO ${ACC_TABLE} (company_id, code, name, type, subtype) VALUES (?, ?, ?, ?, ?)`,
      [user.company_id, code, name, type, subtype]
    );
    return NextResponse.json({ data: { id: (r as { insertId: number }).insertId } }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return bad("This account code is already used", 409);
    console.error("POST /api/accounting/accounts", e);
    return bad("Could not add the account.", 500);
  }
}
