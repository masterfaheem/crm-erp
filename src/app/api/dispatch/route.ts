import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ensureLeadsTable } from "@/lib/leadsTable";
import {
  HANDOVER_SELECT,
  HANDOVER_TABLE,
  ensureHandoverTable,
  loadOrderItems,
} from "@/lib/orderHandover";

/* ============================================================
   GET /api/dispatch
     ?status=pending|invoiced|shipped|delivered|completed|cancelled|open|all
       (open = pending + invoiced + shipped + delivered[awaiting review])
     ?customer_id=   ?sales_order_id=   ?search=
   Returns orders with items + counts per status.
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    await ensureHandoverTable();

    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || "open";
    const where: string[] = ["h.company_id = ?"];
    const params: unknown[] = [user.company_id];

    if (status === "open") where.push("h.status IN ('pending','invoiced','shipped','delivered')");
    else if (status !== "all") {
      where.push("h.status = ?");
      params.push(status);
    }
    const customerId = Number(sp.get("customer_id"));
    if (customerId) {
      where.push("h.customer_id = ?");
      params.push(customerId);
    }
    const soId = Number(sp.get("sales_order_id"));
    if (soId) {
      where.push("h.sales_order_id = ?");
      params.push(soId);
    }
    const search = sp.get("search")?.trim();
    if (search) {
      where.push(
        `(so.order_number LIKE ? OR c.name LIKE ? OR h.delivery_name LIKE ? OR h.delivery_phone LIKE ?
          OR c.phone LIKE ? OR c.whatsapp LIKE ? OR h.delivery_city LIKE ? OR h.tracking_no LIKE ?)`
      );
      for (let i = 0; i < 8; i++) params.push(`%${search}%`);
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `${HANDOVER_SELECT} WHERE ${where.join(" AND ")} ORDER BY h.id DESC LIMIT 300`,
      params
    );
    const list = rows as { sales_order_id: number }[];
    const items = await loadOrderItems(list.map((r) => r.sales_order_id));

    const [cRows] = await pool.query(
      `SELECT status, COUNT(*) AS n FROM ${HANDOVER_TABLE} WHERE company_id = ? GROUP BY status`,
      [user.company_id]
    );
    const counts: Record<string, number> = {};
    for (const r of cRows as { status: string; n: number }[]) counts[r.status] = Number(r.n);

    return NextResponse.json({
      data: list.map((r) => ({ ...r, items: items.get(r.sales_order_id) || [] })),
      counts,
    });
  } catch (err) {
    console.error("GET /api/dispatch error:", err);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
