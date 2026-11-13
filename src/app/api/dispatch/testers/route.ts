import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

/* ============================================================
   GET /api/dispatch/testers  -> { data: [{ id, name }] }
   Active team members, for the "Tested by" dropdown on the QC
   checklist (the testing PC is shared, so the name is picked).
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    const [rows] = await getPool().query(
      `SELECT id, name FROM users WHERE company_id = ? AND status = 'active' ORDER BY name ASC`,
      [user.company_id]
    );
    return NextResponse.json({ data: rows, me: user.id });
  } catch (err) {
    console.error("GET /api/dispatch/testers error:", err);
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
