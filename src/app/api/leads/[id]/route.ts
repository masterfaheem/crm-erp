import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEADS_TABLE,
  LEAD_PRIORITIES,
  LEAD_SELECT,
  LEAD_SOURCE_VALUES,
  LEAD_STATUSES,
  cleanDate,
  cleanStr,
  ensureLeadsTable,
  mapLeadRow,
} from "@/lib/leadsTable";

type Ctx = { params: Promise<{ id: string }> };

async function loadLead(id: number, companyId: number) {
  const [rows] = await getPool().query(
    `${LEAD_SELECT} WHERE l.id = ? AND l.company_id = ? LIMIT 1`,
    [id, companyId]
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
    const lead = id ? await loadLead(id, user.company_id) : null;
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ data: mapLeadRow(lead) });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
}

/* PUT /api/leads/:id  -> update only the fields sent */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    const id = Number((await params).id);
    const existing = id ? await loadLead(id, user.company_id) : null;
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const sets: string[] = [];
    const vals: unknown[] = [];
    const put = (col: string, v: unknown) => {
      sets.push(`${col} = ?`);
      vals.push(v);
    };

    const strFields: [string, number][] = [
      ["last_name", 120],
      ["company_name", 200],
      ["designation", 120],
      ["email", 190],
      ["phone", 40],
      ["alternate_phone", 40],
      ["whatsapp", 40],
      ["city", 100],
      ["address", 5000],
      ["description", 10000],
    ];
    if (body.first_name !== undefined) {
      const fn = cleanStr(body.first_name, 120);
      if (!fn) {
        return NextResponse.json(
          { error: "First name is required" },
          { status: 400 }
        );
      }
      put("first_name", fn);
    }
    for (const [f, max] of strFields) {
      if (body[f] !== undefined) put(f, cleanStr(body[f], max));
    }
    if (body.source !== undefined) {
      const s = cleanStr(body.source, 50);
      if (s && !LEAD_SOURCE_VALUES.includes(s)) {
        return NextResponse.json({ error: "Invalid source" }, { status: 400 });
      }
      put("source", s);
    }
    if (body.status !== undefined && LEAD_STATUSES.includes(body.status)) {
      put("status", body.status);
    }
    if (body.priority !== undefined && LEAD_PRIORITIES.includes(body.priority)) {
      put("priority", body.priority);
    }
    if (body.assigned_to !== undefined) {
      put("assigned_to", body.assigned_to ? Number(body.assigned_to) || null : null);
    }
    if (body.estimated_value !== undefined) {
      put("estimated_value", Number(body.estimated_value) || 0);
    }
    if (body.expected_close_date !== undefined) {
      put("expected_close_date", cleanDate(body.expected_close_date));
    }

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
