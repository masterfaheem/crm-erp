import { NextRequest, NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { getWarrantyRules, saveWarrantyRules } from "@/lib/companySettings";
import { writeAudit } from "@/lib/audit";

/* ============================================================
   GET /api/settings/extended-warranty   -> { data: rules }
     (any signed-in user: POS and lead orders need the prices)
   PUT /api/settings/extended-warranty   { "6m": {type,value,enabled}, "12m": {...} }
     (Branches & company settings permission — checked in proxy)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    return NextResponse.json({ data: await getWarrantyRules(user.company_id) });
  } catch (err) {
    console.error("GET /api/settings/extended-warranty error:", err);
    return NextResponse.json({ error: "Failed to load warranty prices" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    const body = await req.json().catch(() => ({}));
    const data = await saveWarrantyRules(user.company_id, body, user.id);
    await writeAudit(req, user, "update", "extended_warranty", null);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("PUT /api/settings/extended-warranty error:", err);
    return NextResponse.json({ error: "Failed to save warranty prices" }, { status: 500 });
  }
}
