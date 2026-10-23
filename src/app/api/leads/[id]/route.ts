import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accessFromRequest, can } from "@/lib/access";
import {
  LEADS_TABLE,
  LEAD_SELECT,
  ensureLeadsTable,
  mapLeadRow,
  ownerSql,
  parseLeadInput,
} from "@/lib/leadsTable";

/* null = may see every lead; otherwise only own (assigned / added) leads */
async function ownerFor(req: NextRequest, userId: number) {
  return can(await accessFromRequest(req), "leads.view_all") ? null : userId;
}

type Ctx = { params: Promise<{ id: string }> };

async function loadLead(id: number, companyId: number, ownerId: number | null = null) {
  const own = ownerSql(ownerId);
  const [rows] = await getPool().query(
    `${LEAD_SELECT} WHERE l.id = ? AND l.company_id = ?${own.sql} LIMIT 1`,
    [id, companyId, ...own.params]
  );
  const arr = rows as Record<string, unknown>[];
  return arr.length ? arr[0] : null;
}

/* GET /api/leads/:id */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    const id = Number((await params).id);
    const lead = id ? await loadLead(id, user.company_id, await ownerFor(req, user.id)) : null;
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ data: mapLeadRow(lead) });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
}

/* PUT /api/leads/:id  -> update only the fields sent (see parseLeadInput) */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    const id = Number((await params).id);
    const existing = id ? await loadLead(id, user.company_id, await ownerFor(req, user.id)) : null;
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    // only people with "assign leads" can move a lead to someone else
    if (!can(await accessFromRequest(req), "leads.assign")) delete body.assigned_to;
    const { values, error } = parseLeadInput(body, true, existing);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    if (existing.handover_id && values.status !== undefined && values.status !== "won") {
      return NextResponse.json(
        { error: `This lead is already converted to order ${existing.order_number} — status stays Won` },
        { status: 400 }
      );
    }
    const sets = Object.keys(values).map((c) => `${c} = ?`);
    const vals = Object.values(values);

    if (sets.length) {
      await getPool().query(
        `UPDATE ${LEADS_TABLE} SET ${sets.join(", ")}
          WHERE id = ? AND company_id = ?`,
        [...vals, id, user.company_id]
      );
    }
    const lead = await loadLead(id, user.company_id);
    return NextResponse.json({ data: mapLeadRow(lead) });
  } catch (err) {
    console.error("PUT /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

/* DELETE /api/leads/:id */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    const id = Number((await params).id);
    const lead = id ? await loadLead(id, user.company_id, await ownerFor(req, user.id)) : null;
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (lead?.handover_id) {
      return NextResponse.json(
        { error: `This lead has order ${lead.order_number} — it can't be deleted` },
        { status: 409 }
      );
    }
    const [result] = await getPool().query(
      `DELETE FROM ${LEADS_TABLE} WHERE id = ? AND company_id = ?`,
      [id, user.company_id]
    );
    if (!(result as { affectedRows: number }).affectedRows) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: 500 }
    );
  }
}
