import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

async function requireUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, company_id, branch_id FROM users
     WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/tickets/[id]
============================================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT t.*, u.name AS assigned_name, cu.name AS linked_customer_name
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN customers cu ON cu.id = t.customer_id
       WHERE t.id = ? AND t.company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const ticket = (rows as any[])[0];
    if (!ticket)
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    let warranty: any = null;
    if (ticket.ticket_type === "warranty") {
      const [wRows] = await pool.query(
        `SELECT * FROM ticket_warranty_details WHERE ticket_id = ? LIMIT 1`,
        [id]
      );
      warranty = (wRows as any[])[0] || null;
    }

    const [activities] = await pool.query(
      `SELECT a.*, u.name AS user_name
       FROM ticket_activities a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.ticket_id = ?
       ORDER BY a.created_at DESC`,
      [id]
    );

    return NextResponse.json({ ...ticket, warranty, activities });
  } catch (err) {
    console.error("GET /api/tickets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/tickets/[id]
============================================================ */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const [existingRows] = await conn.query(
      `SELECT * FROM tickets WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing)
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const subject = String(body.subject ?? existing.subject).trim();
    if (!subject)
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );

    const status = body.status ?? existing.status;
    const resolvedAt =
      status === "resolved" || status === "closed"
        ? existing.resolved_at || new Date()
        : null;

    await conn.beginTransaction();

    await conn.query(
      `UPDATE tickets SET
        subject = ?, description = ?,
        customer_id = ?, customer_name = ?, customer_phone = ?,
        assigned_to = ?, category = ?, priority = ?, status = ?,
        source = ?, tags = ?, due_date = ?, sla_hours = ?,
        resolution_note = ?, resolved_at = ?,
        updated_by = ?
       WHERE id = ? AND company_id = ?`,
      [
        subject,
        body.description !== undefined
          ? body.description
            ? String(body.description).trim()
            : null
          : existing.description,
        body.customer_id !== undefined
          ? body.customer_id
            ? Number(body.customer_id)
            : null
          : existing.customer_id,
        body.customer_name !== undefined
          ? body.customer_name
            ? String(body.customer_name).trim()
            : null
          : existing.customer_name,
        body.customer_phone !== undefined
          ? body.customer_phone
            ? String(body.customer_phone).trim()
            : null
          : existing.customer_phone,
        body.assigned_to !== undefined
          ? body.assigned_to
            ? Number(body.assigned_to)
            : null
          : existing.assigned_to,
        body.category ?? existing.category,
        body.priority ?? existing.priority,
        status,
        body.source ?? existing.source,
        body.tags ?? existing.tags,
        body.due_date !== undefined ? body.due_date : existing.due_date,
        body.sla_hours !== undefined
          ? body.sla_hours
            ? Number(body.sla_hours)
            : null
          : existing.sla_hours,
        body.resolution_note !== undefined
          ? body.resolution_note
            ? String(body.resolution_note).trim()
            : null
          : existing.resolution_note,
        resolvedAt,
        authUser.id,
        id,
        authUser.company_id,
      ]
    );

    if (existing.ticket_type === "warranty" && body.warranty) {
      const w = body.warranty;
      const issueTypes = Array.isArray(w.issue_types)
        ? JSON.stringify(w.issue_types)
        : null;
      const serviceSteps = Array.isArray(w.service_steps)
        ? JSON.stringify(w.service_steps)
        : null;
      const additionalSupport = Array.isArray(w.additional_support)
        ? JSON.stringify(w.additional_support)
        : null;

      const [wExists] = await conn.query(
        `SELECT id FROM ticket_warranty_details WHERE ticket_id = ? LIMIT 1`,
        [id]
      );

      const warrantyValues = [
        w.warranty_source || null,
        w.model || null,
        w.specs || null,
        w.product_condition || null,
        w.serial_no || null,
        w.accessories_received || null,
        w.purchase_date || null,
        w.tested_by || null,
        w.warranty_status || null,
        issueTypes,
        w.issue_type_other || null,
        w.issue_description || null,
        w.initial_diagnosis_done ? 1 : 0,
        w.diagnosis_checked_by || null,
        w.issue_verified ? 1 : 0,
        w.root_cause || null,
        w.root_cause_other || null,
        serviceSteps,
        w.solution || null,
        w.solution_type || null,
        additionalSupport,
        w.warranty_cost != null && w.warranty_cost !== ""
          ? Number(w.warranty_cost)
          : null,
        w.time_taken || null,
        w.repeat_issue ? 1 : 0,
        w.customer_satisfaction || null,
        w.notes || null,
      ];

      if ((wExists as any[]).length) {
        await conn.query(
          `UPDATE ticket_warranty_details SET
            warranty_source = ?,
            model = ?, specs = ?, product_condition = ?, serial_no = ?,
            accessories_received = ?, purchase_date = ?, tested_by = ?,
            warranty_status = ?,
            issue_types = ?, issue_type_other = ?, issue_description = ?,
            initial_diagnosis_done = ?, diagnosis_checked_by = ?, issue_verified = ?,
            root_cause = ?, root_cause_other = ?,
            service_steps = ?,
            solution = ?, solution_type = ?, additional_support = ?,
            warranty_cost = ?, time_taken = ?, repeat_issue = ?, customer_satisfaction = ?,
            notes = ?
           WHERE ticket_id = ?`,
          [...warrantyValues, id]
        );
      } else {
        await conn.query(
          `INSERT INTO ticket_warranty_details
            (warranty_source, model, specs, product_condition, serial_no,
             accessories_received, purchase_date, tested_by, warranty_status,
             issue_types, issue_type_other, issue_description,
             initial_diagnosis_done, diagnosis_checked_by, issue_verified,
             root_cause, root_cause_other, service_steps,
             solution, solution_type, additional_support,
             warranty_cost, time_taken, repeat_issue, customer_satisfaction, notes,
             ticket_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...warrantyValues, id]
        );
      }
    }

    await conn.query(
      `INSERT INTO ticket_activities (ticket_id, user_id, action, message)
       VALUES (?, ?, 'updated', ?)`,
      [id, authUser.id, "Ticket updated"]
    );

    await conn.commit();

    return NextResponse.json({ message: "Ticket updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/tickets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/tickets/[id]
============================================================ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id FROM tickets WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    if (!(rows as any[]).length)
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    await pool.query(`DELETE FROM tickets WHERE id = ? AND company_id = ?`, [
      id,
      authUser.company_id,
    ]);

    return NextResponse.json({ message: "Ticket deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/tickets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
