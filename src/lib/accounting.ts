import crypto from "crypto";
import { getPool } from "@/lib/db";
import { REFUND_TABLE, STOCK_TABLE } from "@/lib/ledger";
import { INVOICE_META_TABLE, ensureSalesOpsTables } from "@/lib/salesOps";
import { lockedSeqNumber } from "@/lib/posSale";
import { isExchangeNo } from "@/lib/format";

/* ============================================================
   ACCOUNTING — double-entry general ledger
   Auto entries are DERIVED from the real business documents
   (bills, payments, refunds, exchanges, purchase bills, supplier
   payments, stock adjustments, opening balances) and re-synced
   whenever accounting is opened, so the books always match the
   CRM. A cancelled bill keeps its sale entry + gets a reversal.
   Manual entries (expenses, capital, corrections) are kept as typed.
   Tables are created automatically; nothing existing is touched.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;
type Row = Record<string, unknown>;

export const ACC_TABLE = "crm_accounts";
export const JE_TABLE = "crm_journal_entries";
export const JL_TABLE = "crm_journal_lines";

export type AccType = "asset" | "liability" | "equity" | "income" | "expense";
export const ACC_TYPES: AccType[] = ["asset", "liability", "equity", "income", "expense"];

/* [code, name, type, subtype, system key] */
const DEFAULT_ACCOUNTS: [string, string, AccType, string, string | null][] = [
  ["1000", "Cash in Hand", "asset", "cash", "cash"],
  ["1010", "Bank Account", "asset", "bank", "bank"],
  ["1020", "JazzCash / Easypaisa", "asset", "wallet", "wallet"],
  ["1090", "Other Receipts (unclassified)", "asset", "cash", "other_money"],
  ["1100", "Accounts Receivable - Customers", "asset", "receivable", "ar"],
  ["1200", "Inventory (Stock)", "asset", "inventory", "inventory"],
  ["2000", "Accounts Payable - Suppliers", "liability", "payable", "ap"],
  ["2100", "Sales Tax Payable", "liability", "tax", "tax_payable"],
  ["3000", "Owner's Capital", "equity", "equity", "capital"],
  ["3100", "Opening Balance Equity", "equity", "equity", "opening_equity"],
  ["3200", "Owner's Drawings", "equity", "equity", "drawings"],
  ["4000", "Sales Revenue", "income", "revenue", "sales"],
  ["4010", "Delivery Charges Income", "income", "revenue", "delivery_income"],
  ["4100", "Sales Returns & Exchanges", "income", "contra_revenue", "sales_returns"],
  ["4200", "Discounts Given", "income", "contra_revenue", "discounts"],
  ["4900", "Other Income", "income", "other_income", null],
  ["5000", "Cost of Goods Sold", "expense", "cogs", "cogs"],
  ["5100", "Stock Adjustments (Damage / Shortage)", "expense", "expense", "stock_adjust"],
  ["6000", "Shop Rent", "expense", "expense", null],
  ["6010", "Salaries & Wages", "expense", "expense", null],
  ["6020", "Electricity, Internet & Utilities", "expense", "expense", null],
  ["6030", "Marketing & Ads", "expense", "expense", null],
  ["6040", "Courier & Delivery Charges", "expense", "expense", null],
  ["6050", "Bank & Card Charges", "expense", "expense", null],
  ["6060", "Repairs & Parts", "expense", "expense", null],
  ["6090", "Other Expenses", "expense", "expense", null],
  ["9999", "Suspense / Unbalanced Difference", "liability", "suspense", "suspense"],
];

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/* ---------------- tables ---------------- */
let tablesReady = false;
export async function ensureAccountingTables(): Promise<void> {
  if (tablesReady) return;
  await ensureSalesOpsTables();
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${ACC_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(150) NOT NULL,
      type VARCHAR(20) NOT NULL,
      subtype VARCHAR(30) NULL,
      system_key VARCHAR(40) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_code (company_id, code),
      UNIQUE KEY uq_key (company_id, system_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${JE_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      entry_number VARCHAR(40) NULL,
      entry_date DATE NOT NULL,
      source_type VARCHAR(30) NOT NULL,
      source_id INT UNSIGNED NULL,
      source_ref VARCHAR(60) NULL,
      memo VARCHAR(500) NULL,
      is_auto TINYINT(1) NOT NULL DEFAULT 1,
      signature CHAR(40) NULL,
      reversed_by INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_source (company_id, source_type, source_id),
      KEY idx_date (company_id, entry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${JL_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      entry_id INT UNSIGNED NOT NULL,
      company_id INT UNSIGNED NOT NULL,
      account_id INT UNSIGNED NOT NULL,
      debit DECIMAL(16,2) NOT NULL DEFAULT 0,
      credit DECIMAL(16,2) NOT NULL DEFAULT 0,
      party_type VARCHAR(20) NULL,
      party_id INT UNSIGNED NULL,
      description VARCHAR(255) NULL,
      KEY idx_entry (entry_id),
      KEY idx_account (company_id, account_id),
      KEY idx_party (company_id, party_type, party_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablesReady = true;
}

const accountsReady = new Set<number>();
export async function ensureDefaultAccounts(companyId: number): Promise<void> {
  await ensureAccountingTables();
  if (accountsReady.has(companyId)) return;
  const pool = getPool();
  const [rows] = await pool.query(`SELECT code, system_key FROM ${ACC_TABLE} WHERE company_id = ?`, [companyId]);
  const codes = new Set((rows as Row[]).map((r) => String(r.code)));
  const keys = new Set((rows as Row[]).map((r) => r.system_key).filter(Boolean).map(String));
  for (const [code, name, type, subtype, key] of DEFAULT_ACCOUNTS) {
    if (key ? keys.has(key) : codes.has(code)) continue;
    let c = code;
    for (let i = 1; codes.has(c) && i < 50; i++) c = `${code}-${i}`; // code taken by a user account
    await pool.query(
      `INSERT IGNORE INTO ${ACC_TABLE} (company_id, code, name, type, subtype, system_key) VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, c, name, type, subtype, key]
    );
    codes.add(c);
  }
  accountsReady.add(companyId);
}

export async function accountKeyMap(conn: Conn, companyId: number): Promise<Map<string, number>> {
  const [rows] = await conn.query(
    `SELECT id, system_key FROM ${ACC_TABLE} WHERE company_id = ? AND system_key IS NOT NULL`,
    [companyId]
  );
  return new Map((rows as Row[]).map((r) => [String(r.system_key), Number(r.id)]));
}

/* where money came in / went out, from the payment method */
export function moneyKey(method: unknown, reference?: unknown): string {
  const m = String(method || "").toLowerCase();
  const ref = String(reference || "").toLowerCase();
  if (m === "cash") return "cash";
  if (["bank_transfer", "bank", "cheque", "card", "online_transfer", "ibft", "pos"].includes(m)) return "bank";
  if (["wallet", "jazzcash", "easypaisa", "mobile_wallet"].includes(m)) return "wallet";
  if (m === "online") return ref.includes("bank") ? "bank" : "wallet";
  return "other_money";
}

/* ---------------- draft entries from documents ---------------- */
type DLine = { key: string; debit: number; credit: number; party_type?: "customer" | "supplier" | null; party_id?: number | null; description?: string | null };
type Draft = { source_type: string; source_id: number; source_ref: string; entry_date: string; memo: string; lines: DLine[] };
export type SyncInfo = {
  entries: number; inserted: number; updated: number; removed: number;
  cost_estimated_lines: number; cost_missing_lines: number; unvalued_adjustments: number;
  unbalanced: { ref: string; diff: number }[]; skipped: string[]; at: string;
};

const D = (key: string, amt: number, extra: Partial<DLine> = {}): DLine => ({ key, debit: r2(amt), credit: 0, ...extra });
const C = (key: string, amt: number, extra: Partial<DLine> = {}): DLine => ({ key, debit: 0, credit: r2(amt), ...extra });
/* a signed amount: positive -> debit, negative -> credit */
const S = (key: string, amt: number, extra: Partial<DLine> = {}): DLine => (amt >= 0 ? D(key, amt, extra) : C(key, -amt, extra));

function isMissingTable(e: unknown) {
  const c = (e as { code?: string })?.code;
  return c === "ER_NO_SUCH_TABLE" || c === "ER_BAD_FIELD_ERROR";
}

async function invoiceDrafts(conn: Conn, cid: number, info: SyncInfo): Promise<Draft[]> {
  const [invs] = await conn.query(
    `SELECT i.id, i.invoice_number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS d, i.status, i.customer_id,
            i.subtotal, i.tax_total, i.discount_total, i.shipping_total, i.grand_total,
            DATE_FORMAT(m.cancelled_at, '%Y-%m-%d') AS cd, m.cancel_reason
       FROM invoices i LEFT JOIN ${INVOICE_META_TABLE} m ON m.invoice_id = i.id
      WHERE i.company_id = ? AND i.status <> 'draft' AND i.invoice_date IS NOT NULL`,
    [cid]
  );
  const [items] = await conn.query(
    `SELECT ii.invoice_id, ii.product_id, ii.description, ii.quantity, ii.line_subtotal, ii.unit_cost,
            p.purchase_price, COALESCE(p.track_inventory, 1) AS ti, COALESCE(p.product_type, 'product') AS pt
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       LEFT JOIN products p ON p.id = ii.product_id
      WHERE i.company_id = ? AND i.status <> 'draft'`,
    [cid]
  );
  const byInv = new Map<number, Row[]>();
  for (const it of items as Row[]) {
    const k = Number(it.invoice_id);
    if (!byInv.has(k)) byInv.set(k, []);
    byInv.get(k)!.push(it);
  }
  const out: Draft[] = [];
  for (const inv of invs as Row[]) {
    const id = Number(inv.id);
    const cust = { party_type: "customer" as const, party_id: Number(inv.customer_id) || null };
    const its = byInv.get(id) || [];
    const pos = its.reduce((a, it) => a + Math.max(0, Number(it.line_subtotal) || 0), 0);
    const neg = its.reduce((a, it) => a + Math.max(0, -(Number(it.line_subtotal) || 0)), 0);
    const lines: DLine[] = [
      S("ar", Number(inv.grand_total) || 0, cust),
      C("sales", pos),
      D("sales_returns", neg),
      S("discounts", Number(inv.discount_total) || 0),
      C("tax_payable", Number(inv.tax_total) || 0),
      C("delivery_income", Number(inv.shipping_total) || 0),
    ];
    /* old bills whose saved totals don't add up exactly: difference goes to sales */
    const diff = r2(lines.reduce((a, l) => a + l.debit - l.credit, 0));
    if (Math.abs(diff) >= 0.01) {
      lines.push(diff > 0 ? C("sales", diff, { description: "rounding / old-bill difference" }) : D("sales", -diff, { description: "rounding / old-bill difference" }));
      if (Math.abs(diff) > 1) info.unbalanced.push({ ref: String(inv.invoice_number), diff });
    }
    /* cost of goods: cost saved on the bill; old bills use today's product cost (estimated) */
    for (const it of its) {
      if (!it.product_id || it.pt !== "product" || Number(it.ti) !== 1) continue;
      const q = Number(it.quantity) || 0;
      if (!q) continue;
      let cost: number | null = it.unit_cost === null || it.unit_cost === undefined ? null : Number(it.unit_cost);
      if (cost === null) {
        const pp = Number(it.purchase_price) || 0;
        if (pp > 0) {
          cost = pp;
          info.cost_estimated_lines++;
        } else {
          info.cost_missing_lines++;
          continue;
        }
      }
      const amt = r2(Math.abs(q) * cost);
      if (!amt) continue;
      const desc = String(it.description || "").slice(0, 200);
      if (q > 0) lines.push(D("cogs", amt, { description: desc }), C("inventory", amt, { description: desc }));
      else lines.push(D("inventory", amt, { description: `returned: ${desc}`.slice(0, 200) }), C("cogs", amt, { description: `returned: ${desc}`.slice(0, 200) }));
    }
    const num = String(inv.invoice_number);
    out.push({ source_type: "invoice", source_id: id, source_ref: num, entry_date: String(inv.d), memo: `${isExchangeNo(num) ? "Exchange bill" : "Sale bill"} ${num}`, lines });
    if (inv.status === "cancelled") {
      out.push({
        source_type: "invoice_cancel", source_id: id, source_ref: num,
        entry_date: String(inv.cd || inv.d),
        memo: `Cancelled ${num}${inv.cancel_reason ? ` — ${inv.cancel_reason}` : ""}`.slice(0, 500),
        lines: lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      });
    }
  }
  return out;
}

async function customerPaymentDrafts(conn: Conn, cid: number): Promise<Draft[]> {
  const [rows] = await conn.query(
    `SELECT cp.id, cp.payment_number, DATE_FORMAT(cp.payment_date, '%Y-%m-%d') AS d, cp.amount, cp.method, cp.reference,
            cp.customer_id, i.invoice_number
       FROM customer_payments cp LEFT JOIN invoices i ON i.id = cp.invoice_id
      WHERE cp.company_id = ? AND cp.status = 'cleared' AND cp.payment_date IS NOT NULL`,
    [cid]
  );
  return (rows as Row[])
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({
      source_type: "customer_payment", source_id: Number(r.id), source_ref: String(r.payment_number || `CP#${r.id}`),
      entry_date: String(r.d),
      memo: `Payment received${r.invoice_number ? ` for ${r.invoice_number}` : " (advance / khata)"}`,
      lines: [
        D(moneyKey(r.method, r.reference), Number(r.amount)),
        C("ar", Number(r.amount), { party_type: "customer", party_id: Number(r.customer_id) || null }),
      ],
    }));
}

async function refundDrafts(conn: Conn, cid: number): Promise<Draft[]> {
  const [rows] = await conn.query(
    `SELECT r.id, r.refund_number, DATE_FORMAT(r.refund_date, '%Y-%m-%d') AS d, r.amount, r.method, r.customer_id, i.invoice_number
       FROM ${REFUND_TABLE} r LEFT JOIN invoices i ON i.id = r.invoice_id WHERE r.company_id = ?`,
    [cid]
  );
  return (rows as Row[]).map((r) => ({
    source_type: "refund", source_id: Number(r.id), source_ref: String(r.refund_number), entry_date: String(r.d),
    memo: `Refund paid${r.invoice_number ? ` for ${r.invoice_number}` : ""}`,
    lines: [D("ar", Number(r.amount), { party_type: "customer", party_id: Number(r.customer_id) || null }), C(moneyKey(r.method), Number(r.amount))],
  }));
}

async function purchaseBillDrafts(conn: Conn, cid: number): Promise<Draft[]> {
  const [rows] = await conn.query(
    `SELECT id, bill_number, DATE_FORMAT(bill_date, '%Y-%m-%d') AS d, grand_total, supplier_id
       FROM purchase_bills WHERE company_id = ? AND status NOT IN ('draft', 'cancelled') AND bill_date IS NOT NULL`,
    [cid]
  );
  return (rows as Row[])
    .filter((r) => Number(r.grand_total) > 0)
    .map((r) => ({
      source_type: "purchase_bill", source_id: Number(r.id), source_ref: String(r.bill_number || `PB#${r.id}`), entry_date: String(r.d),
      memo: `Purchase bill ${r.bill_number || ""}`.trim(),
      lines: [D("inventory", Number(r.grand_total)), C("ap", Number(r.grand_total), { party_type: "supplier", party_id: Number(r.supplier_id) || null })],
    }));
}

async function supplierPaymentDrafts(conn: Conn, cid: number): Promise<Draft[]> {
  const [rows] = await conn.query(
    `SELECT id, payment_number, DATE_FORMAT(payment_date, '%Y-%m-%d') AS d, amount, payment_method, supplier_id
       FROM supplier_payments
      WHERE company_id = ? AND payment_date IS NOT NULL
        AND COALESCE(status, 'completed') NOT IN ('cancelled', 'failed', 'bounced', 'pending', 'void')`,
    [cid]
  );
  return (rows as Row[])
    .filter((r) => Number(r.amount) > 0)
    .map((r) => {
      const k = moneyKey(r.payment_method);
      return {
        source_type: "supplier_payment", source_id: Number(r.id), source_ref: String(r.payment_number || `SP#${r.id}`), entry_date: String(r.d),
        memo: "Payment to supplier",
        lines: [D("ap", Number(r.amount), { party_type: "supplier", party_id: Number(r.supplier_id) || null }), C(k === "other_money" ? "bank" : k, Number(r.amount))],
      };
    });
}

async function stockAdjustmentDrafts(conn: Conn, cid: number, info: SyncInfo): Promise<Draft[]> {
  const [rows] = await conn.query(
    `SELECT m.id, m.qty, m.note, DATE_FORMAT(m.created_at, '%Y-%m-%d') AS d, p.name, p.purchase_price
       FROM ${STOCK_TABLE} m JOIN products p ON p.id = m.product_id
      WHERE m.company_id = ? AND m.move_type = 'adjustment'`,
    [cid]
  );
  const out: Draft[] = [];
  for (const r of rows as Row[]) {
    const price = Number(r.purchase_price) || 0;
    const q = Number(r.qty) || 0;
    if (!q) continue;
    if (!(price > 0)) {
      info.unvalued_adjustments++;
      continue;
    }
    const amt = r2(Math.abs(q) * price);
    const desc = `${r.name}: ${q > 0 ? "+" : ""}${q} (${r.note || "adjustment"})`.slice(0, 200);
    out.push({
      source_type: "stock_adjustment", source_id: Number(r.id), source_ref: `ADJ#${r.id}`, entry_date: String(r.d),
      memo: `Stock adjustment — ${desc}`.slice(0, 500),
      lines: q > 0 ? [D("inventory", amt, { description: desc }), C("stock_adjust", amt, { description: desc })]
                   : [D("stock_adjust", amt, { description: desc }), C("inventory", amt, { description: desc })],
    });
  }
  return out;
}

async function openingDrafts(conn: Conn, cid: number): Promise<Draft[]> {
  const out: Draft[] = [];
  const [[st]] = await conn.query(
    `SELECT COALESCE(SUM(opening_stock * purchase_price), 0) AS v, DATE_FORMAT(MIN(created_at), '%Y-%m-%d') AS d
       FROM products WHERE company_id = ? AND opening_stock > 0 AND purchase_price > 0
        AND COALESCE(track_inventory, 1) = 1 AND COALESCE(product_type, 'product') = 'product'`,
    [cid]
  );
  if (Number(st?.v) > 0) {
    out.push({
      source_type: "opening_stock", source_id: 0, source_ref: "OPENING-STOCK", entry_date: String(st.d || "2026-01-01"),
      memo: "Opening stock (products' opening quantity × purchase price)",
      lines: [D("inventory", Number(st.v)), C("opening_equity", Number(st.v))],
    });
  }
  const [cs] = await conn.query(
    `SELECT id, name, opening_balance, balance_type, DATE_FORMAT(created_at, '%Y-%m-%d') AS d
       FROM customers WHERE company_id = ? AND opening_balance > 0`,
    [cid]
  );
  for (const c of cs as Row[]) {
    const amt = Number(c.opening_balance);
    const party = { party_type: "customer" as const, party_id: Number(c.id) };
    const owesUs = c.balance_type !== "credit";
    out.push({
      source_type: "customer_opening", source_id: Number(c.id), source_ref: `OPEN-C${c.id}`, entry_date: String(c.d || "2026-01-01"),
      memo: `Opening balance — ${c.name}`,
      lines: owesUs ? [D("ar", amt, party), C("opening_equity", amt)] : [D("opening_equity", amt), C("ar", amt, party)],
    });
  }
  try {
    const [ss] = await conn.query(
      `SELECT id, name, opening_balance, balance_type, DATE_FORMAT(created_at, '%Y-%m-%d') AS d
         FROM suppliers WHERE company_id = ? AND opening_balance > 0`,
      [cid]
    );
    for (const s of ss as Row[]) {
      const amt = Number(s.opening_balance);
      const party = { party_type: "supplier" as const, party_id: Number(s.id) };
      const weOwe = s.balance_type !== "debit";
      out.push({
        source_type: "supplier_opening", source_id: Number(s.id), source_ref: `OPEN-S${s.id}`, entry_date: String(s.d || "2026-01-01"),
        memo: `Opening balance — ${s.name}`,
        lines: weOwe ? [D("opening_equity", amt), C("ap", amt, party)] : [D("ap", amt, party), C("opening_equity", amt)],
      });
    }
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  return out;
}

/* ---------------- sync ---------------- */
const lastSync = new Map<number, { at: number; info: SyncInfo }>();
const SYNC_EVERY_MS = 20_000;

function signature(d: Draft, lines: { account_id: number; debit: number; credit: number; party_type: string | null; party_id: number | null; description: string | null }[]) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([d.entry_date, d.memo, d.source_ref, lines]))
    .digest("hex");
}

export async function syncJournal(companyId: number, force = false): Promise<SyncInfo> {
  const hit = lastSync.get(companyId);
  if (!force && hit && Date.now() - hit.at < SYNC_EVERY_MS) return hit.info;
  await ensureDefaultAccounts(companyId);
  const pool = getPool();
  const conn = await pool.getConnection();
  const lockName = `crm_journal_sync_${companyId}`;
  try {
    const [lkRows] = await conn.query("SELECT GET_LOCK(?, 30) AS ok", [lockName]);
    const lk = (lkRows as Row[])[0];
    if (Number(lk?.ok) !== 1) throw new Error("Books are being updated by another request — try again");
    const info: SyncInfo = {
      entries: 0, inserted: 0, updated: 0, removed: 0, cost_estimated_lines: 0, cost_missing_lines: 0,
      unvalued_adjustments: 0, unbalanced: [], skipped: [], at: new Date().toISOString(),
    };
    const drafts: Draft[] = [];
    const builders: [string, () => Promise<Draft[]>][] = [
      ["sales bills", () => invoiceDrafts(conn, companyId, info)],
      ["customer payments", () => customerPaymentDrafts(conn, companyId)],
      ["refunds", () => refundDrafts(conn, companyId)],
      ["purchase bills", () => purchaseBillDrafts(conn, companyId)],
      ["supplier payments", () => supplierPaymentDrafts(conn, companyId)],
      ["stock adjustments", () => stockAdjustmentDrafts(conn, companyId, info)],
      ["opening balances", () => openingDrafts(conn, companyId)],
    ];
    for (const [name, fn] of builders) {
      try {
        drafts.push(...(await fn()));
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        info.skipped.push(name);
      }
    }
    const keyMap = await accountKeyMap(conn, companyId);
    const [ex] = await conn.query(
      `SELECT id, source_type, source_id, signature FROM ${JE_TABLE} WHERE company_id = ? AND is_auto = 1`,
      [companyId]
    );
    const existing = new Map((ex as Row[]).map((r) => [`${r.source_type}:${r.source_id}`, { id: Number(r.id), sig: String(r.signature || "") }]));
    const seen = new Set<string>();

    await conn.beginTransaction();
    for (const d of drafts) {
      /* merge same account/party/description lines, drop zeros, keep balanced */
      const lines = d.lines
        .filter((l) => r2(l.debit) !== 0 || r2(l.credit) !== 0)
        .map((l) => ({
          account_id: keyMap.get(l.key) ?? keyMap.get("suspense")!,
          debit: r2(l.debit), credit: r2(l.credit),
          party_type: l.party_type || null, party_id: l.party_id || null, description: l.description || null,
        }));
      const diff = r2(lines.reduce((a, l) => a + l.debit - l.credit, 0));
      if (diff !== 0) {
        lines.push({ account_id: keyMap.get("suspense")!, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, party_type: null, party_id: null, description: "unbalanced difference" });
        info.unbalanced.push({ ref: d.source_ref, diff });
      }
      const k = `${d.source_type}:${d.source_id}`;
      seen.add(k);
      if (!lines.length) continue;
      info.entries++;
      const sig = signature(d, lines);
      const cur = existing.get(k);
      if (cur && cur.sig === sig) continue;
      let entryId: number;
      if (cur) {
        entryId = cur.id;
        await conn.query(
          `UPDATE ${JE_TABLE} SET entry_date = ?, source_ref = ?, memo = ?, signature = ? WHERE id = ?`,
          [d.entry_date, d.source_ref, d.memo.slice(0, 500), sig, entryId]
        );
        await conn.query(`DELETE FROM ${JL_TABLE} WHERE entry_id = ?`, [entryId]);
        info.updated++;
      } else {
        const [res] = await conn.query(
          `INSERT INTO ${JE_TABLE} (company_id, entry_number, entry_date, source_type, source_id, source_ref, memo, is_auto, signature)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [companyId, d.source_ref, d.entry_date, d.source_type, d.source_id, d.source_ref, d.memo.slice(0, 500), sig]
        );
        entryId = (res as { insertId: number }).insertId;
        info.inserted++;
      }
      await conn.query(
        `INSERT INTO ${JL_TABLE} (entry_id, company_id, account_id, debit, credit, party_type, party_id, description) VALUES ?`,
        [lines.map((l) => [entryId, companyId, l.account_id, l.debit, l.credit, l.party_type, l.party_id, l.description])]
      );
    }
    /* documents that no longer exist (e.g. deleted draft / payment): their entries go too */
    const gone = [...existing.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => v.id);
    if (gone.length) {
      await conn.query(`DELETE FROM ${JL_TABLE} WHERE entry_id IN (?)`, [gone]);
      await conn.query(`DELETE FROM ${JE_TABLE} WHERE id IN (?)`, [gone]);
      info.removed = gone.length;
    }
    await conn.commit();
    lastSync.set(companyId, { at: Date.now(), info });
    return info;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    try { await conn.query("SELECT RELEASE_LOCK(?)", [lockName]); } catch {}
    conn.release();
  }
}

/* ---------------- manual entries ---------------- */
export type ManualLine = { account_id: number; debit: number; credit: number; description?: string | null };

export async function createManualEntry(
  user: { id: number; company_id: number },
  e: { entry_date: string; memo: string; lines: ManualLine[]; source_type?: string; source_ref?: string | null }
) {
  await ensureDefaultAccounts(user.company_id);
  const lines = e.lines
    .map((l) => ({ ...l, debit: r2(l.debit), credit: r2(l.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  if (lines.length < 2) throw new Error("An entry needs at least two lines");
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) throw new Error("A line can have debit or credit, not both");
  const dr = r2(lines.reduce((a, l) => a + l.debit, 0));
  const cr = r2(lines.reduce((a, l) => a + l.credit, 0));
  if (dr !== cr) throw new Error(`Debit (${dr}) and credit (${cr}) must be equal`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.entry_date)) throw new Error("Enter a valid date");
  const pool = getPool();
  const ids = Array.from(new Set(lines.map((l) => l.account_id)));
  const [acc] = await pool.query(`SELECT id FROM ${ACC_TABLE} WHERE company_id = ? AND id IN (?) AND is_active = 1`, [user.company_id, ids]);
  if ((acc as unknown[]).length !== ids.length) throw new Error("An account is not valid / active");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const num = await lockedSeqNumber(conn, JE_TABLE, "entry_number", "JV", user.company_id);
    const [res] = await conn.query(
      `INSERT INTO ${JE_TABLE} (company_id, entry_number, entry_date, source_type, source_id, source_ref, memo, is_auto, created_by)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?)`,
      [user.company_id, num, e.entry_date, e.source_type || "manual", e.source_ref || num, e.memo.slice(0, 500), user.id]
    );
    const id = (res as { insertId: number }).insertId;
    await conn.query(
      `INSERT INTO ${JL_TABLE} (entry_id, company_id, account_id, debit, credit, description) VALUES ?`,
      [lines.map((l) => [id, user.company_id, l.account_id, l.debit, l.credit, l.description ? String(l.description).slice(0, 255) : null])]
    );
    await conn.commit();
    return { id, entry_number: num };
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

/* A manual entry is never deleted — it is reversed by an opposite entry */
export async function reverseManualEntry(user: { id: number; company_id: number }, entryId: number, date: string) {
  const pool = getPool();
  const [eRows] = await pool.query(`SELECT * FROM ${JE_TABLE} WHERE id = ? AND company_id = ?`, [entryId, user.company_id]);
  const e = (eRows as Row[])[0];
  if (!e) throw new Error("Entry not found");
  if (Number(e.is_auto) === 1) throw new Error("Automatic entries follow their bill / payment — correct the document instead");
  if (e.reversed_by) throw new Error("This entry is already reversed");
  const [ls] = await pool.query(`SELECT account_id, debit, credit, description FROM ${JL_TABLE} WHERE entry_id = ?`, [entryId]);
  const r = await createManualEntry(user, {
    entry_date: date,
    memo: `Reversal of ${e.entry_number}: ${e.memo || ""}`.slice(0, 500),
    source_type: "reversal",
    lines: (ls as Row[]).map((l) => ({ account_id: Number(l.account_id), debit: Number(l.credit), credit: Number(l.debit), description: l.description as string })),
  });
  await pool.query(`UPDATE ${JE_TABLE} SET reversed_by = ? WHERE id = ?`, [r.id, entryId]);
  return r;
}

/* ---------------- reports ---------------- */
export type AccRow = { id: number; code: string; name: string; type: AccType; subtype: string | null; system_key: string | null; is_active: number; debit: number; credit: number; balance: number };

/* debit/credit totals per account in a date range (from optional) */
export async function accountTotals(companyId: number, from: string | null, to: string | null): Promise<AccRow[]> {
  const pool = getPool();
  const [accs] = await pool.query(
    `SELECT id, code, name, type, subtype, system_key, is_active FROM ${ACC_TABLE} WHERE company_id = ? ORDER BY code`,
    [companyId]
  );
  const w: string[] = ["e.company_id = ?"];
  const p: unknown[] = [companyId];
  if (from) { w.push("e.entry_date >= ?"); p.push(from); }
  if (to) { w.push("e.entry_date <= ?"); p.push(to); }
  const [sums] = await pool.query(
    `SELECT l.account_id, SUM(l.debit) AS d, SUM(l.credit) AS c
       FROM ${JL_TABLE} l JOIN ${JE_TABLE} e ON e.id = l.entry_id
      WHERE ${w.join(" AND ")} GROUP BY l.account_id`,
    p
  );
  const m = new Map((sums as Row[]).map((s) => [Number(s.account_id), { d: Number(s.d) || 0, c: Number(s.c) || 0 }]));
  return (accs as Row[]).map((a) => {
    const t = m.get(Number(a.id)) || { d: 0, c: 0 };
    const debitNature = a.type === "asset" || a.type === "expense";
    return {
      id: Number(a.id), code: String(a.code), name: String(a.name), type: a.type as AccType, subtype: (a.subtype as string) || null,
      system_key: (a.system_key as string) || null, is_active: Number(a.is_active),
      debit: r2(t.d), credit: r2(t.c), balance: r2(debitNature ? t.d - t.c : t.c - t.d),
    };
  });
}

/* customer / supplier balances on AR / AP (to split receivable vs advance) */
export async function partyBalances(companyId: number, key: "ar" | "ap", asOf: string | null) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT l.party_id, SUM(l.debit - l.credit) AS net
       FROM ${JL_TABLE} l JOIN ${JE_TABLE} e ON e.id = l.entry_id
       JOIN ${ACC_TABLE} a ON a.id = l.account_id
      WHERE e.company_id = ? AND a.system_key = ? ${asOf ? "AND e.entry_date <= ?" : ""}
      GROUP BY l.party_id`,
    asOf ? [companyId, key, asOf] : [companyId, key]
  );
  let positive = 0;
  let negative = 0;
  for (const r of rows as Row[]) {
    const n = Number(r.net) || 0;
    if (n > 0) positive += n;
    else negative += -n;
  }
  return { debit_side: r2(positive), credit_side: r2(negative) };
}

/* bill lines in a range whose cost is not on the bill (for an honest P&L note) */
export async function costQuality(companyId: number, from: string | null, to: string | null) {
  const pool = getPool();
  const w: string[] = ["i.company_id = ?", "i.status NOT IN ('draft', 'cancelled')", "ii.product_id IS NOT NULL",
    "COALESCE(p.product_type, 'product') = 'product'", "COALESCE(p.track_inventory, 1) = 1"];
  const p: unknown[] = [companyId];
  if (from) { w.push("i.invoice_date >= ?"); p.push(from); }
  if (to) { w.push("i.invoice_date <= ?"); p.push(to); }
  const [[r]] = (await pool.query(
    `SELECT SUM(ii.unit_cost IS NULL AND COALESCE(p.purchase_price, 0) > 0) AS estimated,
            SUM(ii.unit_cost IS NULL AND COALESCE(p.purchase_price, 0) <= 0) AS missing
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id LEFT JOIN products p ON p.id = ii.product_id
      WHERE ${w.join(" AND ")}`,
    p
  )) as unknown as [[Row]];
  return { estimated: Number(r?.estimated || 0), missing: Number(r?.missing || 0) };
}

/* today's stock value at purchase price (for comparison with the Inventory account) */
export async function stockValueAtCost(companyId: number) {
  const pool = getPool();
  const [[r]] = (await pool.query(
    `SELECT COALESCE(SUM(GREATEST(0, (COALESCE(p.opening_stock, 0) + COALESCE((SELECT SUM(m.qty) FROM ${STOCK_TABLE} m
              WHERE m.product_id = p.id AND m.company_id = p.company_id), 0))) * COALESCE(p.purchase_price, 0)), 0) AS v
       FROM products p WHERE p.company_id = ? AND COALESCE(p.track_inventory, 1) = 1 AND COALESCE(p.product_type, 'product') = 'product'`,
    [companyId]
  )) as unknown as [[Row]];
  return r2(Number(r?.v || 0));
}
