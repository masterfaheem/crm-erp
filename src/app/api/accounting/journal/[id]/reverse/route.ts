import { NextRequest, NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { reverseManualEntry } from "@/lib/accounting";
import { writeAudit } from "@/lib/audit";
import { bad, todayPKT, ymd } from "../../../_shared";

/* POST /api/accounting/journal/:id/reverse { date? } — opposite entry; nothing is deleted */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const id = Number((await params).id);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await reverseManualEntry(user, id, ymd(b.date) || todayPKT());
    await writeAudit(req, user, "journal_reverse", "journal", id);
    return NextResponse.json({ data: r }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/not found|Automatic|already reversed/.test(msg)) return bad(msg, 409);
    console.error("reverse journal", e);
    return bad("Could not reverse the entry.", 500);
  }
}
