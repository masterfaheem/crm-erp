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
   GET /api/customers/[id]
   Full customer + contacts + groups.
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

    const [custRows] = await pool.query(
      `SELECT c.*,
         b.name AS branch_name,
         u.name AS assigned_name
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.id = ? AND c.company_id = ?
       LIMIT 1`,
      [id, authUser.company_id]
    );
    const customer = (custRows as any[])[0];
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    /* ---- Contacts ---- */
    const [contactRows] = await pool.query(
      `SELECT id, name, designation, department, email, phone, whatsapp, is_primary, status
       FROM customer_contacts
       WHERE customer_id = ?
       ORDER BY is_primary DESC, name ASC`,
      [id]
    );

    /* ---- Groups ---- */
    const [groupRows] = await pool.query(
      `SELECT g.id, g.name, g.color, g.discount_percent
       FROM customer_group_members m
       JOIN customer_groups g ON g.id = m.group_id
       WHERE m.customer_id = ?
       ORDER BY g.name ASC`,
      [id]
    );

    return NextResponse.json({
      ...customer,
      contacts: contactRows,
      groups: groupRows,
    });
  } catch (err) {
    console.error("GET /api/customers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/customers/[id]
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
      `SELECT * FROM customers WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const name = String(body.name ?? existing.name).trim();
    if (!name) {
      return NextResponse.json(
        { error: "Customer name is required" },
        { status: 400 }
      );
    }

    /* ---- Duplicate tax number check ---- */
    const newTax =
      body.tax_number !== undefined
        ? body.tax_number
          ? String(body.tax_number).trim()
          : null
        : existing.tax_number;

    if (newTax) {
      const [dup] = await conn.query(
        `SELECT id FROM customers
         WHERE company_id = ? AND tax_number = ? AND id <> ? LIMIT 1`,
        [authUser.company_id, newTax, id]
      );
      if ((dup as any[]).length) {
        return NextResponse.json(
          { error: "Another customer already uses this tax number" },
          { status: 409 }
        );
      }
    }

    await conn.beginTransaction();

    await conn.query(
      `UPDATE customers SET
        branch_id = ?, customer_type = ?,
        name = ?, company_name = ?, designation = ?,
        email = ?, phone = ?, alternate_phone = ?, whatsapp = ?, website = ?,
        tax_number = ?, registration_number = ?,
        billing_address = ?, shipping_address = ?,
        city = ?, state = ?, country = ?, postal_code = ?,
        profession_id = ?, source_id = ?, assigned_to = ?,
        credit_limit = ?, credit_days = ?, opening_balance = ?,
        balance_type = ?, currency_code = ?,
        tax_exempt = ?, default_tax_rate = ?,
        status = ?, notes = ?, updated_by = ?
       WHERE id = ? AND company_id = ?`,
      [
        body.branch_id !== undefined
          ? body.branch_id
            ? Number(body.branch_id)
            : null
          : existing.branch_id,
        body.customer_type ?? existing.customer_type,
        name,
        body.company_name !== undefined
          ? body.company_name
            ? String(body.company_name).trim()
            : null
          : existing.company_name,
        body.designation !== undefined
          ? body.designation
            ? String(body.designation).trim()
            : null
          : existing.designation,
        body.email !== undefined
          ? body.email
            ? String(body.email).trim()
            : null
          : existing.email,
        body.phone !== undefined
          ? body.phone
            ? String(body.phone).trim()
            : null
          : existing.phone,
        body.alternate_phone !== undefined
          ? body.alternate_phone
            ? String(body.alternate_phone).trim()
            : null
          : existing.alternate_phone,
        body.whatsapp !== undefined
          ? body.whatsapp
            ? String(body.whatsapp).trim()
            : null
          : existing.whatsapp,
        body.website !== undefined
          ? body.website
            ? String(body.website).trim()
            : null
          : existing.website,
        newTax,
        body.registration_number !== undefined
          ? body.registration_number
            ? String(body.registration_number).trim()
            : null
          : existing.registration_number,
        body.billing_address !== undefined
          ? body.billing_address
            ? String(body.billing_address).trim()
            : null
          : existing.billing_address,
        body.shipping_address !== undefined
          ? body.shipping_address
            ? String(body.shipping_address).trim()
            : null
          : existing.shipping_address,
        body.city !== undefined
          ? body.city
            ? String(body.city).trim()
            : null
          : existing.city,
        body.state !== undefined
          ? body.state
            ? String(body.state).trim()
            : null
          : existing.state,
        body.country !== undefined
          ? body.country
            ? String(body.country).trim()
            : "Pakistan"
          : existing.country,
        body.postal_code !== undefined
          ? body.postal_code
            ? String(body.postal_code).trim()
            : null
          : existing.postal_code,
        body.profession_id !== undefined
          ? body.profession_id
            ? Number(body.profession_id)
            : null
          : existing.profession_id,
        body.source_id !== undefined
          ? body.source_id
            ? Number(body.source_id)
            : null
          : existing.source_id,
        body.assigned_to !== undefined
          ? body.assigned_to
            ? Number(body.assigned_to)
            : null
          : existing.assigned_to,
        body.credit_limit !== undefined
          ? Number(body.credit_limit)
          : existing.credit_limit,
        body.credit_days !== undefined
          ? Number(body.credit_days)
          : existing.credit_days,
        body.opening_balance !== undefined
          ? Number(body.opening_balance)
          : existing.opening_balance,
        body.balance_type ?? existing.balance_type,
        body.currency_code ?? existing.currency_code,
        body.tax_exempt !== undefined
          ? Boolean(body.tax_exempt)
          : existing.tax_exempt,
        body.default_tax_rate !== undefined
          ? Number(body.default_tax_rate)
          : existing.default_tax_rate,
        body.status ?? existing.status,
        body.notes !== undefined
          ? body.notes
            ? String(body.notes).trim()
            : null
          : existing.notes,
        authUser.id,
        id,
        authUser.company_id,
      ]
    );

    /* ---- Audit log ---- */
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
         VALUES (?, ?, 'update', 'customer', ?, ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          id,
          JSON.stringify({ name: existing.name, status: existing.status }),
          JSON.stringify({ name, status: body.status ?? existing.status }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json({ message: "Customer updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/customers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/customers/[id]
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
      `SELECT id, name FROM customers
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    if (!(existingRows as any[]).length) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    await pool.query(`DELETE FROM customers WHERE id = ? AND company_id = ?`, [
      id,
      authUser.company_id,
    ]);

    return NextResponse.json({ message: "Customer deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/customers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}