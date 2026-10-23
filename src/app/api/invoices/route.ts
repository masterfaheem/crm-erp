import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { ensureLedgerReady } from "@/lib/ledgerSetup";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accessFromRequest, can } from "@/lib/access";
import { addCustomerPayment, ensureStockTable, recalcInvoice, syncDocStock, nextDocNumber } from "@/lib/ledger";

async function nextInvoiceNumber(companyId: number): Promise<string> {
  return nextDocNumber("invoices", "invoice_number", "INV", companyId);
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  await ensureLedgerReady().catch((e) => console.error("ledger setup", e));
  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const customerId = (searchParams.get("customer_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["i.company_id = ?"];
    const params: any[] = [companyId];
    if (search) { where.push("(i.invoice_number LIKE ? OR c.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (status) { where.push("i.status = ?"); params.push(status); }
    if (customerId && Number.isFinite(Number(customerId))) { where.push("i.customer_id = ?"); params.push(Number(customerId)); }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT i.id, i.invoice_number, i.customer_id, c.name AS customer_name,
              i.sales_order_id, so.order_number AS so_number,
              i.invoice_date, i.due_date, i.status,
              i.subtotal, i.tax_total, i.discount_total, i.shipping_total, i.grand_total,
              i.paid_amount, i.balance, i.notes, i.created_at,
              COALESCE(items.cnt, 0) AS item_count
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
         LEFT JOIN (
           SELECT invoice_id, COUNT(*) AS cnt FROM invoice_items GROUP BY invoice_id
         ) items ON items.invoice_id = i.id
         ${whereSql}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_invoices }] = await query<Array<{ total_invoices: number }>>(
      "SELECT COUNT(*) AS total_invoices FROM invoices WHERE company_id = ?",
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_invoices,
    });
  } catch (err) {
    console.error("[GET /api/invoices]", err);
    return NextResponse.json({ error: "Unable to load invoices." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => ({}));
    const customer_id = Number(body.customer_id);
    const invoice_date = String(body.invoice_date || "").slice(0, 10);
    const due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
    const status = String(body.status || "unpaid");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const sales_order_id = body.sales_order_id ? Number(body.sales_order_id) : null;

    const items: Array<{
      product_id: number | null; description: string;
      quantity: number; unit_price: number; tax_rate: number; discount_percent: number;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!customer_id) { conn.release(); return NextResponse.json({ error: "Customer is required." }, { status: 400 }); }
    if (!invoice_date) { conn.release(); return NextResponse.json({ error: "Invoice date is required." }, { status: 400 }); }
    if (!items.length) { conn.release(); return NextResponse.json({ error: "At least one line item is required." }, { status: 400 }); }

    /* discount needs permission */
    let givesDiscount = (Number(body.order_discount_amount) || 0) > 0;
    const discItems = items.filter((it) => (Number(it.discount_percent) || 0) > 0);
    if (!givesDiscount && discItems.length) {
      // a product's own default discount is fine; anything above it is a manual discount
      const ids = discItems.map((it) => Number(it.product_id)).filter(Boolean);
      const [prows] = ids.length
        ? await conn.query("SELECT id, discount_percent FROM products WHERE company_id = ? AND id IN (?)", [companyId, ids])
        : [[]];
      const def = new Map((prows as { id: number; discount_percent: number }[]).map((p) => [Number(p.id), Number(p.discount_percent) || 0]));
      givesDiscount = discItems.some((it) => (Number(it.discount_percent) || 0) > (def.get(Number(it.product_id)) ?? 0) + 0.001);
    }
    if (givesDiscount && !can(await accessFromRequest(req), "sales.discount")) {
      conn.release();
      return NextResponse.json({ error: "You don't have permission to give discount. Ask your manager." }, { status: 403 });
    }

    let subtotal = 0, tax_total = 0, discount_total = 0, grand_total = 0;
    const prepared = items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const tax = Number(it.tax_rate) || 0;
      const disc = Number(it.discount_percent) || 0;
      const sub = qty * price;
      const line_discount = (sub * disc) / 100;
      const afterDisc = sub - line_discount;
      const line_tax = (afterDisc * tax) / 100;
      const line_total = afterDisc + line_tax;
      subtotal += sub; discount_total += line_discount; tax_total += line_tax; grand_total += line_total;
      return {
        product_id: it.product_id ?? null,
        description: String(it.description || "").trim(),
        quantity: qty, unit_price: price, tax_rate: tax, discount_percent: disc,
        line_subtotal: sub, line_tax, line_discount, line_total,
      };
    });

    /* POS extras: order-level discount + shipping (amounts in Rs) */
    const orderDiscount = Math.max(0, Number(body.order_discount_amount) || 0);
    const shipping = Math.max(0, Number(body.shipping_total ?? body.shipping_fee) || 0);
    discount_total += Math.min(orderDiscount, grand_total);
    grand_total = Math.max(0, grand_total - orderDiscount) + shipping;
    grand_total = Math.round(grand_total * 100) / 100;

    await ensureStockTable();
    await conn.beginTransaction();

    /* ---- Online order (lead handover): bill only once, its payment is linked ---- */
    let handover: {
      id: number; advance_amount: number; payment_id: number | null;
      advance_method: string | null; advance_reference: string | null; order_number: string;
    } | null = null;
    if (sales_order_id) {
      const [soRows] = await conn.query<any>(
        `SELECT id FROM sales_orders WHERE id = ? AND company_id = ? FOR UPDATE`,
        [sales_order_id, companyId]
      );
      if (!(soRows as any[]).length) {
        await conn.rollback(); conn.release();
        return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
      }
      const [dupInv] = await conn.query<any>(
        `SELECT invoice_number FROM invoices
          WHERE sales_order_id = ? AND company_id = ? AND status <> 'cancelled' LIMIT 1`,
        [sales_order_id, companyId]
      );
      if ((dupInv as any[]).length) {
        await conn.rollback(); conn.release();
        return NextResponse.json(
          { error: `This order is already billed (${(dupInv as any[])[0].invoice_number}).` },
          { status: 409 }
        );
      }
      try {
        const [hRows] = await conn.query<any>(
          `SELECT h.id, h.advance_amount, h.payment_id, h.advance_method, h.advance_reference, so.order_number
             FROM crm_order_handovers h JOIN sales_orders so ON so.id = h.sales_order_id
            WHERE h.sales_order_id = ? AND h.company_id = ? LIMIT 1`,
          [sales_order_id, companyId]
        );
        const h = (hRows as any[])[0];
        if (h) handover = {
          id: h.id, advance_amount: Number(h.advance_amount) || 0, payment_id: h.payment_id || null,
          advance_method: h.advance_method, advance_reference: h.advance_reference, order_number: h.order_number,
        };
      } catch {
        /* handover table not created yet */
      }
    }

    const invoice_number = await nextInvoiceNumber(companyId);

    const [ins] = await conn.query<any>(
      `INSERT INTO invoices
         (company_id, branch_id, invoice_number, customer_id, sales_order_id,
          invoice_date, due_date, status,
          subtotal, tax_total, discount_total, shipping_total, grand_total,
          paid_amount, balance, notes, terms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        companyId, user.branch_id ?? null, invoice_number, customer_id, sales_order_id,
        invoice_date, due_date, status,
        subtotal, tax_total, discount_total, shipping, grand_total,
        grand_total, notes, terms, user.id,
      ]
    );
    const invoiceId = ins.insertId;

    if (sales_order_id) {
      await conn.query(
        `UPDATE sales_orders SET status = 'processing'
          WHERE id = ? AND company_id = ? AND status IN ('draft', 'confirmed')`,
        [sales_order_id, companyId]
      );
    }
    if (handover) {
      await conn.query(
        `UPDATE crm_order_handovers SET invoice_id = ?, status = 'invoiced' WHERE id = ?`,
        [invoiceId, handover.id]
      );
    }

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO invoice_items
           (invoice_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }

    /* ---- payment: online order payment is linked; POS payment is recorded ---- */
    if (handover) {
      if (handover.payment_id) {
        await conn.query(
          `UPDATE customer_payments SET invoice_id = ? WHERE id = ? AND company_id = ?`,
          [invoiceId, handover.payment_id, companyId]
        );
      } else if (handover.advance_amount > 0) {
        const pid = await addCustomerPayment(conn, user, {
          customer_id, invoice_id: invoiceId, amount: Math.min(handover.advance_amount, grand_total),
          method: handover.advance_method || "bank_transfer", reference: handover.advance_reference,
          notes: `Payment for ${handover.order_number}`,
        });
        await conn.query(`UPDATE crm_order_handovers SET payment_id = ? WHERE id = ?`, [pid, handover.id]);
      }
      /* anything received on top of the order payment (balance paid at billing) */
      const extra =
        Math.min(Math.max(0, Number(body.amount_paid) || 0), grand_total) -
        Math.min(handover.advance_amount, grand_total);
      if (extra > 0.009) {
        await addCustomerPayment(conn, user, {
          customer_id, invoice_id: invoiceId, amount: extra,
          method: String(body.payment_method || "bank_transfer"),
          reference: body.payment_reference ? String(body.payment_reference).slice(0, 100) : null,
          payment_date: invoice_date, notes: `Balance received for ${handover.order_number}`,
        });
      }
    } else {
      const paidNow = Math.min(Math.max(0, Number(body.amount_paid) || 0), grand_total);
      if (paidNow > 0) {
        await addCustomerPayment(conn, user, {
          customer_id, invoice_id: invoiceId, amount: paidNow,
          method: String(body.payment_method || "cash"),
          reference: body.payment_reference
            ? String(body.payment_reference).slice(0, 100)
            : body.reference ? String(body.reference).slice(0, 100) : null,
          payment_date: invoice_date, notes: "POS",
        });
      }
    }

    await syncDocStock(conn, companyId, "invoice", invoiceId, user.id);
    await recalcInvoice(conn, invoiceId, companyId);

    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT i.*, c.name AS customer_name, so.order_number AS so_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ?`,
      [invoiceId, companyId]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[POST /api/invoices]", err);
    return NextResponse.json({ error: "Failed to create invoice." }, { status: 500 });
  }
}
