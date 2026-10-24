import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { claimClientRef, cleanClientRef, finishClientRef, invoiceForClientRef } from "@/lib/posSale";
import {
  OpError,
  cleanExchangeInput,
  createExchange,
  ensureSalesOpsTables,
  listExchanges,
  loadExchangeSource,
} from "@/lib/salesOps";

/* ============================================================
   GET  /api/exchanges?invoice=<INV-2026-0012 | id>   -> the bill to exchange
   GET  /api/exchanges?customer_id= | ?invoice_id=     -> exchange / warranty history
   POST /api/exchanges   -> make the exchange (one EXC- bill)
============================================================ */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  try {
    await ensureSalesOpsTables();
    const sp = new URL(req.url).searchParams;
    const pool = getPool();
    const key = (sp.get("invoice") || "").trim();
    if (key) {
      const src = await loadExchangeSource(pool, user.company_id, key);
      if (!src) return NextResponse.json({ error: "Bill not found. Check the bill number." }, { status: 404 });
      return NextResponse.json({ data: src });
    }
    const customerId = Number(sp.get("customer_id")) || 0;
    const invoiceId = Number(sp.get("invoice_id")) || 0;
    if (!customerId && !invoiceId) return NextResponse.json({ data: [] });
    const list = await listExchanges(pool, user.company_id, { customer_id: customerId || undefined, invoice_id: invoiceId || undefined });
    return NextResponse.json({ data: list });
  } catch (err) {
    console.error("GET /api/exchanges error:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const { value, error } = cleanExchangeInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const clientRef = cleanClientRef((body as Record<string, unknown>).client_ref);

  await ensureSalesOpsTables();
  const pool = getPool();
  const done = async (invoiceId: number) => {
    const [rows] = await pool.query(
      "SELECT exchange_number, exchange_invoice_id AS invoice_id, difference FROM crm_exchanges WHERE exchange_invoice_id = ? LIMIT 1",
      [invoiceId]
    );
    return NextResponse.json({ data: (rows as unknown[])[0], duplicate: true });
  };
  if (clientRef) {
    const id = await invoiceForClientRef(user.company_id, clientRef);
    if (id) return done(id);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (clientRef) {
      try {
        await claimClientRef(conn, user.company_id, clientRef, user.id);
      } catch (e) {
        if ((e as { code?: string })?.code !== "ER_DUP_ENTRY") throw e;
        await conn.rollback();
        const id = await invoiceForClientRef(user.company_id, clientRef);
        if (id) return done(id);
        return NextResponse.json({ error: "This exchange is already being saved." }, { status: 409 });
      }
    }
    const result = await createExchange(conn, user, value);
    if (clientRef) await finishClientRef(conn, user.company_id, clientRef, result.invoice_id);
    await conn.commit();
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/exchanges error:", e);
    return NextResponse.json({ error: "Failed to save the exchange." }, { status: 500 });
  } finally {
    conn.release();
  }
}
