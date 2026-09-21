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
   GET /api/suppliers/[id]
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
      `SELECT * FROM suppliers WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const supplier = (rows as any[])[0];
    if (!supplier)
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    return NextResponse.json(supplier);
  } catch (err) {
    console.error("GET /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/suppliers/[id]
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
      `SELECT * FROM suppliers WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing)
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const name = String(body.name ?? existing.name).trim();
    if (!name)
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );

    const newTax =
      body.tax_number !== undefined
        ? body.tax_number
          ? String(body.tax_number).trim()
          : null
        : existing.tax_number;

    if (newTax) {
      const [dup] = await conn.query(
        `SELECT id FROM suppliers
         WHERE company_id = ? AND tax_number = ? AND id <> ? LIMIT 1`,
        [authUser.company_id, newTax, id]
      );
      if ((dup as any[]).length)
        return NextResponse.json(
          { error: "Another supplier already uses this tax number" },
          { status: 409 }
        );
    }

    await conn.beginTransaction();

    await conn.query(
      `UPDATE suppliers SET
        branch_id = ?, supplier_type = ?,
        name = ?, company_name = ?, designation = ?,
        email = ?, phone = ?, alternate_phone = ?, whatsapp = ?, website = ?,
        tax_number = ?, registration_number = ?,
        address = ?, city = ?, state = ?, country = ?, postal_code = ?,
        opening_balance = ?, balance_type = ?, currency_code = ?,
        bank_name = ?, bank_account_name = ?, bank_account_number = ?, bank_iban = ?,
        payment_terms = ?, status = ?, notes = ?, updated_by = ?
       WHERE id = ? AND company_id = ?`,
      [
        body.branch_id !== undefined
          ? body.branch_id
            ? Number(body.branch_id)
            : null
          : existing.branch_id,
        body.supplier_type ?? existing.supplier_type,
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
        body.opening_balance !== undefined
          ? Number(body.opening_balance)
          : existing.opening_balance,
        body.balance_type ?? existing.balance_type,
        body.currency_code ?? existing.currency_code,
        body.bank_name !== undefined
          ? body.bank_name
            ? String(body.bank_name).trim()
            : null
          : existing.bank_name,
        body.bank_account_name !== undefined
          ? body.bank_account_name
            ? String(body.bank_account_name).trim()
            : null
          : existing.bank_account_name,
        body.bank_account_number !== undefined
          ? body.bank_account_number
            ? String(body.bank_account_number).trim()
            : null
          : existing.bank_account_number,
        body.bank_iban !== undefined
          ? body.bank_iban
            ? String(body.bank_iban).trim()
            : null
          : existing.bank_iban,
        body.payment_terms !== undefined
          ? body.payment_terms
            ? String(body.payment_terms).trim()
            : null
          : existing.payment_terms,
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

    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
      const ua = req.headers.get("user-agent") || null;
      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id,
           old_values, new_values, ip_address, user_agent)
         VALUES (?, ?, 'update', 'supplier', ?, ?, ?, ?, ?)`,
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
    return NextResponse.json({ message: "Supplier updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/suppliers/[id]
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
    const [existingRows] = await pool.query(
      `SELECT id FROM suppliers WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    if (!(existingRows as any[]).length)
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    await pool.query(
      `DELETE FROM suppliers WHERE id = ? AND company_id = ?`,
      [id, authUser.company_id]
    );
    return NextResponse.json({ message: "Supplier deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}