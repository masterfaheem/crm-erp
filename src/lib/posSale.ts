import { getPool } from "@/lib/db";
import {
  LEADS_TABLE,
  ensureLeadsTable,
  formatLeadNumber,
  nextLeadNumberBase,
} from "@/lib/leadsTable";
import { LEAD_SOURCES, PROFESSIONS } from "@/lib/leadOptions";
import { phoneMatchSql, uniqueKeys } from "@/lib/orderHandover";

/* ============================================================
   POS SALE HELPERS
   - safe invoice numbers (no repeats when two people bill at once)
   - double-click / retry protection (one checkout = one bill)
   - cost of each sold item saved on the bill (profit stays correct
     even when the product's purchase price changes later)
   - walk-in sale -> CRM lead (found or created) marked Won
   All tables / columns are added automatically; nothing is removed.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;

export const COUNTER_TABLE = "crm_doc_counters";
export const POS_REQUEST_TABLE = "crm_pos_requests";
export const INVOICE_LEAD_TABLE = "crm_invoice_leads";

let ready = false;

/* Run BEFORE beginTransaction (DDL would commit an open transaction) */
export async function ensurePosTables(): Promise<void> {
  if (ready) return;
  await ensureLeadsTable();
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${COUNTER_TABLE} (
      company_id INT UNSIGNED NOT NULL,
      doc_key VARCHAR(40) NOT NULL,
      seq INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, doc_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${POS_REQUEST_TABLE} (
      company_id INT UNSIGNED NOT NULL,
      client_ref VARCHAR(64) NOT NULL,
      invoice_id INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, client_ref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${INVOICE_LEAD_TABLE} (
      invoice_id INT UNSIGNED NOT NULL PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      lead_id INT UNSIGNED NOT NULL,
      sales_channel VARCHAR(20) NOT NULL,
      lead_created TINYINT(1) NOT NULL DEFAULT 0,
      prev_status VARCHAR(20) NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_lead (lead_id),
      KEY idx_company_channel (company_id, sales_channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  /* lead status before the sale (restored if the bill is cancelled) */
  const [plc] = await pool.query(`SHOW COLUMNS FROM ${INVOICE_LEAD_TABLE} LIKE 'prev_status'`);
  if (!(plc as unknown[]).length) {
    await pool.query(`ALTER TABLE ${INVOICE_LEAD_TABLE} ADD COLUMN prev_status VARCHAR(20) NULL AFTER lead_created`);
  }
  /* cost of each sold unit, saved at the time of sale */
  const [cols] = await pool.query("SHOW COLUMNS FROM invoice_items LIKE 'unit_cost'");
  if (!(cols as unknown[]).length) {
    await pool.query("ALTER TABLE invoice_items ADD COLUMN unit_cost DECIMAL(14,2) NULL");
  }
  ready = true;
}

/* ---------------- safe document numbers ----------------
   PREFIX-YEAR-0001.  The counter row is locked until the
   transaction commits, so two bills can never get the same number.
   Starts from the highest number already used (old bills untouched). */
export async function lockedDocNumber(
  conn: Conn,
  table: string,
  column: string,
  prefix: string,
  companyId: number
): Promise<string> {
  const year = new Date(Date.now() + 5 * 3600000).getUTCFullYear();
  const key = `${table}:${prefix}:${year}`;
  /* create the counter row OUTSIDE the transaction (own connection, auto-commit):
     two open transactions inserting the same row would deadlock each other */
  await getPool().query(
    `INSERT IGNORE INTO ${COUNTER_TABLE} (company_id, doc_key, seq) VALUES (?, ?, 0)`,
    [companyId, key]
  );
  const [[ctr]] = await conn.query(
    `SELECT seq FROM ${COUNTER_TABLE} WHERE company_id = ? AND doc_key = ? FOR UPDATE`,
    [companyId, key]
  );
  const [[mx]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(${column}, '-', -1) AS UNSIGNED)) AS m
       FROM ${table} WHERE company_id = ? AND ${column} LIKE ?`,
    [companyId, `${prefix}-${year}-%`]
  );
  const seq = Math.max(Number(ctr?.seq || 0), Number(mx?.m || 0)) + 1;
  await conn.query(`UPDATE ${COUNTER_TABLE} SET seq = ? WHERE company_id = ? AND doc_key = ?`, [
    seq,
    companyId,
    key,
  ]);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/* ---------------- one checkout = one bill ---------------- */
export function cleanClientRef(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

export async function invoiceForClientRef(companyId: number, ref: string): Promise<number | null> {
  const [rows] = await getPool().query(
    `SELECT invoice_id FROM ${POS_REQUEST_TABLE} WHERE company_id = ? AND client_ref = ? LIMIT 1`,
    [companyId, ref]
  );
  const r = (rows as { invoice_id: number | null }[])[0];
  return r?.invoice_id ? Number(r.invoice_id) : null;
}

/* Claim the checkout inside the transaction. A second request with the
   same ref waits here until the first commits, then gets a duplicate error. */
export async function claimClientRef(conn: Conn, companyId: number, ref: string, userId: number) {
  await conn.query(
    `INSERT INTO ${POS_REQUEST_TABLE} (company_id, client_ref, created_by) VALUES (?, ?, ?)`,
    [companyId, ref, userId]
  );
}

export async function finishClientRef(conn: Conn, companyId: number, ref: string, invoiceId: number) {
  await conn.query(
    `UPDATE ${POS_REQUEST_TABLE} SET invoice_id = ? WHERE company_id = ? AND client_ref = ?`,
    [invoiceId, companyId, ref]
  );
}

/* ---------------- cost of sold items ---------------- */
export async function currentCosts(conn: Conn, companyId: number, productIds: number[]) {
  const map = new Map<number, number | null>();
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (!ids.length) return map;
  const [rows] = await conn.query(
    "SELECT id, purchase_price FROM products WHERE company_id = ? AND id IN (?)",
    [companyId, ids]
  );
  for (const r of rows as { id: number; purchase_price: number | null }[]) {
    const c = Number(r.purchase_price);
    map.set(Number(r.id), c > 0 ? c : null); // 0 = cost not entered -> unknown
  }
  return map;
}

/* ---------------- walk-in sale -> lead ---------------- */
const SOURCE_VALUES = new Set(LEAD_SOURCES.map((s) => s.value));
const PROFESSION_VALUES = new Set(PROFESSIONS.map((p) => p.value));

export type WalkInLeadInput = {
  lead_id?: number | null;
  source?: string | null;
  profession?: string | null;
  profession_other?: string | null;
};

export function cleanWalkInLead(v: unknown): WalkInLeadInput {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const source = String(o.source ?? "").trim();
  const profession = String(o.profession ?? "").trim();
  return {
    lead_id: Number(o.lead_id) || null,
    source: SOURCE_VALUES.has(source) ? source : null,
    profession: PROFESSION_VALUES.has(profession) ? profession : null,
    profession_other:
      profession === "other" && o.profession_other ? String(o.profession_other).trim().slice(0, 100) || null : null,
  };
}

/* Open (not won / lost) leads with this customer's numbers, newest first */
export async function openLeadsForCustomer(conn: Conn, companyId: number, customerId: number) {
  const [[c]] = await conn.query(
    "SELECT phone, whatsapp, alternate_phone FROM customers WHERE id = ? AND company_id = ?",
    [customerId, companyId]
  );
  if (!c) return [];
  const keys = uniqueKeys(c.phone, c.whatsapp, c.alternate_phone).filter((k) => k.length >= 10);
  if (!keys.length) return [];
  const m = phoneMatchSql(["l.phone", "l.whatsapp", "l.alternate_phone"], keys);
  const [rows] = await conn.query(
    `SELECT l.id, l.lead_number, l.first_name, l.last_name, l.status, l.source,
            l.profession, l.profession_other, l.assigned_to
       FROM ${LEADS_TABLE} l
      WHERE l.company_id = ? AND l.status NOT IN ('won', 'lost') AND ${m.sql}
      ORDER BY l.id DESC LIMIT 5`,
    [companyId, ...m.params]
  );
  return rows as {
    id: number; lead_number: string; first_name: string; last_name: string | null; status: string;
    source: string | null; profession: string | null; profession_other: string | null; assigned_to: number | null;
  }[];
}

/* Link a walk-in bill to a lead: the chosen / matching open lead is marked
   Won, otherwise a new Won lead is created from the customer.  Returns
   the lead number.  Must run inside the bill's transaction. */
export async function linkWalkInLead(
  conn: Conn,
  user: { id: number; company_id: number; branch_id: number | null },
  p: { customerId: number; invoiceId: number; invoiceNumber: string; input: WalkInLeadInput }
): Promise<{ lead_id: number; lead_number: string; created: boolean }> {
  const companyId = user.company_id;
  let lead: { id: number; lead_number: string; status: string } | null = null;

  if (p.input.lead_id) {
    const [rows] = await conn.query(
      `SELECT id, lead_number, status FROM ${LEADS_TABLE} WHERE id = ? AND company_id = ? AND status <> 'won' FOR UPDATE`,
      [p.input.lead_id, companyId]
    );
    lead = (rows as { id: number; lead_number: string; status: string }[])[0] || null;
  }
  if (!lead) {
    const open = await openLeadsForCustomer(conn, companyId, p.customerId);
    if (open.length) {
      const [rows] = await conn.query(
        `SELECT id, lead_number, status FROM ${LEADS_TABLE} WHERE id = ? FOR UPDATE`,
        [open[0].id]
      );
      lead = (rows as { id: number; lead_number: string; status: string }[])[0] || null;
    }
  }

  if (lead) {
    /* keep the lead's own source / profession; only fill what is empty */
    await conn.query(
      `UPDATE ${LEADS_TABLE}
          SET status = 'won', sales_channel = 'walk_in',
              source = COALESCE(source, ?),
              profession = COALESCE(profession, ?),
              profession_other = COALESCE(profession_other, ?),
              assigned_to = COALESCE(assigned_to, ?)
        WHERE id = ? AND company_id = ?`,
      [p.input.source, p.input.profession, p.input.profession_other, user.id, lead.id, companyId]
    );
    await conn.query(
      `INSERT INTO ${INVOICE_LEAD_TABLE} (invoice_id, company_id, lead_id, sales_channel, lead_created, prev_status, created_by)
       VALUES (?, ?, ?, 'walk_in', 0, ?, ?)`,
      [p.invoiceId, companyId, lead.id, lead.status || null, user.id]
    );
    return { lead_id: lead.id, lead_number: lead.lead_number, created: false };
  }

  /* new lead from the customer record */
  const [[c]] = await conn.query(
    `SELECT name, phone, whatsapp, alternate_phone, city, billing_address FROM customers WHERE id = ? AND company_id = ?`,
    [p.customerId, companyId]
  );
  const fullName = String(c?.name || "Walk-in Customer").trim();
  const space = fullName.indexOf(" ");
  const first = (space > 0 ? fullName.slice(0, space) : fullName).slice(0, 120);
  const last = space > 0 ? fullName.slice(space + 1).slice(0, 120) : null;
  const next = (await nextLeadNumberBase(conn, companyId)) + 1;
  const leadNumber = formatLeadNumber(next);
  const [res] = await conn.query(
    `INSERT INTO ${LEADS_TABLE}
       (company_id, branch_id, lead_number, first_name, last_name, phone, alternate_phone, whatsapp,
        source, city, assigned_to, status, priority, address, description,
        profession, profession_other, sales_channel, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'won', 'medium', ?, ?, ?, ?, 'walk_in', ?)`,
    [
      companyId, user.branch_id ?? null, leadNumber, first, last,
      c?.phone || null, c?.alternate_phone || null, c?.whatsapp || null,
      p.input.source, c?.city || null, user.id, c?.billing_address || null,
      `Walk-in sale ${p.invoiceNumber} (created from POS)`,
      p.input.profession, p.input.profession_other, user.id,
    ]
  );
  const leadId = (res as { insertId: number }).insertId;
  await conn.query(
    `INSERT INTO ${INVOICE_LEAD_TABLE} (invoice_id, company_id, lead_id, sales_channel, lead_created, created_by)
     VALUES (?, ?, ?, 'walk_in', 1, ?)`,
    [p.invoiceId, companyId, leadId, user.id]
  );
  return { lead_id: leadId, lead_number: leadNumber, created: true };
}
