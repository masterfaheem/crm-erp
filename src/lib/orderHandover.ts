import { getPool } from "@/lib/db";
import { addCustomerPayment, recalcCustomer, recalcInvoice, nextDocNumber } from "@/lib/ledger";

/* ============================================================
   LEAD -> CUSTOMER -> SALES ORDER -> POS INVOICE
   Handover table links a won lead to its customer, sales order,
   invoice and dispatch status. Created automatically on first use.
============================================================ */
export const HANDOVER_TABLE = "crm_order_handovers";

let ensured = false;
export async function ensureHandoverTable(): Promise<void> {
  if (ensured) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${HANDOVER_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      lead_id INT UNSIGNED NOT NULL,
      customer_id INT UNSIGNED NOT NULL,
      sales_order_id INT UNSIGNED NOT NULL,
      invoice_id INT UNSIGNED NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      advance_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      advance_method VARCHAR(30) NULL,
      advance_reference VARCHAR(100) NULL,
      cod_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      specs_note VARCHAR(1000) NULL,
      delivery_name VARCHAR(120) NULL,
      delivery_phone VARCHAR(40) NULL,
      delivery_phone2 VARCHAR(40) NULL,
      delivery_house VARCHAR(100) NULL,
      delivery_street VARCHAR(150) NULL,
      delivery_area VARCHAR(150) NULL,
      delivery_landmark VARCHAR(200) NULL,
      delivery_city VARCHAR(100) NULL,
      dispatch_date DATE NULL,
      dispatch_notes VARCHAR(1000) NULL,
      courier VARCHAR(60) NULL,
      tracking_no VARCHAR(100) NULL,
      shipped_at DATETIME NULL,
      delivered_at DATETIME NULL,
      review_rating TINYINT NULL,
      review_comment VARCHAR(1000) NULL,
      review_at DATETIME NULL,
      payment_id INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead (lead_id),
      UNIQUE KEY uq_sales_order (sales_order_id),
      KEY idx_company_status (company_id, status),
      KEY idx_customer (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // columns added later (auto-added if missing)
  const [cols] = await getPool().query(`SHOW COLUMNS FROM ${HANDOVER_TABLE}`);
  const have = new Set((cols as { Field: string }[]).map((c) => c.Field));
  const extra: [string, string][] = [
    ["shipped_at", "DATETIME NULL"],
    ["delivered_at", "DATETIME NULL"],
    ["review_rating", "TINYINT NULL"],
    ["review_comment", "VARCHAR(1000) NULL"],
    ["review_at", "DATETIME NULL"],
    ["payment_id", "INT UNSIGNED NULL"],
  ];
  const missing = extra.filter(([c]) => !have.has(c));
  if (missing.length) {
    await getPool().query(
      `ALTER TABLE ${HANDOVER_TABLE} ${missing.map(([c, d]) => `ADD COLUMN ${c} ${d}`).join(", ")}`
    );
  }
  // one-time: payments taken before billing used to live only on the handover —
  // record them as real customer payments so khata / reports include them
  try {
    const [old] = await getPool().query(
      `SELECT h.*, so.order_number FROM ${HANDOVER_TABLE} h JOIN sales_orders so ON so.id = h.sales_order_id
        WHERE h.payment_id IS NULL AND h.advance_amount > 0`
    );
    for (const h of old as Record<string, unknown>[]) {
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        const pid = await addCustomerPayment(
          conn,
          { id: Number(h.created_by) || 0, company_id: Number(h.company_id), branch_id: null },
          {
            customer_id: Number(h.customer_id),
            invoice_id: h.invoice_id ? Number(h.invoice_id) : null,
            amount: Number(h.advance_amount),
            method: String(h.advance_method || "bank_transfer"),
            reference: (h.advance_reference as string) || null,
            payment_date: new Date(new Date(String(h.created_at)).getTime() + 5 * 3600000).toISOString().slice(0, 10),
            notes: `Payment for ${h.order_number}`,
          }
        );
        await conn.query(`UPDATE ${HANDOVER_TABLE} SET payment_id = ? WHERE id = ?`, [pid, h.id]);
        if (h.invoice_id) await recalcInvoice(conn, Number(h.invoice_id), Number(h.company_id));
        else await recalcCustomer(conn, Number(h.company_id), Number(h.customer_id));
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        console.error("handover payment backfill failed", e);
      } finally {
        conn.release();
      }
    }
  } catch {
    /* customer_payments not available */
  }
  ensured = true;
}

/* pending -> invoiced -> shipped -> delivered -> completed (review taken)  (or cancelled) */
export const DISPATCH_STATUSES = ["pending", "invoiced", "shipped", "delivered", "completed", "cancelled"];
/* matching sales_orders.status */
export const SO_STATUS_FOR: Record<string, string> = {
  pending: "confirmed",
  invoiced: "processing",
  shipped: "shipped",
  delivered: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
};

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "JazzCash / Easypaisa" },
  { value: "card", label: "Card (POS machine)" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "none", label: "Not paid yet" },
];

/* ---------------- phone matching ---------------- */
export function phoneKeyOf(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

const NORM = (col: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(${col},''),' ',''),'-',''),'+',''),'(',''),')','')`;

/* SQL condition: any of `cols` ends with any of the phone keys */
export function phoneMatchSql(cols: string[], keys: string[]) {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const k of keys) {
    for (const c of cols) {
      parts.push(`(CHAR_LENGTH(${NORM(c)}) >= ? AND RIGHT(${NORM(c)}, ?) = ?)`);
      params.push(k.length, k.length, k);
    }
  }
  return { sql: parts.length ? `(${parts.join(" OR ")})` : "(1=0)", params };
}

export function uniqueKeys(...phones: unknown[]): string[] {
  return Array.from(
    new Set(phones.map(phoneKeyOf).filter((k) => k.length >= 7))
  );
}

/* Find an existing customer by any of the given phone numbers */
export async function findCustomerByPhones(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any,
  companyId: number,
  phones: unknown[]
): Promise<{ id: number; customer_code: string; name: string; phone: string | null; whatsapp: string | null; city: string | null } | null> {
  const keys = uniqueKeys(...phones);
  if (!keys.length) return null;
  const m = phoneMatchSql(["phone", "whatsapp", "alternate_phone"], keys);
  const [rows] = await conn.query(
    `SELECT id, customer_code, name, phone, whatsapp, city
       FROM customers
      WHERE company_id = ? AND ${m.sql}
      ORDER BY id ASC LIMIT 1`,
    [companyId, ...m.params]
  );
  const arr = rows as { id: number; customer_code: string; name: string; phone: string | null; whatsapp: string | null; city: string | null }[];
  return arr.length ? arr[0] : null;
}

/* ---------------- customer creation ---------------- */
async function nextCustomerCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any,
  companyId: number
): Promise<string> {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM customers WHERE company_id = ?`,
    [companyId]
  );
  let n = Number((rows as { cnt: number }[])[0]?.cnt || 0) + 1;
  // make sure the code is not already taken (e.g. after deletions)
  for (let i = 0; i < 50; i++) {
    const code = `CUST-${String(n).padStart(4, "0")}`;
    const [dup] = await conn.query(
      `SELECT id FROM customers WHERE company_id = ? AND customer_code = ? LIMIT 1`,
      [companyId, code]
    );
    if (!(dup as unknown[]).length) return code;
    n++;
  }
  return `CUST-${Date.now()}`;
}

/* lead source / profession -> customers table values */
const SOURCE_MAP: Record<string, { source: string; ad?: string }> = {
  facebook: { source: "fb_page_techno_x" },
  facebook_ad: { source: "ad", ad: "facebook" },
  instagram: { source: "instagram_tx" },
  reference: { source: "reference_someone" },
  word_of_mouth: { source: "wom" },
  repeat: { source: "repeat" },
  mf_follower: { source: "follower_sir_faheem" },
  ads_1: { source: "ad" },
  ads_2: { source: "ad" },
  ads_3: { source: "ad" },
};
const PROFESSION_MAP: Record<string, string> = {
  student: "student",
  freelancer: "freelancer",
  businessman: "local_business",
};

export function formatAddress(d: {
  delivery_house?: unknown; delivery_street?: unknown; delivery_area?: unknown;
  delivery_landmark?: unknown; delivery_city?: unknown;
}): string {
  return [
    d.delivery_house,
    d.delivery_street,
    d.delivery_area,
    d.delivery_landmark
      ? /^near\b/i.test(String(d.delivery_landmark).trim())
        ? d.delivery_landmark
        : `Near ${d.delivery_landmark}`
      : null,
    d.delivery_city,
  ]
    .map((x) => (x === null || x === undefined ? "" : String(x).trim()))
    .filter(Boolean)
    .join(", ");
}

export async function createCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any,
  user: { id: number; company_id: number; branch_id: number | null },
  c: {
    name: string;
    phone?: string | null;
    whatsapp?: string | null;
    alternate_phone?: string | null;
    city?: string | null;
    address?: string | null;
    lead_source?: string | null;
    profession?: string | null;
    profession_other?: string | null;
    notes?: string | null;
  }
): Promise<{ id: number; customer_code: string }> {
  const code = await nextCustomerCode(conn, user.company_id);
  const src = c.lead_source ? SOURCE_MAP[c.lead_source] : undefined;
  const prof = c.profession ? PROFESSION_MAP[c.profession] || "other" : null;
  const profOther =
    prof === "other"
      ? c.profession === "other"
        ? c.profession_other || null
        : c.profession === "job_holder"
        ? "Job Holder"
        : c.profession === "teacher"
        ? "Teacher"
        : c.profession_other || null
      : null;

  const [res] = await conn.query(
    `INSERT INTO customers
       (company_id, branch_id, customer_code, customer_type, name,
        phone, alternate_phone, whatsapp, billing_address, shipping_address,
        city, country, credit_limit, credit_days, opening_balance, balance_type,
        current_balance, currency_code, tax_exempt, default_tax_rate, status, notes,
        source, source_ad_platform, profession, profession_other, created_by, updated_by)
     VALUES (?, ?, ?, 'individual', ?, ?, ?, ?, ?, ?, ?, 'Pakistan', 0, 0, 0, 'debit',
             0, 'PKR', 0, 0, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.company_id,
      user.branch_id ?? null,
      code,
      c.name,
      c.phone || null,
      c.alternate_phone || null,
      c.whatsapp || null,
      c.address || null,
      c.address || null,
      c.city || null,
      c.notes || null,
      src?.source ?? (c.lead_source ? "other" : null),
      src?.ad ?? null,
      prof,
      profOther,
      user.id,
      user.id,
    ]
  );
  return { id: (res as { insertId: number }).insertId, customer_code: code };
}

/* ---------------- sales order number ---------------- */
export async function nextSalesOrderNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any,
  companyId: number
): Promise<string> {
  return nextDocNumber("sales_orders", "order_number", "SO", companyId, conn);
}

/* Full handover row for dispatch / POS views */
export const HANDOVER_SELECT = `
  SELECT h.*,
         DATE_FORMAT(h.dispatch_date, '%Y-%m-%d') AS dispatch_day,
         DATE_FORMAT(h.shipped_at, '%Y-%m-%d %H:%i') AS shipped_on,
         DATE_FORMAT(h.delivered_at, '%Y-%m-%d %H:%i') AS delivered_on,
         so.order_number, so.status AS so_status, so.grand_total AS so_total, so.order_date,
         c.customer_code, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
         l.lead_number, l.first_name AS lead_first_name, l.last_name AS lead_last_name,
         l.requirement_note, l.source AS lead_source,
         i.invoice_number, i.grand_total AS bill_total,
         COALESCE(i.paid_amount, h.advance_amount) AS paid_total,
         CASE WHEN i.id IS NULL THEN h.cod_amount ELSE i.balance END AS balance_due,
         u.name AS created_by_name
    FROM ${HANDOVER_TABLE} h
    JOIN sales_orders so ON so.id = h.sales_order_id
    LEFT JOIN customers c ON c.id = h.customer_id
    LEFT JOIN crm_leads l ON l.id = h.lead_id
    LEFT JOIN invoices i ON i.id = h.invoice_id
    LEFT JOIN users u ON u.id = h.created_by
`;

export async function loadOrderItems(salesOrderIds: number[]) {
  if (!salesOrderIds.length) return new Map<number, unknown[]>();
  const [rows] = await getPool().query(
    `SELECT soi.sales_order_id, soi.product_id, soi.description, soi.quantity,
            soi.unit_price, soi.tax_rate, soi.discount_percent, soi.line_total,
            p.name AS product_name, p.sku
       FROM sales_order_items soi
       LEFT JOIN products p ON p.id = soi.product_id
      WHERE soi.sales_order_id IN (?)
      ORDER BY soi.id ASC`,
    [salesOrderIds]
  );
  const map = new Map<number, unknown[]>();
  for (const r of rows as { sales_order_id: number }[]) {
    if (!map.has(r.sales_order_id)) map.set(r.sales_order_id, []);
    map.get(r.sales_order_id)!.push(r);
  }
  return map;
}
