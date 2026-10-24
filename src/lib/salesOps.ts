import { getPool } from "@/lib/db";
import { isExchangeNo } from "@/lib/format";
import { LEADS_TABLE } from "@/lib/leadsTable";
import {
  REFUND_TABLE,
  STOCK_SQL,
  STOCK_TABLE,
  addCustomerPayment,
  ensureStockTable,
  recalcCustomer,
  recalcInvoice,
} from "@/lib/ledger";
import { HANDOVER_TABLE, ensureHandoverTable } from "@/lib/orderHandover";
import { INVOICE_LEAD_TABLE, currentCosts, ensurePosTables, lockedDocNumber, lockedSeqNumber } from "@/lib/posSale";
import { WARRANTY_DAYS } from "@/lib/invoiceBrand";

/* ============================================================
   SALES OPERATIONS
   - walk-in delivery: counter hand-over (delivered now) or send to dispatch
   - cancel a bill (never delete): stock back, payment refunded or kept as credit,
     lead restored, online order goes back to "to bill"
   - exchange: return sold unit(s) on an old bill and give other unit(s);
     one EXC- bill holds the returned lines (negative) + given lines, so stock,
     khata and profit only move by the real difference
   - refunds: money paid back to the customer (counted in khata)
   Tables are created automatically; nothing existing is removed.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;
type U = { id: number; company_id: number; branch_id: number | null };

export const INVOICE_META_TABLE = "crm_invoice_meta";
export const EXCHANGE_TABLE = "crm_exchanges";
export const EXCHANGE_ITEM_TABLE = "crm_exchange_items";

export const MONEY_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "wallet", label: "JazzCash / Easypaisa" },
  { value: "card", label: "Card (POS machine)" },
];
const METHOD_VALUES = new Set(MONEY_METHODS.map((m) => m.value));
export const methodLabel = (v: unknown) => MONEY_METHODS.find((m) => m.value === v)?.label || String(v || "");

const r2 = (n: number) => Math.round(n * 100) / 100;
export const todayPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
export const nowPKTSql = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 19).replace("T", " ");
function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function ymdOf(v: unknown): string {
  if (v instanceof Date) return new Date(v.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export class OpError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

/* ---------------- tables (run BEFORE beginTransaction) ---------------- */
let ready = false;
export async function ensureSalesOpsTables(): Promise<void> {
  if (ready) return;
  await ensurePosTables();
  await ensureHandoverTable();
  await ensureStockTable();
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${REFUND_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      branch_id INT UNSIGNED NULL,
      refund_number VARCHAR(40) NOT NULL,
      customer_id INT UNSIGNED NOT NULL,
      invoice_id INT UNSIGNED NULL,
      refund_date DATE NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      method VARCHAR(30) NOT NULL,
      reference VARCHAR(150) NULL,
      reason VARCHAR(500) NULL,
      source VARCHAR(20) NOT NULL,
      source_id INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_refund_number (company_id, refund_number),
      KEY idx_customer (company_id, customer_id),
      KEY idx_invoice (company_id, invoice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${INVOICE_META_TABLE} (
      invoice_id INT UNSIGNED NOT NULL PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      delivery_mode VARCHAR(20) NULL,
      delivered_at DATETIME NULL,
      handover_id INT UNSIGNED NULL,
      cancelled_at DATETIME NULL,
      cancelled_by INT UNSIGNED NULL,
      cancel_reason VARCHAR(500) NULL,
      cancel_settlement VARCHAR(20) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${EXCHANGE_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      exchange_number VARCHAR(40) NOT NULL,
      exchange_invoice_id INT UNSIGNED NOT NULL,
      original_invoice_id INT UNSIGNED NOT NULL,
      customer_id INT UNSIGNED NOT NULL,
      returned_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      given_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      difference DECIMAL(14,2) NOT NULL DEFAULT 0,
      settlement VARCHAR(20) NOT NULL,
      paid_now DECIMAL(14,2) NOT NULL DEFAULT 0,
      refunded DECIMAL(14,2) NOT NULL DEFAULT 0,
      reason VARCHAR(500) NULL,
      warranty_claim TINYINT(1) NOT NULL DEFAULT 0,
      original_sale_date DATE NULL,
      days_after_sale INT NULL,
      within_warranty TINYINT(1) NOT NULL DEFAULT 0,
      warranty_start DATE NULL,
      warranty_until DATE NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_exchange_invoice (exchange_invoice_id),
      KEY idx_original (original_invoice_id),
      KEY idx_customer (company_id, customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${EXCHANGE_ITEM_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      exchange_id INT UNSIGNED NOT NULL,
      company_id INT UNSIGNED NOT NULL,
      direction VARCHAR(5) NOT NULL,
      original_item_id INT UNSIGNED NULL,
      product_id INT UNSIGNED NULL,
      description VARCHAR(255) NOT NULL,
      quantity DECIMAL(14,3) NOT NULL,
      unit_price DECIMAL(14,2) NOT NULL,
      unit_cost DECIMAL(14,2) NULL,
      serial VARCHAR(100) NULL,
      item_condition VARCHAR(255) NULL,
      KEY idx_exchange (exchange_id),
      KEY idx_original_item (original_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ready = true;
}

/* ---------------- refunds ---------------- */
export async function addRefund(
  conn: Conn,
  user: U,
  p: { customer_id: number; invoice_id: number | null; amount: number; method: string; reference?: string | null; reason?: string | null; source: string; source_id?: number | null }
): Promise<number | null> {
  const amount = r2(Number(p.amount));
  if (!(amount > 0)) return null;
  const num = await lockedDocNumber(conn, REFUND_TABLE, "refund_number", "RF", user.company_id);
  const [res] = await conn.query(
    `INSERT INTO ${REFUND_TABLE}
       (company_id, branch_id, refund_number, customer_id, invoice_id, refund_date, amount, method, reference, reason, source, source_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.company_id, user.branch_id ?? null, num, p.customer_id, p.invoice_id, todayPKT(), amount, p.method,
     p.reference || null, p.reason || null, p.source, p.source_id ?? null, user.id]
  );
  return (res as { insertId: number }).insertId;
}

async function upsertMeta(conn: Conn, invoiceId: number, companyId: number, fields: Record<string, unknown>) {
  const cols = Object.keys(fields);
  await conn.query(
    `INSERT INTO ${INVOICE_META_TABLE} (invoice_id, company_id, ${cols.join(", ")})
     VALUES (?, ?, ${cols.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
    [invoiceId, companyId, ...cols.map((c) => fields[c])]
  );
}

/* ============================================================
   WALK-IN DELIVERY
============================================================ */
export type WalkInDelivery = {
  mode: "counter" | "delivery";
  delivery_name?: string | null; delivery_phone?: string | null; delivery_phone2?: string | null;
  delivery_house?: string | null; delivery_street?: string | null; delivery_area?: string | null;
  delivery_landmark?: string | null; delivery_city?: string | null; dispatch_notes?: string | null;
};

const cs = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/* Validate the POS delivery choice (before the transaction) */
export function cleanWalkInDelivery(v: unknown): { value: WalkInDelivery; error?: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (o.mode !== "delivery") return { value: { mode: "counter" } };
  const d: WalkInDelivery = {
    mode: "delivery",
    delivery_name: cs(o.delivery_name, 120),
    delivery_phone: cs(o.delivery_phone, 40),
    delivery_phone2: cs(o.delivery_phone2, 40),
    delivery_house: cs(o.delivery_house, 100),
    delivery_street: cs(o.delivery_street, 150),
    delivery_area: cs(o.delivery_area, 150),
    delivery_landmark: cs(o.delivery_landmark, 200),
    delivery_city: cs(o.delivery_city, 100),
    dispatch_notes: cs(o.dispatch_notes, 1000),
  };
  const missing: string[] = [];
  if (!d.delivery_name) missing.push("Name");
  if (!d.delivery_phone) missing.push("Phone");
  if (!d.delivery_house && !d.delivery_street && !d.delivery_area) missing.push("House / Street / Area");
  if (!d.delivery_city) missing.push("City");
  return missing.length ? { value: d, error: `Delivery address incomplete: ${missing.join(", ")}` } : { value: d };
}

/* Counter: delivered now.  Delivery: sales order + dispatch record (status "to dispatch")
   so it shows on the existing Online Orders / Dispatch board. */
export async function recordWalkInDelivery(
  conn: Conn,
  user: U,
  p: {
    invoiceId: number; customerId: number; leadId: number | null; grandTotal: number; paid: number;
    items: { product_id: number | null; description: string; quantity: number; unit_price: number; tax_rate: number;
      discount_percent: number; line_subtotal: number; line_tax: number; line_discount: number; line_total: number }[];
    delivery: WalkInDelivery; notes: string | null;
  }
): Promise<{ mode: string; handover_id: number | null; order_number: string | null }> {
  const companyId = user.company_id;
  if (p.delivery.mode !== "delivery") {
    await upsertMeta(conn, p.invoiceId, companyId, { delivery_mode: "counter", delivered_at: nowPKTSql() });
    return { mode: "counter", handover_id: null, order_number: null };
  }
  if (!p.leadId) throw new OpError("No CRM lead linked — cannot send to dispatch");
  const d = p.delivery;
  const orderNumber = await lockedDocNumber(conn, "sales_orders", "order_number", "SO", companyId);
  const today = todayPKT();
  const [so] = await conn.query(
    `INSERT INTO sales_orders
       (company_id, branch_id, order_number, customer_id, quotation_id, order_date, delivery_date,
        status, subtotal, tax_total, discount_total, shipping_total, grand_total, notes, terms, created_by)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, 'processing', ?, 0, 0, 0, ?, ?, NULL, ?)`,
    [companyId, user.branch_id ?? null, orderNumber, p.customerId, today, p.grandTotal, p.grandTotal,
     `Walk-in sale sent for delivery${p.notes ? " — " + p.notes : ""}`.slice(0, 1000), user.id]
  );
  const soId = (so as { insertId: number }).insertId;
  for (const it of p.items) {
    await conn.query(
      `INSERT INTO sales_order_items
         (sales_order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
          line_subtotal, line_tax, line_discount, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [soId, it.product_id, it.description, it.quantity, it.unit_price, it.tax_rate, it.discount_percent,
       it.line_subtotal, it.line_tax, it.line_discount, it.line_total]
    );
  }
  const [h] = await conn.query(
    `INSERT INTO ${HANDOVER_TABLE}
       (company_id, lead_id, customer_id, sales_order_id, invoice_id, status, total_amount,
        advance_amount, advance_method, advance_reference, cod_amount, specs_note,
        delivery_name, delivery_phone, delivery_phone2, delivery_house, delivery_street,
        delivery_area, delivery_landmark, delivery_city, dispatch_date, dispatch_notes, created_by)
     VALUES (?, ?, ?, ?, ?, 'invoiced', ?, ?, NULL, NULL, ?, 'Walk-in (POS) sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, p.leadId, p.customerId, soId, p.invoiceId, p.grandTotal, r2(p.paid), r2(Math.max(0, p.grandTotal - p.paid)),
     d.delivery_name, d.delivery_phone, d.delivery_phone2, d.delivery_house, d.delivery_street,
     d.delivery_area, d.delivery_landmark, d.delivery_city, today, d.dispatch_notes, user.id]
  );
  const handoverId = (h as { insertId: number }).insertId;
  await conn.query("UPDATE invoices SET sales_order_id = ? WHERE id = ? AND company_id = ?", [soId, p.invoiceId, companyId]);
  await upsertMeta(conn, p.invoiceId, companyId, { delivery_mode: "delivery", handover_id: handoverId });
  return { mode: "delivery", handover_id: handoverId, order_number: orderNumber };
}

/* ============================================================
   CANCEL A BILL (never delete)
============================================================ */
export type CancelInput = { reason: string; settlement: "refund" | "credit"; refund_method?: string | null; refund_reference?: string | null };

export function cleanCancelInput(v: unknown): { value: CancelInput; error?: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const reason = cs(o.reason, 500) || "";
  const settlement = o.settlement === "refund" ? "refund" : "credit";
  const refund_method = cs(o.refund_method, 30);
  const value: CancelInput = { reason, settlement, refund_method, refund_reference: cs(o.refund_reference, 150) };
  if (reason.length < 3) return { value, error: "Write the reason for cancelling" };
  if (settlement === "refund" && (!refund_method || !METHOD_VALUES.has(refund_method))) {
    return { value, error: "Select how the money was returned" };
  }
  return { value };
}

export async function cancelInvoice(conn: Conn, user: U, invoiceId: number, input: CancelInput) {
  const companyId = user.company_id;
  const [[inv]] = await conn.query(
    "SELECT * FROM invoices WHERE id = ? AND company_id = ? FOR UPDATE",
    [invoiceId, companyId]
  );
  if (!inv) throw new OpError("Invoice not found", 404);
  if (inv.status === "cancelled") throw new OpError("This bill is already cancelled", 409);
  if (isExchangeNo(inv.invoice_number)) {
    throw new OpError("An exchange bill can't be cancelled. Make another exchange to reverse it.", 409);
  }
  const [exRows] = await conn.query(
    `SELECT exchange_number FROM ${EXCHANGE_TABLE} WHERE original_invoice_id = ? AND company_id = ? LIMIT 1`,
    [invoiceId, companyId]
  );
  const ex = (exRows as { exchange_number: string }[])[0];
  if (ex) throw new OpError(`This bill has an exchange (${ex.exchange_number}) — it can't be cancelled.`, 409);

  /* dispatch record */
  const [[meta]] = await conn.query(`SELECT * FROM ${INVOICE_META_TABLE} WHERE invoice_id = ?`, [invoiceId]);
  const [hRows] = await conn.query(
    `SELECT * FROM ${HANDOVER_TABLE} WHERE invoice_id = ? AND company_id = ? FOR UPDATE`,
    [invoiceId, companyId]
  );
  const h = (hRows as Record<string, unknown>[])[0];
  let orderNote: string | null = null;
  if (h) {
    if (["shipped", "delivered", "completed"].includes(String(h.status))) {
      throw new OpError("This order is already dispatched / delivered. Use Exchange / return instead of cancel.", 409);
    }
    if (meta?.handover_id && Number(meta.handover_id) === Number(h.id)) {
      /* walk-in sent for delivery: cancel its dispatch record too */
      await conn.query(`UPDATE ${HANDOVER_TABLE} SET status = 'cancelled' WHERE id = ?`, [h.id]);
      await conn.query("UPDATE sales_orders SET status = 'cancelled' WHERE id = ? AND company_id = ?", [h.sales_order_id, companyId]);
      orderNote = "delivery cancelled";
    } else {
      /* online order: back to "to bill"; the order's own payment stays with the order */
      await conn.query(`UPDATE ${HANDOVER_TABLE} SET invoice_id = NULL, status = 'pending' WHERE id = ?`, [h.id]);
      await conn.query("UPDATE sales_orders SET status = 'confirmed' WHERE id = ? AND company_id = ?", [h.sales_order_id, companyId]);
      if (h.payment_id) {
        await conn.query("UPDATE customer_payments SET invoice_id = NULL WHERE id = ? AND company_id = ?", [h.payment_id, companyId]);
      }
      orderNote = "online order back to 'to bill'";
    }
  }

  /* money received on this bill (after the order payment moved back) */
  const [[pay]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM customer_payments WHERE company_id = ? AND invoice_id = ? AND status = 'cleared'`,
    [companyId, invoiceId]
  );
  const [[ref]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM ${REFUND_TABLE} WHERE company_id = ? AND invoice_id = ?`,
    [companyId, invoiceId]
  );
  const held = r2(Number(pay.t) - Number(ref.t));

  await conn.query("UPDATE invoices SET status = 'cancelled' WHERE id = ? AND company_id = ?", [invoiceId, companyId]);

  /* stock: add back exactly what this bill took out (kept as a separate history line) */
  const [moves] = await conn.query(
    `SELECT product_id, SUM(qty) AS q FROM ${STOCK_TABLE} WHERE company_id = ? AND ref_type = 'invoice' AND ref_id = ? GROUP BY product_id`,
    [companyId, invoiceId]
  );
  for (const m of moves as { product_id: number; q: number }[]) {
    const q = Number(m.q) || 0;
    if (!q) continue;
    await conn.query(
      `INSERT INTO ${STOCK_TABLE} (company_id, product_id, qty, move_type, ref_type, ref_id, ref_number, note, created_by)
       VALUES (?, ?, ?, 'sale_cancel', 'invoice', ?, ?, ?, ?)`,
      [companyId, m.product_id, -q, invoiceId, inv.invoice_number, `Bill cancelled: ${input.reason}`.slice(0, 255), user.id]
    );
  }

  let refundId: number | null = null;
  if (held > 0 && input.settlement === "refund") {
    refundId = await addRefund(conn, user, {
      customer_id: Number(inv.customer_id), invoice_id: invoiceId, amount: held, method: String(input.refund_method),
      reference: input.refund_reference, reason: `Cancelled ${inv.invoice_number}: ${input.reason}`, source: "cancel", source_id: invoiceId,
    });
  }

  /* CRM lead: undo the "Won" this bill caused (only if no other live bill keeps it Won) */
  const [links] = await conn.query(`SELECT * FROM ${INVOICE_LEAD_TABLE} WHERE invoice_id = ?`, [invoiceId]);
  for (const l of links as { lead_id: number; lead_created: number; prev_status: string | null }[]) {
    const [[other]] = await conn.query(
      `SELECT COUNT(*) AS n FROM ${INVOICE_LEAD_TABLE} il JOIN invoices i ON i.id = il.invoice_id
        WHERE il.lead_id = ? AND il.invoice_id <> ? AND i.status <> 'cancelled'`,
      [l.lead_id, invoiceId]
    );
    if (Number(other.n) > 0) continue;
    if (Number(l.lead_created) === 1) {
      await conn.query(
        `UPDATE ${LEADS_TABLE} SET status = 'lost', lost_reason = 'other', lost_reason_other = ? WHERE id = ? AND company_id = ?`,
        [`Bill ${inv.invoice_number} cancelled`.slice(0, 200), l.lead_id, companyId]
      );
    } else {
      await conn.query(`UPDATE ${LEADS_TABLE} SET status = ?, sales_channel = NULL WHERE id = ? AND company_id = ?`, [
        l.prev_status && l.prev_status !== "won" ? l.prev_status : "negotiation",
        l.lead_id,
        companyId,
      ]);
    }
  }

  await upsertMeta(conn, invoiceId, companyId, {
    cancelled_at: nowPKTSql(),
    cancelled_by: user.id,
    cancel_reason: input.reason,
    cancel_settlement: held > 0 ? input.settlement : "none",
  });
  await recalcInvoice(conn, invoiceId, companyId);
  await recalcCustomer(conn, companyId, Number(inv.customer_id));
  return {
    invoice_number: String(inv.invoice_number),
    money_held: held,
    settlement: held > 0 ? input.settlement : "none",
    refund_id: refundId,
    order_note: orderNote,
  };
}

/* ============================================================
   EXCHANGE
============================================================ */
export type ExchangeInput = {
  original_invoice_id: number;
  returned: { item_id: number; quantity: number; credit_price: number; serial: string | null; condition: string | null }[];
  given: { product_id: number | null; description: string; quantity: number; unit_price: number; serial: string | null }[];
  reason: string;
  warranty_claim: boolean;
  warranty_start: "original" | "fresh";
  payment: { amount: number; method: string | null; reference: string | null };
  refund_mode: "refund" | "credit";
  refund_method: string | null;
  refund_reference: string | null;
};

export function cleanExchangeInput(v: unknown): { value: ExchangeInput; error?: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
  const pay = (o.payment && typeof o.payment === "object" ? o.payment : {}) as Record<string, unknown>;
  const value: ExchangeInput = {
    original_invoice_id: Number(o.original_invoice_id) || 0,
    returned: arr(o.returned)
      .map((r) => ({
        item_id: Number(r.item_id) || 0,
        quantity: Number(r.quantity) || 0,
        credit_price: r2(Number(r.credit_price) || 0),
        serial: cs(r.serial, 100),
        condition: cs(r.condition, 255),
      }))
      .filter((r) => r.item_id && r.quantity > 0),
    given: arr(o.given)
      .map((g) => ({
        product_id: Number(g.product_id) || null,
        description: cs(g.description, 200) || "",
        quantity: Number(g.quantity) || 0,
        unit_price: r2(Number(g.unit_price) || 0),
        serial: cs(g.serial, 100),
      }))
      .filter((g) => g.quantity > 0),
    reason: cs(o.reason, 500) || "",
    warranty_claim: !!o.warranty_claim,
    warranty_start: o.warranty_start === "fresh" ? "fresh" : "original",
    payment: { amount: r2(Math.max(0, Number(pay.amount) || 0)), method: cs(pay.method, 30), reference: cs(pay.reference, 150) },
    refund_mode: o.refund_mode === "refund" ? "refund" : "credit",
    refund_method: cs(o.refund_method, 30),
    refund_reference: cs(o.refund_reference, 150),
  };
  if (!value.original_invoice_id) return { value, error: "Select the original bill" };
  if (!value.returned.length) return { value, error: "Select the unit(s) the customer is returning" };
  if (value.returned.some((r) => r.credit_price < 0) || value.given.some((g) => g.unit_price < 0)) {
    return { value, error: "Prices can't be negative" };
  }
  if (value.given.some((g) => !g.product_id && !g.description)) return { value, error: "Write the model name for custom items" };
  if (value.reason.length < 3) return { value, error: "Write the reason for the exchange" };
  if (value.payment.amount > 0 && (!value.payment.method || !METHOD_VALUES.has(value.payment.method))) {
    return { value, error: "Select how the customer paid the difference" };
  }
  if (value.refund_mode === "refund" && (!value.refund_method || !METHOD_VALUES.has(value.refund_method))) {
    return { value, error: "Select how the money is returned" };
  }
  return { value };
}

/* Warranty start of a bill: its sale date, or (for an exchange bill) the warranty start chosen then */
async function warrantyBase(conn: Conn, inv: Record<string, unknown>) {
  const [rows] = await conn.query(
    `SELECT DATE_FORMAT(warranty_start, '%Y-%m-%d') AS ws FROM ${EXCHANGE_TABLE} WHERE exchange_invoice_id = ? LIMIT 1`,
    [inv.id]
  );
  const ws = (rows as { ws: string | null }[])[0]?.ws;
  return ws || ymdOf(inv.invoice_date);
}

/* Original bill + what can still be returned (for the exchange screen) */
export async function loadExchangeSource(conn: Conn, companyId: number, invoiceKey: string | number) {
  const byId = typeof invoiceKey === "number" || /^\d+$/.test(String(invoiceKey));
  const [rows] = await conn.query(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.customer_code
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ? AND ${byId ? "i.id = ?" : "i.invoice_number = ?"} LIMIT 1`,
    [companyId, byId ? Number(invoiceKey) : String(invoiceKey).trim().toUpperCase()]
  );
  const inv = (rows as Record<string, unknown>[])[0];
  if (!inv) return null;
  const [items] = await conn.query(
    `SELECT ii.id, ii.product_id, ii.description, ii.quantity, ii.unit_price, ii.line_total, ii.unit_cost, p.sku
       FROM invoice_items ii LEFT JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ? AND ii.quantity > 0 ORDER BY ii.id`,
    [inv.id]
  );
  const ids = (items as { id: number }[]).map((i) => i.id);
  const back = new Map<number, number>();
  if (ids.length) {
    const [b] = await conn.query(
      `SELECT original_item_id, SUM(quantity) AS q FROM ${EXCHANGE_ITEM_TABLE}
        WHERE direction = 'in' AND original_item_id IN (?) GROUP BY original_item_id`,
      [ids]
    );
    for (const r of b as { original_item_id: number; q: number }[]) back.set(Number(r.original_item_id), Number(r.q));
  }
  const base = await warrantyBase(conn, inv);
  const today = todayPKT();
  const days = Math.round((Date.parse(today) - Date.parse(base)) / 86400000);
  const [exs] = await conn.query(
    `SELECT exchange_number, DATE_FORMAT(created_at, '%Y-%m-%d') AS d FROM ${EXCHANGE_TABLE}
      WHERE original_invoice_id = ? AND company_id = ? ORDER BY id`,
    [inv.id, companyId]
  );
  return {
    invoice: {
      id: Number(inv.id), invoice_number: inv.invoice_number, invoice_date: ymdOf(inv.invoice_date), status: inv.status,
      grand_total: Number(inv.grand_total), customer_id: Number(inv.customer_id), customer_name: inv.customer_name,
      customer_phone: inv.customer_phone, customer_code: inv.customer_code,
    },
    items: (items as Record<string, unknown>[]).map((it) => {
      const q = Number(it.quantity);
      const returned = back.get(Number(it.id)) || 0;
      return {
        id: Number(it.id), product_id: it.product_id ? Number(it.product_id) : null, description: it.description, sku: it.sku,
        quantity: q, returned, returnable: Math.max(0, q - returned),
        /* what the customer actually paid per unit (after line discount, incl. tax) */
        paid_unit_price: r2(Number(it.line_total) / (q || 1)),
      };
    }),
    warranty: { start: base, until: addDays(base, WARRANTY_DAYS), days_since_start: days, within: days <= WARRANTY_DAYS },
    exchanges: exs,
  };
}

export async function createExchange(conn: Conn, user: U, input: ExchangeInput) {
  const companyId = user.company_id;
  const [[orig]] = await conn.query(
    "SELECT * FROM invoices WHERE id = ? AND company_id = ? FOR UPDATE",
    [input.original_invoice_id, companyId]
  );
  if (!orig) throw new OpError("Original bill not found", 404);
  if (orig.status === "cancelled" || orig.status === "draft") throw new OpError("This bill is cancelled — it can't be exchanged", 409);

  /* returned units must come from this bill and not be returned already */
  const src = await loadExchangeSource(conn, companyId, Number(orig.id));
  if (!src) throw new OpError("Original bill not found", 404);
  const byItem = new Map(src.items.map((i) => [i.id, i]));
  const [costRows] = await conn.query(
    "SELECT id, unit_cost FROM invoice_items WHERE invoice_id = ?",
    [orig.id]
  );
  const origCost = new Map((costRows as { id: number; unit_cost: number | null }[]).map((r) => [Number(r.id), r.unit_cost === null ? null : Number(r.unit_cost)]));
  const wantBack = new Map<number, number>();
  for (const r of input.returned) {
    const it = byItem.get(r.item_id);
    if (!it) throw new OpError("A returned item is not on this bill");
    wantBack.set(r.item_id, (wantBack.get(r.item_id) || 0) + r.quantity);
    if ((wantBack.get(r.item_id) || 0) > it.returnable + 1e-9) {
      throw new OpError(`Only ${it.returnable} of "${it.description}" can still be returned`);
    }
    if (r.credit_price > it.paid_unit_price + 0.009) {
      throw new OpError(`Return value of "${it.description}" can't be more than the customer paid (${it.paid_unit_price})`);
    }
  }

  /* given units: products of this company with enough stock */
  const givenIds = Array.from(new Set(input.given.map((g) => g.product_id).filter(Boolean))) as number[];
  const prodInfo = new Map<number, { name: string; tracked: boolean; stock: number }>();
  if (givenIds.length) {
    await conn.query("SELECT id FROM products WHERE company_id = ? AND id IN (?) FOR UPDATE", [companyId, givenIds]);
    const [pr] = await conn.query(
      `SELECT p.id, p.name, COALESCE(p.track_inventory, 1) AS ti, COALESCE(p.product_type, 'product') AS pt, ${STOCK_SQL} AS stock
         FROM products p WHERE p.company_id = ? AND p.id IN (?)`,
      [companyId, givenIds]
    );
    for (const p of pr as { id: number; name: string; ti: number; pt: string; stock: number }[]) {
      prodInfo.set(Number(p.id), { name: p.name, tracked: Number(p.ti) === 1 && p.pt === "product", stock: Number(p.stock) || 0 });
    }
    if (prodInfo.size !== givenIds.length) throw new OpError("A selected product was not found");
    for (const pid of givenIds) {
      const info = prodInfo.get(pid)!;
      if (!info.tracked) continue;
      const need = input.given.filter((g) => g.product_id === pid).reduce((a, g) => a + g.quantity, 0);
      const comingBack = input.returned
        .filter((r) => byItem.get(r.item_id)?.product_id === pid)
        .reduce((a, r) => a + r.quantity, 0);
      if (need > info.stock + comingBack + 1e-9) {
        throw new OpError(`Not enough stock of "${info.name}" (available ${info.stock})`, 409);
      }
    }
  }

  /* lines: returned (negative) + given */
  type Line = { product_id: number | null; description: string; quantity: number; unit_price: number; total: number; unit_cost: number | null; serial: string | null; condition: string | null; dir: "in" | "out"; original_item_id: number | null };
  const lines: Line[] = [];
  for (const r of input.returned) {
    const it = byItem.get(r.item_id)!;
    lines.push({
      product_id: it.product_id, original_item_id: it.id, dir: "in",
      description: `RETURNED (from ${orig.invoice_number}): ${it.description}${r.serial ? ` · S/N ${r.serial}` : ""}`.slice(0, 255),
      quantity: -r.quantity, unit_price: r.credit_price, total: r2(-r.quantity * r.credit_price),
      unit_cost: origCost.get(it.id) ?? null, serial: r.serial, condition: r.condition,
    });
  }
  const nowCost = await currentCosts(conn, companyId, givenIds);
  for (const g of input.given) {
    const name = g.product_id ? prodInfo.get(g.product_id)?.name || g.description : g.description;
    const desc = (g.description || name) + (g.serial ? ` · S/N ${g.serial}` : "");
    lines.push({
      product_id: g.product_id, original_item_id: null, dir: "out", description: desc.slice(0, 255),
      quantity: g.quantity, unit_price: g.unit_price, total: r2(g.quantity * g.unit_price),
      unit_cost: g.product_id ? nowCost.get(g.product_id) ?? null : null, serial: g.serial, condition: null,
    });
  }
  const returnedValue = r2(-lines.filter((l) => l.dir === "in").reduce((a, l) => a + l.total, 0));
  const givenValue = r2(lines.filter((l) => l.dir === "out").reduce((a, l) => a + l.total, 0));
  const diff = r2(givenValue - returnedValue);
  if (diff > 0 && input.payment.amount > diff + 0.009) throw new OpError("Payment is more than the difference");

  /* the exchange bill */
  const number = await lockedSeqNumber(conn, "invoices", "invoice_number", "TX-EXC", companyId);
  const today = todayPKT();
  const notes = `Exchange of ${orig.invoice_number}. Reason: ${input.reason}${input.warranty_claim ? " (warranty claim)" : ""}`.slice(0, 1000);
  const [ins] = await conn.query(
    `INSERT INTO invoices
       (company_id, branch_id, invoice_number, customer_id, sales_order_id, invoice_date, due_date, status,
        subtotal, tax_total, discount_total, shipping_total, grand_total, paid_amount, balance, notes, terms, created_by)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, 'unpaid', ?, 0, 0, 0, ?, 0, ?, ?, NULL, ?)`,
    [companyId, user.branch_id ?? null, number, orig.customer_id, today, diff, diff, Math.max(0, diff), notes, user.id]
  );
  const excId = (ins as { insertId: number }).insertId;
  for (const l of lines) {
    await conn.query(
      `INSERT INTO invoice_items
         (invoice_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
          line_subtotal, line_tax, line_discount, line_total, unit_cost)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, ?)`,
      [excId, l.product_id, l.description, l.quantity, l.unit_price, l.total, l.total, l.unit_cost]
    );
  }

  /* stock: returned unit in, given unit out (one history line each) */
  const trackedIds = new Set<number>();
  const allIds = Array.from(new Set(lines.map((l) => l.product_id).filter(Boolean))) as number[];
  if (allIds.length) {
    const [tr] = await conn.query(
      `SELECT id FROM products WHERE company_id = ? AND id IN (?)
          AND COALESCE(track_inventory, 1) = 1 AND COALESCE(product_type, 'product') = 'product'`,
      [companyId, allIds]
    );
    for (const t of tr as { id: number }[]) trackedIds.add(Number(t.id));
  }
  for (const l of lines) {
    if (!l.product_id || !trackedIds.has(l.product_id)) continue;
    await conn.query(
      `INSERT INTO ${STOCK_TABLE} (company_id, product_id, qty, move_type, ref_type, ref_id, ref_number, note, created_by)
       VALUES (?, ?, ?, ?, 'invoice', ?, ?, ?, ?)`,
      [companyId, l.product_id, -l.quantity, l.dir === "in" ? "exchange_in" : "exchange_out", excId, number,
       [l.dir === "in" ? "Returned in exchange" : "Given in exchange", l.serial ? `S/N ${l.serial}` : null, l.condition].filter(Boolean).join(" · ").slice(0, 255),
       user.id]
    );
  }

  /* money for the difference */
  let paidNow = 0;
  let refunded = 0;
  if (diff > 0 && input.payment.amount > 0) {
    await addCustomerPayment(conn, user, {
      customer_id: Number(orig.customer_id), invoice_id: excId, amount: input.payment.amount,
      method: String(input.payment.method), reference: input.payment.reference, payment_date: today,
      notes: `Exchange ${number} difference`,
    });
    paidNow = input.payment.amount;
  }
  if (diff < 0 && input.refund_mode === "refund") {
    await addRefund(conn, user, {
      customer_id: Number(orig.customer_id), invoice_id: excId, amount: -diff, method: String(input.refund_method),
      reference: input.refund_reference, reason: `Exchange ${number}: ${input.reason}`, source: "exchange", source_id: excId,
    });
    refunded = -diff;
  }
  const settlement =
    diff === 0 ? "even" : diff > 0 ? (paidNow >= diff ? "paid" : paidNow > 0 ? "partly_paid" : "credit_due") : refunded ? "refunded" : "credit";

  /* warranty record */
  const base = await warrantyBase(conn, orig);
  const days = Math.round((Date.parse(today) - Date.parse(base)) / 86400000);
  const wStart = input.warranty_start === "fresh" ? today : base;
  const [exRes] = await conn.query(
    `INSERT INTO ${EXCHANGE_TABLE}
       (company_id, exchange_number, exchange_invoice_id, original_invoice_id, customer_id, returned_value, given_value,
        difference, settlement, paid_now, refunded, reason, warranty_claim, original_sale_date, days_after_sale,
        within_warranty, warranty_start, warranty_until, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, number, excId, orig.id, orig.customer_id, returnedValue, givenValue, diff, settlement, paidNow, refunded,
     input.reason, input.warranty_claim ? 1 : 0, base, days, days <= WARRANTY_DAYS ? 1 : 0, wStart, addDays(wStart, WARRANTY_DAYS), user.id]
  );
  const exchangeId = (exRes as { insertId: number }).insertId;
  for (const l of lines) {
    await conn.query(
      `INSERT INTO ${EXCHANGE_ITEM_TABLE}
         (exchange_id, company_id, direction, original_item_id, product_id, description, quantity, unit_price, unit_cost, serial, item_condition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [exchangeId, companyId, l.dir, l.original_item_id, l.product_id, l.description, Math.abs(l.quantity), l.unit_price, l.unit_cost, l.serial, l.condition]
    );
  }
  await upsertMeta(conn, excId, companyId, { delivery_mode: "counter", delivered_at: nowPKTSql() });
  await recalcInvoice(conn, excId, companyId);
  return {
    exchange_id: exchangeId, exchange_number: number, invoice_id: excId,
    returned_value: returnedValue, given_value: givenValue, difference: diff, settlement, paid_now: paidNow, refunded,
    warranty_start: wStart, warranty_until: addDays(wStart, WARRANTY_DAYS), days_after_sale: days,
  };
}

/* Exchanges of a customer (or of one bill) with their items */
export async function listExchanges(conn: Conn, companyId: number, where: { customer_id?: number; invoice_id?: number }) {
  const w: string[] = ["e.company_id = ?"];
  const p: unknown[] = [companyId];
  if (where.customer_id) { w.push("e.customer_id = ?"); p.push(where.customer_id); }
  if (where.invoice_id) { w.push("(e.original_invoice_id = ? OR e.exchange_invoice_id = ?)"); p.push(where.invoice_id, where.invoice_id); }
  const [rows] = await conn.query(
    `SELECT e.*, DATE_FORMAT(e.original_sale_date, '%Y-%m-%d') AS original_sale_day,
            DATE_FORMAT(e.warranty_start, '%Y-%m-%d') AS warranty_start_day,
            DATE_FORMAT(e.warranty_until, '%Y-%m-%d') AS warranty_until_day,
            o.invoice_number AS original_number, u.name AS created_by_name
       FROM ${EXCHANGE_TABLE} e
       LEFT JOIN invoices o ON o.id = e.original_invoice_id
       LEFT JOIN users u ON u.id = e.created_by
      WHERE ${w.join(" AND ")} ORDER BY e.id DESC LIMIT 200`,
    p
  );
  const list = rows as Record<string, unknown>[];
  if (!list.length) return [];
  const [items] = await conn.query(
    `SELECT exchange_id, direction, description, quantity, unit_price, serial, item_condition
       FROM ${EXCHANGE_ITEM_TABLE} WHERE exchange_id IN (?) ORDER BY id`,
    [list.map((r) => r.id)]
  );
  const by = new Map<number, unknown[]>();
  for (const it of items as { exchange_id: number }[]) {
    if (!by.has(it.exchange_id)) by.set(it.exchange_id, []);
    by.get(it.exchange_id)!.push(it);
  }
  return list.map((r) => ({ ...r, items: by.get(Number(r.id)) || [] }));
}
