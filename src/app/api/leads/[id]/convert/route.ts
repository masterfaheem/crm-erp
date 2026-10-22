import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { LEADS_TABLE, cleanDate, cleanStr, ensureLeadsTable } from "@/lib/leadsTable";
import {
  HANDOVER_TABLE,
  PAYMENT_METHODS,
  createCustomer,
  ensureHandoverTable,
  findCustomerByPhones,
  formatAddress,
  nextSalesOrderNumber,
} from "@/lib/orderHandover";
import { professionText, formatUseCases } from "@/lib/leadOptions";

type Ctx = { params: Promise<{ id: string }> };

/* ============================================================
   GET /api/leads/:id/convert
   Preview: is there already a customer with this number?
   Is the lead already converted?
============================================================ */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();
    await ensureHandoverTable();
    const id = Number((await params).id);
    const pool = getPool();

    const [lr] = await pool.query(
      `SELECT * FROM ${LEADS_TABLE} WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, user.company_id]
    );
    const lead = (lr as Record<string, unknown>[])[0];
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const [hr] = await pool.query(
      `SELECT h.id, so.order_number FROM ${HANDOVER_TABLE} h
         JOIN sales_orders so ON so.id = h.sales_order_id
        WHERE h.lead_id = ? LIMIT 1`,
      [id]
    );
    const existingOrder = (hr as Record<string, unknown>[])[0] || null;

    const match = await findCustomerByPhones(pool, user.company_id, [
      lead.whatsapp,
      lead.phone,
      lead.delivery_phone,
    ]);

    return NextResponse.json({
      data: { existing_customer: match, existing_order: existingOrder },
    });
  } catch (err) {
    console.error("GET /api/leads/[id]/convert error:", err);
    return NextResponse.json({ error: "Failed to check lead" }, { status: 500 });
  }
}

/* ============================================================
   POST /api/leads/:id/convert
   One click: customer (find-or-create by phone) + sales order
   (confirmed) + handover record + lead -> Won.  All-or-nothing.
============================================================ */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  await ensureLeadsTable();
  await ensureHandoverTable();
  const id = Number((await params).id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json().catch(() => ({}));

  /* ---------- validate input ---------- */
  const d = {
    delivery_name: cleanStr(body.delivery_name, 120),
    delivery_phone: cleanStr(body.delivery_phone, 40),
    delivery_phone2: cleanStr(body.delivery_phone2, 40),
    delivery_house: cleanStr(body.delivery_house, 100),
    delivery_street: cleanStr(body.delivery_street, 150),
    delivery_area: cleanStr(body.delivery_area, 150),
    delivery_landmark: cleanStr(body.delivery_landmark, 200),
    delivery_city: cleanStr(body.delivery_city, 100),
  };
  const missing: string[] = [];
  if (!d.delivery_name) missing.push("Name");
  if (!d.delivery_phone) missing.push("Phone");
  if (!d.delivery_house && !d.delivery_street && !d.delivery_area) missing.push("House / Street / Area");
  if (!d.delivery_city) missing.push("City");
  if (missing.length) {
    return NextResponse.json(
      { error: `Delivery address incomplete: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((it: Record<string, unknown>) => ({
      product_id: it.product_id ? Number(it.product_id) || null : null,
      description: cleanStr(it.description, 255) || "",
      quantity: Math.max(0, Number(it.quantity) || 0),
      unit_price: Math.max(0, Number(it.unit_price) || 0),
    }))
    .filter((it: { quantity: number }) => it.quantity > 0);
  if (!items.length) {
    return NextResponse.json({ error: "Add at least one model / product" }, { status: 400 });
  }
  if (items.some((it: { product_id: number | null; description: string }) => !it.product_id && !it.description)) {
    return NextResponse.json({ error: "Write the model name for custom items" }, { status: 400 });
  }

  const total = items.reduce(
    (s: number, it: { quantity: number; unit_price: number }) => s + it.quantity * it.unit_price,
    0
  );
  const advance = Math.max(0, Number(body.advance_amount) || 0);
  if (advance > total) {
    return NextResponse.json({ error: "Advance cannot be more than the total" }, { status: 400 });
  }
  const methods = PAYMENT_METHODS.map((m) => m.value);
  const advMethod = advance > 0 ? cleanStr(body.advance_method, 30) : "none";
  if (advance > 0 && (!advMethod || !methods.includes(advMethod) || advMethod === "none")) {
    return NextResponse.json({ error: "Select how the advance was received" }, { status: 400 });
  }
  const specs = cleanStr(body.specs_note, 1000);
  const dispatchDate = cleanDate(body.dispatch_date);
  const dispatchNotes = cleanStr(body.dispatch_notes, 1000);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    /* lock the lead so two clicks can't convert it twice */
    const [lr] = await conn.query(
      `SELECT * FROM ${LEADS_TABLE} WHERE id = ? AND company_id = ? FOR UPDATE`,
      [id, user.company_id]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lead = (lr as any[])[0];
    if (!lead) {
      await conn.rollback();
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const [hr] = await conn.query(
      `SELECT h.id, so.order_number FROM ${HANDOVER_TABLE} h
         JOIN sales_orders so ON so.id = h.sales_order_id
        WHERE h.lead_id = ? LIMIT 1`,
      [id]
    );
    const already = (hr as { order_number: string }[])[0];
    if (already) {
      await conn.rollback();
      return NextResponse.json(
        { error: `This lead is already converted (order ${already.order_number})` },
        { status: 409 }
      );
    }

    /* products must belong to this company */
    const productIds = items
      .map((it: { product_id: number | null }) => it.product_id)
      .filter(Boolean);
    const productNames = new Map<number, string>();
    if (productIds.length) {
      const [pr] = await conn.query(
        `SELECT id, name FROM products WHERE company_id = ? AND id IN (?)`,
        [user.company_id, productIds]
      );
      for (const p of pr as { id: number; name: string }[]) productNames.set(p.id, p.name);
      if (productNames.size !== new Set(productIds).size) {
        await conn.rollback();
        return NextResponse.json({ error: "A selected product was not found" }, { status: 400 });
      }
    }

    /* ---------- customer: find by phone, else create ---------- */
    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const address = formatAddress(d);
    let customer = await findCustomerByPhones(conn, user.company_id, [
      lead.whatsapp,
      lead.phone,
      d.delivery_phone,
    ]);
    let customerCreated = false;
    if (!customer) {
      const notes = [
        `From lead ${lead.lead_number}`,
        professionText(lead.profession, lead.profession_other) &&
          `Profession: ${professionText(lead.profession, lead.profession_other)}`,
        formatUseCases(lead.use_cases, lead.use_case_custom) &&
          `Use: ${formatUseCases(lead.use_cases, lead.use_case_custom)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      const c = await createCustomer(conn, user, {
        name: leadName,
        phone: lead.phone || lead.whatsapp || d.delivery_phone,
        whatsapp: lead.whatsapp || null,
        alternate_phone:
          d.delivery_phone && d.delivery_phone !== (lead.whatsapp || lead.phone)
            ? d.delivery_phone
            : d.delivery_phone2,
        city: d.delivery_city || lead.city,
        address,
        lead_source: lead.source,
        profession: lead.profession,
        profession_other: lead.profession_other,
        notes,
      });
      customer = {
        id: c.id,
        customer_code: c.customer_code,
        name: leadName,
        phone: lead.phone || lead.whatsapp,
        whatsapp: lead.whatsapp,
        city: d.delivery_city,
      };
      customerCreated = true;
    } else {
      // keep the latest delivery address on the existing customer
      await conn.query(
        `UPDATE customers SET shipping_address = ?, city = IFNULL(city, ?) WHERE id = ?`,
        [address, d.delivery_city, customer.id]
      );
    }

    /* ---------- sales order (confirmed) ---------- */
    const orderNumber = await nextSalesOrderNumber(conn, user.company_id);
    const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    const cod = Math.round((total - advance) * 100) / 100;
    const notes = [
      `Online order from lead ${lead.lead_number}`,
      `Deliver to: ${d.delivery_name}, ${d.delivery_phone}${d.delivery_phone2 ? " / " + d.delivery_phone2 : ""}`,
      `Address: ${address}`,
      specs ? `Specs: ${specs}` : null,
      `Advance: Rs ${advance.toLocaleString("en-PK")}${advance > 0 ? ` (${advMethod}${body.advance_reference ? ", ref " + String(body.advance_reference).slice(0, 100) : ""})` : ""} · COD: Rs ${cod.toLocaleString("en-PK")}`,
      dispatchNotes ? `Note: ${dispatchNotes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const [soRes] = await conn.query(
      `INSERT INTO sales_orders
         (company_id, branch_id, order_number, customer_id, quotation_id, order_date, delivery_date,
          status, subtotal, tax_total, discount_total, shipping_total, grand_total,
          notes, terms, created_by)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'confirmed', ?, 0, 0, 0, ?, ?, NULL, ?)`,
      [user.company_id, user.branch_id ?? null, orderNumber, customer.id, today, dispatchDate, total, total, notes, user.id]
    );
    const salesOrderId = (soRes as { insertId: number }).insertId;

    for (const it of items as { product_id: number | null; description: string; quantity: number; unit_price: number }[]) {
      const line = it.quantity * it.unit_price;
      const desc = it.description || (it.product_id ? productNames.get(it.product_id) || "" : "");
      await conn.query(
        `INSERT INTO sales_order_items
           (sales_order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?)`,
        [salesOrderId, it.product_id, desc, it.quantity, it.unit_price, line, line]
      );
    }

    /* ---------- handover ---------- */
    const [hRes] = await conn.query(
      `INSERT INTO ${HANDOVER_TABLE}
         (company_id, lead_id, customer_id, sales_order_id, status, total_amount,
          advance_amount, advance_method, advance_reference, cod_amount, specs_note,
          delivery_name, delivery_phone, delivery_phone2, delivery_house, delivery_street,
          delivery_area, delivery_landmark, delivery_city, dispatch_date, dispatch_notes, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.company_id, id, customer.id, salesOrderId, total,
        advance, advMethod, cleanStr(body.advance_reference, 100), cod, specs,
        d.delivery_name, d.delivery_phone, d.delivery_phone2, d.delivery_house, d.delivery_street,
        d.delivery_area, d.delivery_landmark, d.delivery_city, dispatchDate, dispatchNotes, user.id,
      ]
    );

    /* ---------- lead -> won, keep delivery address on the lead ---------- */
    await conn.query(
      `UPDATE ${LEADS_TABLE}
          SET status = 'won', lost_reason = NULL, lost_reason_other = NULL,
              delivery_name = ?, delivery_phone = ?, delivery_phone2 = ?, delivery_house = ?,
              delivery_street = ?, delivery_area = ?, delivery_landmark = ?, delivery_city = ?
        WHERE id = ?`,
      [
        d.delivery_name, d.delivery_phone, d.delivery_phone2, d.delivery_house,
        d.delivery_street, d.delivery_area, d.delivery_landmark, d.delivery_city, id,
      ]
    );

    await conn.commit();
    return NextResponse.json(
      {
        data: {
          handover_id: (hRes as { insertId: number }).insertId,
          sales_order_id: salesOrderId,
          order_number: orderNumber,
          customer_id: customer.id,
          customer_code: customer.customer_code,
          customer_created: customerCreated,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    // unique key on lead_id -> converted at the same moment by someone else
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "This lead was just converted" }, { status: 409 });
    }
    console.error("POST /api/leads/[id]/convert error:", err);
    return NextResponse.json({ error: "Failed to convert lead" }, { status: 500 });
  } finally {
    conn.release();
  }
}
