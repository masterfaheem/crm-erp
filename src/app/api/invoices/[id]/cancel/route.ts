import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { OpError, cancelInvoice, cleanCancelInput, ensureSalesOpsTables } from "@/lib/salesOps";

/* ============================================================
   POST /api/invoices/:id/cancel
   { reason, settlement: "refund" | "credit", refund_method?, refund_reference? }
   The bill stays on record as Cancelled (never deleted):
   stock comes back, money is refunded or kept as customer credit,
   the CRM lead / online order go back to where they were.
============================================================ */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const { value, error } = cleanCancelInput(await req.json().catch(() => ({})));
  if (error) return NextResponse.json({ error }, { status: 400 });

  await ensureSalesOpsTables();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await cancelInvoice(conn, user, id, value);
    await conn.commit();
    return NextResponse.json({ data: result });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/invoices/:id/cancel]", e);
    return NextResponse.json({ error: "Failed to cancel the bill." }, { status: 500 });
  } finally {
    conn.release();
  }
}
