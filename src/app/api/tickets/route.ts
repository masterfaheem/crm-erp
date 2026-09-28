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
    `SELECT id, company_id, branch_id, name FROM users
     WHERE id = ? AND status = 'active' LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

async function generateTicketCode(
  conn: any,
  companyId: number,
  type: "general" | "warranty"
): Promise<string> {
  const prefix = type === "warranty" ? "WAR" : "TKT";
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM tickets
     WHERE company_id = ? AND ticket_type = ?`,
    [companyId, type]
  );
  const next = ((rows as any[])[0].cnt as number) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

const ALLOWED_PRIORITY = ["very_high", "high", "medium", "low"];
const ALLOWED_STATUS = [
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
  "cancelled",
];

/* ============================================================
   GET /api/tickets
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const priority = searchParams.get("priority")?.trim() || "";
    const ticketType = searchParams.get("ticket_type")?.trim() || "";
    const assignedTo = searchParams.get("assigned_to")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["t.company_id = ?"];
    const params: any[] = [authUser.company_id];

    if (search) {
      where.push(
        `(t.subject LIKE ? OR t.description LIKE ? OR t.ticket_code LIKE ?
          OR t.customer_name LIKE ? OR t.customer_phone LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (status) {
      where.push("t.status = ?");
      params.push(status);
    }
    if (priority) {
      where.push("t.priority = ?");
      params.push(priority);
    }
    if (ticketType) {
      where.push("t.ticket_type = ?");
      params.push(ticketType);
    }
    if (assignedTo) {
      where.push("t.assigned_to = ?");
      params.push(Number(assignedTo));
    }

    const whereSql = where.join(" AND ");
    const pool = getPool();

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].total as number;

    const [rows] = await pool.query(
      `SELECT
        t.id, t.ticket_code, t.ticket_type, t.subject, t.description,
        t.customer_id, t.customer_name, t.customer_phone,
        t.category, t.priority, t.status,
        t.assigned_to, t.created_by, t.source, t.due_date, t.sla_hours,
        t.resolution_note, t.resolved_at,
        t.created_at, t.updated_at,
        u.name AS assigned_name,
        cu.name AS linked_customer_name,
        (SELECT COUNT(*) FROM ticket_activities a WHERE a.ticket_id = t.id) AS activity_count
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN customers cu ON cu.id = t.customer_id
      WHERE ${whereSql}
      ORDER BY
        FIELD(t.status, 'open','in_progress','pending','resolved','closed','cancelled'),
        FIELD(t.priority, 'very_high','high','medium','low'),
        t.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /api/tickets error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/tickets
============================================================ */
export async function POST(req: NextRequest) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const ticketType: "general" | "warranty" =
      body.ticket_type === "warranty" ? "warranty" : "general";

    const subject = String(body.subject || "").trim();
    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }

    const priority = ALLOWED_PRIORITY.includes(body.priority)
      ? body.priority
      : "medium";
    const status = ALLOWED_STATUS.includes(body.status)
      ? body.status
      : "open";

    await conn.beginTransaction();

    const ticketCode = await generateTicketCode(
      conn,
      authUser.company_id,
      ticketType
    );

    const [result] = await conn.query(
      `INSERT INTO tickets
        (company_id, branch_id, ticket_code, ticket_type, subject, description,
         customer_id, customer_name, customer_phone,
         assigned_to, created_by, updated_by,
         category, priority, status, source, tags, due_date, sla_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        authUser.company_id,
        body.branch_id ? Number(body.branch_id) : authUser.branch_id || null,
        ticketCode,
        ticketType,
        subject,
        body.description ? String(body.description).trim() : null,
        body.customer_id ? Number(body.customer_id) : null,
        body.customer_name ? String(body.customer_name).trim() : null,
        body.customer_phone ? String(body.customer_phone).trim() : null,
        body.assigned_to ? Number(body.assigned_to) : null,
        authUser.id,
        authUser.id,
        body.category ? String(body.category).trim() : null,
        priority,
        status,
        body.source ? String(body.source).trim() : null,
        body.tags ? String(body.tags).trim() : null,
        body.due_date || null,
        body.sla_hours ? Number(body.sla_hours) : null,
      ]
    );
    const ticketId = (result as any).insertId as number;

    if (ticketType === "warranty") {
      const w = body.warranty || {};
      const issueTypes = Array.isArray(w.issue_types)
        ? JSON.stringify(w.issue_types)
        : null;
      const serviceSteps = Array.isArray(w.service_steps)
        ? JSON.stringify(w.service_steps)
        : null;
      const additionalSupport = Array.isArray(w.additional_support)
        ? JSON.stringify(w.additional_support)
        : null;

      await conn.query(
        `INSERT INTO ticket_warranty_details
          (ticket_id, warranty_source,
           model, specs, product_condition, serial_no,
           accessories_received, purchase_date, tested_by,
           warranty_status,
           issue_types, issue_type_other, issue_description,
           initial_diagnosis_done, diagnosis_checked_by, issue_verified,
           root_cause, root_cause_other,
           service_steps,
           solution, solution_type, additional_support,
           warranty_cost, time_taken, repeat_issue, customer_satisfaction,
           notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticketId,
          w.warranty_source ? String(w.warranty_source).trim() : null,
          w.model ? String(w.model).trim() : null,
          w.specs ? String(w.specs).trim() : null,
          w.product_condition ? String(w.product_condition).trim() : null,
          w.serial_no ? String(w.serial_no).trim() : null,
          w.accessories_received
            ? String(w.accessories_received).trim()
            : null,
          w.purchase_date || null,
          w.tested_by ? String(w.tested_by).trim() : null,
          ["in_warranty", "out_of_warranty"].includes(w.warranty_status)
            ? w.warranty_status
            : null,
          issueTypes,
          w.issue_type_other ? String(w.issue_type_other).trim() : null,
          w.issue_description
            ? String(w.issue_description).trim()
            : null,
          w.initial_diagnosis_done ? 1 : 0,
          w.diagnosis_checked_by
            ? String(w.diagnosis_checked_by).trim()
            : null,
          w.issue_verified ? 1 : 0,
          ["misuse", "technical_issue", "software_issue", "other"].includes(
            w.root_cause
          )
            ? w.root_cause
            : null,
          w.root_cause_other ? String(w.root_cause_other).trim() : null,
          serviceSteps,
          w.solution ? String(w.solution).trim() : null,
          [
            "online_resolve",
            "repair",
            "replacement",
            "return",
          ].includes(w.solution_type)
            ? w.solution_type
            : null,
          additionalSupport,
          w.warranty_cost != null && w.warranty_cost !== ""
            ? Number(w.warranty_cost)
            : null,
          w.time_taken ? String(w.time_taken).trim() : null,
          w.repeat_issue ? 1 : 0,
          ["happy", "satisfied", "not_satisfied", "angry"].includes(
            w.customer_satisfaction
          )
            ? w.customer_satisfaction
            : null,
          w.notes ? String(w.notes).trim() : null,
        ]
      );
    }

    await conn.query(
      `INSERT INTO ticket_activities (ticket_id, user_id, action, message)
       VALUES (?, ?, 'created', ?)`,
      [ticketId, authUser.id, `Ticket ${ticketCode} created`]
    );

    await conn.commit();

    return NextResponse.json(
      {
        message: "Ticket created successfully",
        id: ticketId,
        ticket_code: ticketCode,
      },
      { status: 201 }
    );
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/tickets error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
