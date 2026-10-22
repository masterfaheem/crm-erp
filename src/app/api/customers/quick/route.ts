import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { cleanStr } from "@/lib/leadsTable";
import { createCustomer, findCustomerByPhones, phoneKeyOf } from "@/lib/orderHandover";

/* ============================================================
   POST /api/customers/quick   (POS walk-in)
   { name, phone, whatsapp?, city?, address? }
   If the number already belongs to a customer, that customer is
   returned (existing: true) instead of creating a duplicate.
============================================================ */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  const name = cleanStr(body.name, 150);
  const phone = cleanStr(body.phone, 40);
  const whatsapp = cleanStr(body.whatsapp, 40);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!phone || phoneKeyOf(phone).length < 10) {
    return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await findCustomerByPhones(conn, user.company_id, [phone, whatsapp]);
    let id: number;
    let isExisting = false;
    if (existing) {
      id = existing.id;
      isExisting = true;
    } else {
      const c = await createCustomer(conn, user, {
        name,
        phone,
        whatsapp: whatsapp || null,
        city: cleanStr(body.city, 100),
        address: cleanStr(body.address, 500),
        notes: "Walk-in (POS)",
      });
      id = c.id;
    }
    await conn.commit();

    const [rows] = await pool.query(`SELECT * FROM customers WHERE id = ? LIMIT 1`, [id]);
    return NextResponse.json(
      { data: (rows as unknown[])[0], existing: isExisting },
      { status: isExisting ? 200 : 201 }
    );
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/customers/quick error:", err);
    return NextResponse.json({ error: "Failed to add customer" }, { status: 500 });
  } finally {
    conn.release();
  }
}
