import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ACC_TABLE } from "@/lib/accounting";
import { bad } from "../../_shared";

/* PUT /api/accounting/accounts/:id  { name?, is_active? }
   Accounts are never deleted (they may have history); unused ones can be switched off.
   System accounts (used by automatic posting) can be renamed but not switched off. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const id = Number((await params).id);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pool = getPool();
  const [[a]] = (await pool.query(`SELECT * FROM ${ACC_TABLE} WHERE id = ? AND company_id = ?`, [id, user.company_id])) as unknown as [[Record<string, unknown> | undefined]];
  if (!a) return bad("Account not found", 404);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) {
    const name = String(b.name || "").trim().slice(0, 150);
    if (name.length < 2) return bad("Write the account name");
    sets.push("name = ?");
    vals.push(name);
  }
  if (b.is_active !== undefined) {
    if (a.system_key && !b.is_active) return bad("This account is used by automatic posting and can't be switched off");
    sets.push("is_active = ?");
    vals.push(b.is_active ? 1 : 0);
  }
  if (!sets.length) return bad("Nothing to change");
  await pool.query(`UPDATE ${ACC_TABLE} SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  return NextResponse.json({ success: true });
}
