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
   GET /api/contacts/[id]
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
    const [rows] = await pool.query(
      `SELECT
        c.*,
        cu.name AS customer_name,
        cu.customer_code AS customer_code
       FROM customer_contacts c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.id = ? AND c.company_id = ?
       LIMIT 1`,
      [id, authUser.company_id]
    );

    const contact = (rows as any[])[0];
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (err) {
    console.error("GET /api/contacts/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/contacts/[id]
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
      `SELECT * FROM customer_contacts
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const customerId =
      body.customer_id !== undefined
        ? Number(body.customer_id)
        : existing.customer_id;
    const name = String(body.name ?? existing.name).trim();

    if (!customerId || !name) {
      return NextResponse.json(
        { error: "Customer and contact name are required" },
        { status: 400 }
      );
    }

    /* ---- Verify customer belongs to this company (if changed) ---- */
    if (customerId !== existing.customer_id) {
      const [custRows] = await conn.query(
        `SELECT id FROM customers
         WHERE id = ? AND company_id = ? LIMIT 1`,
        [customerId, authUser.company_id]
      );
      if (!(custRows as any[]).length) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }
    }

    const isPrimary =
      body.is_primary !== undefined
        ? Boolean(body.is_primary)
        : Boolean(existing.is_primary);

    await conn.beginTransaction();

    /* ---- Only one primary per customer ---- */
    if (isPrimary) {
      await conn.query(
        `UPDATE customer_contacts SET is_primary = FALSE
         WHERE customer_id = ? AND id <> ?`,
        [customerId, id]
      );
    }

    await conn.query(
      `UPDATE customer_contacts SET
        customer_id = ?, name = ?, designation = ?, department = ?,
        email = ?, phone = ?, alternate_phone = ?, whatsapp = ?,
        address = ?, city = ?, state = ?, country = ?, postal_code = ?,
        is_primary = ?, status = ?, notes = ?, updated_by = ?
       WHERE id = ? AND company_id = ?`,
      [
        customerId,
        name,
        body.designation !== undefined
          ? body.designation
            ? String(body.designation).trim()
            : null
          : existing.designation,
        body.department !== undefined
          ? body.department
            ? String(body.department).trim()
            : null
          : existing.department,
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
        body.address !== undefined
          ? body.address
            ? String(body.address).trim()
            : null
          : existing.address,
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
        isPrimary,
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
         VALUES (?, ?, 'update', 'contact', ?, ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          id,
          JSON.stringify({
            name: existing.name,
            email: existing.email,
            status: existing.status,
          }),
          JSON.stringify({ name, status: body.status ?? existing.status }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json({ message: "Contact updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/contacts/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/contacts/[id]
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
      `SELECT id FROM customer_contacts
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    if (!(existingRows as any[]).length) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    await pool.query(
      `DELETE FROM customer_contacts WHERE id = ? AND company_id = ?`,
      [id, authUser.company_id]
    );

    return NextResponse.json({ message: "Contact deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/contacts/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}