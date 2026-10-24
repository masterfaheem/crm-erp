import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ensureStockTable, recalcCustomer, recalcInvoice, removeDocStock, syncDocStock } from "@/lib/ledger";
import { currentCosts, ensurePosTables } from "@/lib/posSale";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const [header] = await query<any[]>(
      `SELECT i.*, c.name AS customer_name, so.order_number AS so_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    if (!header) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const items = await query<any[]>(
      `SELECT id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
              line_subtotal, line_tax, line_discount, line_total
         FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC`,
      [id]
    );
    return NextResponse.json({ data: { ...header, items } });
  } catch (err) {
    console.error("[GET /api/invoices/:id]", err);
    return NextResponse.json({ error: "Unable to load invoice." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const pool = getPool(); const conn = await pool.getConnection();
  try {
    const body = await req.json().catch(() => ({}));
    const customer_id = Number(body.customer_id);
    const invoice_date = String(body.invoice_date || "").slice(0, 10);
    const due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
    const status = String(body.status || "unpaid");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    if (!customer_id || !invoice_date || !items.length) {
      conn.release();
      return NextResponse.json({ error: "Customer, date and at least one item are required." }, { status: 400 });
    }
    const [existing] = await query<any[]>(
      "SELECT id, paid_amount, customer_id, discount_total, shipping_total, status, invoice_number FROM invoices WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) {
      conn.release();
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    /* cancelled / exchange bills are history — they can't be edited */
    if (existing.status === "cancelled" || String(existing.invoice_number).startsWith("EXC-")) {
      conn.release();
      return NextResponse.json(
        { error: existing.status === "cancelled" ? "A cancelled bill can't be edited." : "An exchange bill can't be edited." },
        { status: 409 }
      );
    }
    await ensureStockTable();
    await ensurePosTables();
    /* keep the bill-level discount + shipping that POS saved (unless sent again) */
    const [lineDisc] = await query<any[]>(
      "SELECT COALESCE(SUM(line_discount), 0) AS d FROM invoice_items WHERE invoice_id = ?",
      [id]
    );
    const orderDiscount = Math.max(
      0,
      body.order_discount_amount !== undefined
        ? Number(body.order_discount_amount) || 0
        : Number(existing.discount_total || 0) - Number(lineDisc?.d || 0)
    );
    const shipping = Math.max(
      0,
      body.shipping_total !== undefined ? Number(body.shipping_total) || 0 : Number(existing.shipping_total || 0)
    );

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

    discount_total += orderDiscount;
    grand_total = Math.max(0, grand_total - orderDiscount) + shipping;
    // recompute balance from existing paid_amount
    const paid = Number(existing.paid_amount ?? 0);
    const balance = Math.max(0, grand_total - paid);

    // if user manually set status to paid/unpaid, respect it; else derive
    let derivedStatus = status;
    if (!["draft", "cancelled"].includes(status)) {
      if (paid >= grand_total && grand_total > 0) derivedStatus = "paid";
      else if (paid > 0) derivedStatus = "partially_paid";
      else derivedStatus = "unpaid";
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE invoices SET customer_id = ?, invoice_date = ?, due_date = ?, status = ?,
         subtotal = ?, tax_total = ?, discount_total = ?, shipping_total = ?, grand_total = ?,
         balance = ?, notes = ?, terms = ?
       WHERE id = ? AND company_id = ?`,
      [customer_id, invoice_date, due_date, derivedStatus,
       subtotal, tax_total, discount_total, shipping, grand_total,
       balance, notes, terms, id, companyId]
    );
    /* keep the cost saved at the time of sale; new products get today's cost */
    const [oldCostRows] = await conn.query(
      "SELECT product_id, MAX(unit_cost) AS c FROM invoice_items WHERE invoice_id = ? AND unit_cost IS NOT NULL GROUP BY product_id",
      [id]
    );
    const oldCost = new Map<number, number>(
      (oldCostRows as { product_id: number; c: number }[]).map((r) => [Number(r.product_id), Number(r.c)])
    );
    const nowCost = await currentCosts(conn, companyId, prepared.map((p) => Number(p.product_id) || 0));
    await conn.query("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
    for (const p of prepared) {
      const pid = Number(p.product_id) || 0;
      await conn.query(
        `INSERT INTO invoice_items
           (invoice_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total,
         oldCost.get(pid) ?? nowCost.get(pid) ?? null]
      );
    }
    // payments on this bill move with the customer
    await conn.query("UPDATE customer_payments SET customer_id = ? WHERE invoice_id = ? AND company_id = ?", [customer_id, id, companyId]);
    await syncDocStock(conn, companyId, "invoice", id, user.id);
    await recalcInvoice(conn, id, companyId);
    if (Number(existing.customer_id) !== customer_id) await recalcCustomer(conn, companyId, Number(existing.customer_id));
    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT i.*, c.name AS customer_name, so.order_number AS so_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ?`,
      [id, companyId]
    );
    return NextResponse.json({ data: row });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[PUT /api/invoices/:id]", err);
    return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const conn = await getPool().getConnection();
  try {
    const [[existing]] = await conn.query(
      "SELECT id, customer_id, status FROM invoices WHERE id = ? AND company_id = ? LIMIT 1", [id, companyId]
    ) as any[];
    if (!existing) {
      conn.release();
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    /* bills are never deleted (only an unused draft can be) — cancel keeps the record */
    if (existing.status !== "draft") {
      conn.release();
      return NextResponse.json(
        { error: "Bills can't be deleted. Use Cancel — the bill stays on record with the reason." },
        { status: 409 }
      );
    }

    // Online order billed by this invoice: block once dispatched, otherwise send it back to "To bill"
    let h: any = null;
    try {
      const [[row]] = await conn.query(
        "SELECT id, status, sales_order_id, payment_id FROM crm_order_handovers WHERE invoice_id = ? AND company_id = ? LIMIT 1",
        [id, companyId]
      ) as any[];
      h = row || null;
    } catch {
      /* handover table not created yet */
    }
    if (h && h.status !== "invoiced") {
      conn.release();
      return NextResponse.json(
        { error: "This bill belongs to an online order that is already dispatched — it can't be deleted." },
        { status: 409 }
      );
    }

    // Block delete if cleared payments exist (the online order's own payment stays with the order)
    const [[pay]] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM customer_payments WHERE invoice_id = ? AND company_id = ? AND status = 'cleared' AND id <> ?",
      [id, companyId, h?.payment_id || 0]
    ) as any[];
    if (Number(pay?.cnt ?? 0) > 0) {
      conn.release();
      return NextResponse.json(
        { error: `Cannot delete: ${pay.cnt} cleared payment(s) are linked to this invoice. Delete the payment first.` },
        { status: 409 }
      );
    }

    await conn.beginTransaction();
    if (h) {
      await conn.query("UPDATE crm_order_handovers SET invoice_id = NULL, status = 'pending' WHERE id = ?", [h.id]);
      await conn.query("UPDATE sales_orders SET status = 'confirmed' WHERE id = ? AND company_id = ?", [h.sales_order_id, companyId]);
      if (h.payment_id) {
        await conn.query("UPDATE customer_payments SET invoice_id = NULL WHERE id = ? AND company_id = ?", [h.payment_id, companyId]);
      }
    }
    await removeDocStock(conn, companyId, "invoice", id);
    await conn.query("DELETE FROM crm_invoice_leads WHERE invoice_id = ? AND company_id = ?", [id, companyId]).catch(() => {});
    await conn.query("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
    await conn.query("DELETE FROM invoices WHERE id = ? AND company_id = ?", [id, companyId]);
    await recalcCustomer(conn, companyId, Number(existing.customer_id));
    await conn.commit(); conn.release();
    return NextResponse.json({ success: true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[DELETE /api/invoices/:id]", err);
    return NextResponse.json({ error: "Failed to delete invoice." }, { status: 500 });
  }
}
