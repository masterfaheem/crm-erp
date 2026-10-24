import { NextRequest, NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { syncJournal } from "@/lib/accounting";

/* POST /api/accounting/sync — rebuild automatic entries from bills / payments now */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  try {
    const info = await syncJournal(user.company_id, true);
    return NextResponse.json({ data: info });
  } catch (e) {
    console.error("POST /api/accounting/sync", e);
    return NextResponse.json({ error: "Could not update the books." }, { status: 500 });
  }
}
