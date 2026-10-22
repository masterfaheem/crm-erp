import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { cleanStr } from "@/lib/leadsTable";
import {
  DISPATCH_STATUSES,
  HANDOVER_TABLE,
  SO_STATUS_FOR,
  ensureHandoverTable,
} from "@/lib/orderHandover";

type Ctx = { params: Promise<{ id: string }> };

/* ============================================================
   PUT /api/dispatch/:id
   { status?, courier?, tracking_no?, dispatch_notes? }
   Rules: shipped / delivered need an invoice first (bill from POS);
          an invoiced order can't be cancelled here.
============================================================ */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureHandoverTable();
    const id = Number((await params).id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await req.json().catch(() => ({}));
    const pool = getPool();

    const [hr] = await pool.query(
      `SELECT * FROM ${HANDOVER_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, user.company_id]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = (hr as any[])[0];
    if (!h) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, max] of [["courier", 60], ["tracking_no", 100], ["dispatch_notes", 1000]] as const) {
      if (body[k] !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(cleanStr(body[k], max));
      }
    }

    let newStatus: string | null = null;
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!DISPATCH_STATUSES.includes(s) || s === "invoiced") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if ((s === "shipped" || s === "delivered") && !h.invoice_id) {
        return NextResponse.json(
          { error: "Create the bill in POS first, then mark it shipped" },
          { status: 400 }
        );
      }
      if (s === "cancelled" && h.invoice_id) {
        return NextResponse.json(
          { error: "This order is already billed — cancel the invoice first" },
          { status: 400 }
        );
      }
      if (s === "pending" && h.invoice_id) {
        return NextResponse.json({ error: "Order is already billed" }, { status: 400 });
      }
      newStatus = s;
      sets.push("status = ?");
      vals.push(s);
    }

    if (sets.length) {
      await pool.query(
        `UPDATE ${HANDOVER_TABLE} SET ${sets.join(", ")} WHERE id = ?`,
        [...vals, id]
      );
    }
    if (newStatus) {
      await pool.query(
        `UPDATE sales_orders SET status = ? WHERE id = ? AND company_id = ?`,
        [SO_STATUS_FOR[newStatus], h.sales_order_id, user.company_id]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/dispatch/[id] error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
