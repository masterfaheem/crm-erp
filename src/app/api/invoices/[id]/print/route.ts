import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { METHOD_LABEL } from "@/lib/ledger";
import { INVOICE_META_TABLE, ensureSalesOpsTables, listExchanges } from "@/lib/salesOps";

/* ============================================================
   GET /api/invoices/:id/print
   Everything the printable / PDF invoice needs, read from the
   SAVED bill (never from today's product prices). No cost / profit.
============================================================ */
type Row = Record<string, unknown>;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const companyId = user.company_id;

  try {
    await ensureSalesOpsTables().catch((e) => console.error("sales ops setup", e));
    const pool = getPool();
    const [hRows] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.created_at, i.status,
              i.subtotal, i.tax_total, i.discount_total, i.shipping_total, i.grand_total,
              i.paid_amount, i.balance, i.notes, i.sales_order_id,
              c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
              c.whatsapp AS customer_whatsapp, c.billing_address AS customer_address, c.city AS customer_city,
              u.name AS salesperson, so.order_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN users u ON u.id = i.created_by
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.id = ? AND i.company_id = ? LIMIT 1`,
      [id, companyId]
    );
    const inv = (hRows as Row[])[0];
    if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const [items] = await pool.query(
      `SELECT ii.description, ii.quantity, ii.unit_price, ii.tax_rate, ii.discount_percent,
              ii.line_subtotal, ii.line_discount, ii.line_tax, ii.line_total, p.sku
         FROM invoice_items ii LEFT JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ? ORDER BY ii.id ASC`,
      [id]
    );

    const [pays] = await pool.query(
      `SELECT payment_number, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, amount, method, reference
         FROM customer_payments
        WHERE company_id = ? AND invoice_id = ? AND status = 'cleared' ORDER BY id ASC`,
      [companyId, id]
    );
    const payments = (pays as Row[]).map((p) => {
      const ref = String(p.reference || "");
      let label = METHOD_LABEL[String(p.method)] || String(p.method || "");
      if (p.method === "online") label = /^JazzCash/.test(ref) ? "JazzCash" : /^Easypaisa/.test(ref) ? "Easypaisa" : "JazzCash / Easypaisa";
      return { ...p, amount: Number(p.amount), method_label: label };
    });

    /* online order: delivery details from the handover */
    let delivery: Row | null = null;
    try {
      const [dRows] = await pool.query(
        `SELECT delivery_name, delivery_phone, delivery_phone2, delivery_house, delivery_street,
                delivery_area, delivery_landmark, delivery_city, courier, tracking_no, status
           FROM crm_order_handovers WHERE invoice_id = ? AND company_id = ? LIMIT 1`,
        [id, companyId]
      );
      delivery = (dRows as Row[])[0] || null;
    } catch {
      /* table not created yet */
    }

    /* counter / delivery, cancellation, exchanges */
    let meta: Row | null = null;
    let exchange: Row | null = null;
    let exchangedLater: Row[] = [];
    let refunds: Row[] = [];
    try {
      const [mRows] = await pool.query(
        `SELECT delivery_mode, DATE_FORMAT(delivered_at, '%Y-%m-%d %H:%i') AS delivered_on,
                DATE_FORMAT(cancelled_at, '%Y-%m-%d %H:%i') AS cancelled_on, cancel_reason, cancel_settlement
           FROM ${INVOICE_META_TABLE} WHERE invoice_id = ? LIMIT 1`,
        [id]
      );
      meta = (mRows as Row[])[0] || null;
      const ex = (await listExchanges(pool, companyId, { invoice_id: id })) as Row[];
      exchange = ex.find((e) => Number(e.exchange_invoice_id) === id) || null;
      exchangedLater = ex.filter((e) => Number(e.original_invoice_id) === id);
      const [rf] = await pool.query(
        `SELECT refund_number, DATE_FORMAT(refund_date, '%Y-%m-%d') AS refund_date, amount, method
           FROM crm_customer_refunds WHERE company_id = ? AND invoice_id = ? ORDER BY id`,
        [companyId, id]
      );
      refunds = (rf as Row[]).map((r) => ({ ...r, amount: Number(r.amount) }));
    } catch (e) {
      console.error("print extras", e);
    }

    return NextResponse.json({
      data: {
        ...inv,
        channel: delivery ? "online" : "walk_in",
        items,
        payments,
        delivery,
        meta,
        exchange,
        exchanged_later: exchangedLater.map((e) => ({ exchange_number: e.exchange_number, date: String(e.created_at), exchange_invoice_id: e.exchange_invoice_id })),
        refunds,
      },
    });
  } catch (err) {
    console.error("[GET /api/invoices/:id/print]", err);
    return NextResponse.json({ error: "Unable to load invoice." }, { status: 500 });
  }
}
