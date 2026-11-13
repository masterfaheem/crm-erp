import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accessFromRequest, can } from "@/lib/access";
import { cleanStr } from "@/lib/leadsTable";
import { checklistProblem, cleanChecklist } from "@/lib/qcChecklist";
import {
  DISPATCH_STATUSES,
  HANDOVER_TABLE,
  SO_STATUS_FOR,
  ensureHandoverTable,
} from "@/lib/orderHandover";

type Ctx = { params: Promise<{ id: string }> };

/* the stage an order must be at before moving to `next` */
const FROM: Record<string, string[]> = {
  ready: ["invoiced", "ready"],          // QC done (re-saving a report is fine)
  invoiced: ["ready", "packed"],         // send back to testing
  packed: ["ready"],
  shipped: ["packed"],
  delivered: ["shipped"],
  completed: ["delivered", "completed"],
};
const STAGE_NAME: Record<string, string> = {
  pending: "To Bill",
  invoiced: "Billed (testing)",
  ready: "Tested · Ready to Pack",
  packed: "Packed",
  shipped: "Dispatched",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const nowPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 19).replace("T", " ");

/* ============================================================
   PUT /api/dispatch/:id
   { status: "ready", qc_checklist: {key: pass|fail|na}, tested_by }  -> QC done
   { status: "invoiced" }                       -> back to testing
   { status: "packed" | "shipped" | "delivered" | "completed" | "cancelled" }
   { courier?, tracking_no?, dispatch_notes? }
   { review_rating?: 1-5|null, review_comment? } -> completes the order
   Flow: To Bill -> (bill in POS) Billed -> Tested/Ready -> Packed
         -> Dispatched -> Delivered -> Review -> Completed
   Testing needs "Test laptops (QC)"; the other steps need
   "Pack, dispatch, deliver & review".
============================================================ */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    const access = await accessFromRequest(req);
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

    const canQc = can(access, "dispatch.qc", "dispatch.manage");
    const canManage = can(access, "dispatch.manage");
    const denied = (what: string) =>
      NextResponse.json({ error: `You don't have permission to ${what}. Ask your admin.` }, { status: 403 });

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, max] of [["courier", 60], ["tracking_no", 100], ["dispatch_notes", 1000]] as const) {
      if (body[k] !== undefined) {
        if (!canManage) return denied("change dispatch details");
        sets.push(`${k} = ?`);
        vals.push(cleanStr(body[k], max));
      }
    }

    let newStatus: string | null = null;
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!DISPATCH_STATUSES.includes(s)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (s === "ready" || s === "invoiced" ? !canQc : !canManage) {
        return denied(s === "ready" || s === "invoiced" ? "test orders" : "move orders forward");
      }
      if (s !== "pending" && s !== "cancelled" && !h.invoice_id) {
        return NextResponse.json({ error: "Create the bill in POS first" }, { status: 400 });
      }
      if (s === "pending" && h.invoice_id) {
        return NextResponse.json({ error: "Order is already billed" }, { status: 400 });
      }
      if (s === "cancelled" && h.invoice_id) {
        return NextResponse.json(
          { error: "This order is already billed — cancel the invoice first" },
          { status: 400 }
        );
      }
      const from = FROM[s];
      if (from && !from.includes(String(h.status))) {
        return NextResponse.json(
          {
            error: `This order is at "${STAGE_NAME[h.status] || h.status}". It must be at "${from
              .map((f) => STAGE_NAME[f])
              .join(" / ")}" first.`,
          },
          { status: 400 }
        );
      }

      if (s === "ready") {
        const checklist = cleanChecklist(body.qc_checklist);
        const problem = checklistProblem(checklist);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
        const testedBy = cleanStr(body.tested_by, 120);
        if (!testedBy) return NextResponse.json({ error: "Select who tested the laptop" }, { status: 400 });
        sets.push("qc_checklist = ?", "tested_by = ?", "qc_by = ?", "qc_at = ?");
        vals.push(JSON.stringify(checklist), testedBy, user.id, nowPKT());
      }

      newStatus = s;
      sets.push("status = ?");
      vals.push(s);
      if (s === "packed") {
        sets.push("packed_at = ?");
        vals.push(nowPKT());
      }
      if (s === "shipped") {
        sets.push("shipped_at = ?");
        vals.push(nowPKT());
      }
      if (s === "delivered") {
        sets.push("delivered_at = ?");
        vals.push(nowPKT());
      }
    }

    /* review (after delivery) */
    if (body.review_rating !== undefined || body.review_comment !== undefined) {
      if (!canManage) return denied("add reviews");
      const st = newStatus || h.status;
      if (st !== "delivered" && st !== "completed") {
        return NextResponse.json({ error: "Review can be added after delivery" }, { status: 400 });
      }
      const r = body.review_rating === null || body.review_rating === "" ? null : Math.round(Number(body.review_rating));
      if (r !== null && (!(r >= 1) || r > 5)) {
        return NextResponse.json({ error: "Rating must be 1 to 5" }, { status: 400 });
      }
      sets.push("review_rating = ?", "review_comment = ?", "review_at = ?");
      vals.push(r, cleanStr(body.review_comment, 1000), nowPKT());
      if (!newStatus) {
        newStatus = "completed";
        sets.push("status = ?");
        vals.push("completed");
      }
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
