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
   GET /api/customer-groups/[id]
   Group details + list of member customers.
============================================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();

    const [groupRows] = await pool.query(
      `SELECT * FROM customer_groups
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const group = (groupRows as any[])[0];
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const [memberRows] = await pool.query(
      `SELECT
        c.id, c.name, c.email, c.phone, c.customer_code
       FROM customer_group_members m
       JOIN customers c ON c.id = m.customer_id
       WHERE m.group_id = ?
       ORDER BY c.name ASC`,
      [id]
    );

    return NextResponse.json({
      ...group,
      members: memberRows,
    });
  } catch (err) {
    console.error("GET /api/customer-groups/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/customer-groups/[id]
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
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const [existingRows] = await conn.query(
      `SELECT * FROM customer_groups
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const name = String(body.name ?? existing.name).trim();
    const description =
      body.description !== undefined
        ? body.description
          ? String(body.description).trim()
          : null
        : existing.description;
    const color =
      body.color !== undefined
        ? String(body.color).trim()
        : existing.color;
    const discountPercent =
      body.discount_percent !== undefined
        ? Number(body.discount_percent)
        : Number(existing.discount_percent);
    const status = body.status ?? existing.status;

    if (!name) {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }
    if (discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json(
        { error: "Discount must be between 0 and 100" },
        { status: 400 }
      );
    }

    const [dup] = await conn.query(
      `SELECT id FROM customer_groups
       WHERE company_id = ? AND name = ? AND id <> ? LIMIT 1`,
      [authUser.company_id, name, id]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "Another group already uses this name" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    await conn.query(
      `UPDATE customer_groups SET
        name = ?, description = ?, color = ?, discount_percent = ?, status = ?
       WHERE id = ? AND company_id = ?`,
      [name, description, color, discountPercent, status, id, authUser.company_id]
    );

    /* ---- Members: replace if provided ---- */
    if (Array.isArray(body.member_ids)) {
      const memberIds: number[] = body.member_ids
        .map((n: any) => Number(n))
        .filter(Boolean);

      await conn.query(
        `DELETE FROM customer_group_members WHERE group_id = ?`,
        [id]
      );

      if (memberIds.length) {
        const values = memberIds.map((cid) => [Number(id), cid]);
        await conn.query(
          `INSERT INTO customer_group_members (group_id, customer_id) VALUES ?`,
          [values]
        );
      }
    }

    /* ---- Audit log (best-effort) ---- */
    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;

      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id,
           old_values, new_values, ip_address, user_agent)
         VALUES (?, ?, 'update', 'customer_group', ?, ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          id,
          JSON.stringify({
            name: existing.name,
            status: existing.status,
          }),
          JSON.stringify({ name, status }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json({ message: "Group updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/customer-groups/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/customer-groups/[id]
============================================================ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const [existingRows] = await pool.query(
      `SELECT id FROM customer_groups
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    if (!(existingRows as any[]).length) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    await pool.query(
      `DELETE FROM customer_groups WHERE id = ? AND company_id = ?`,
      [id, authUser.company_id]
    );

    return NextResponse.json({ message: "Group deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/customer-groups/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}