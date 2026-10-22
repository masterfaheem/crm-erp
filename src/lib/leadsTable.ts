import { getPool } from "@/lib/db";
import {
  BUDGET_RANGES,
  LEAD_SOURCES,
  LOST_REASONS,
  PROFESSIONS,
  USE_CASES,
  leadSourceLabel,
} from "@/lib/leadOptions";

/* ============================================================
   LEADS TABLE
   Created / upgraded automatically on first use (no manual SQL).
============================================================ */
export const LEADS_TABLE = "crm_leads";

/* Columns added after the first version (auto-added if missing) */
const EXTRA_COLUMNS: [string, string][] = [
  ["profession", "VARCHAR(30) NULL"],
  ["profession_other", "VARCHAR(100) NULL"],
  ["budget_range", "VARCHAR(20) NULL"],
  ["use_cases", "VARCHAR(300) NULL"],
  ["use_case_custom", "VARCHAR(200) NULL"],
  ["requirement_note", "VARCHAR(500) NULL"],
  ["follow_up_at", "DATETIME NULL"],
  ["follow_up_note", "VARCHAR(255) NULL"],
  ["follow_up_done", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["lost_reason", "VARCHAR(30) NULL"],
  ["lost_reason_other", "VARCHAR(200) NULL"],
  ["delivery_name", "VARCHAR(120) NULL"],
  ["delivery_phone", "VARCHAR(40) NULL"],
  ["delivery_phone2", "VARCHAR(40) NULL"],
  ["delivery_house", "VARCHAR(100) NULL"],
  ["delivery_street", "VARCHAR(150) NULL"],
  ["delivery_area", "VARCHAR(150) NULL"],
  ["delivery_landmark", "VARCHAR(200) NULL"],
  ["delivery_city", "VARCHAR(100) NULL"],
];

let ensured = false;

export async function ensureLeadsTable(): Promise<void> {
  if (ensured) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${LEADS_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      branch_id INT UNSIGNED NULL,
      lead_number VARCHAR(30) NOT NULL,
      first_name VARCHAR(120) NOT NULL,
      last_name VARCHAR(120) NULL,
      company_name VARCHAR(200) NULL,
      designation VARCHAR(120) NULL,
      email VARCHAR(190) NULL,
      phone VARCHAR(40) NULL,
      alternate_phone VARCHAR(40) NULL,
      whatsapp VARCHAR(40) NULL,
      source VARCHAR(50) NULL,
      city VARCHAR(100) NULL,
      assigned_to INT UNSIGNED NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      estimated_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      expected_close_date DATE NULL,
      address TEXT NULL,
      description TEXT NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_number (company_id, lead_number),
      KEY idx_company_status (company_id, status),
      KEY idx_company_priority (company_id, priority),
      KEY idx_assigned (assigned_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // add any missing newer columns
  const [cols] = await pool.query(`SHOW COLUMNS FROM ${LEADS_TABLE}`);
  const have = new Set((cols as { Field: string }[]).map((c) => c.Field));
  const missing = EXTRA_COLUMNS.filter(([c]) => !have.has(c));
  if (missing.length) {
    await pool.query(
      `ALTER TABLE ${LEADS_TABLE} ${missing
        .map(([c, def]) => `ADD COLUMN ${c} ${def}`)
        .join(", ")}`
    );
  }
  if (!have.has("follow_up_at")) {
    await pool
      .query(`ALTER TABLE ${LEADS_TABLE} ADD KEY idx_follow_up (company_id, follow_up_done, follow_up_at)`)
      .catch(() => {});
  }

  // map old statuses to the new pipeline
  await pool.query(
    `UPDATE ${LEADS_TABLE} SET status = 'mature' WHERE status IN ('contacted', 'qualified')`
  );
  await pool.query(
    `UPDATE ${LEADS_TABLE} SET status = 'lost', lost_reason = IFNULL(lost_reason, 'unknown') WHERE status = 'junk'`
  );

  ensured = true;
}

export const LEAD_STATUSES = [
  "new",
  "mature",
  "proposal",
  "negotiation",
  "follow_up",
  "won",
  "lost",
];
export const LEAD_PRIORITIES = ["low", "medium", "high", "urgent"];
export const LEAD_SOURCE_VALUES = LEAD_SOURCES.map((s) => s.value);
const PROFESSION_VALUES = PROFESSIONS.map((o) => o.value);
const BUDGET_VALUES = BUDGET_RANGES.map((o) => o.value);
const USE_CASE_VALUES = USE_CASES.map((o) => o.value);
const LOST_REASON_VALUES = LOST_REASONS.map((o) => o.value);

/* Shape a DB row for the frontend */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLeadRow(r: any) {
  return {
    ...r,
    estimated_value: Number(r.estimated_value || 0),
    follow_up_done: Number(r.follow_up_done || 0),
    source_name: r.source ? leadSourceLabel(r.source) : null,
    city_name: r.city || null,
    profession_name: null,
    stage_name: null,
    pipeline_name: null,
  };
}

export function cleanStr(v: unknown, max = 255): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function cleanDate(v: unknown): string | null {
  const s = cleanStr(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/* "2026-10-25T14:30" | "2026-10-25 14:30:00" -> "2026-10-25 14:30:00" */
export function cleanDateTime(v: unknown): string | null {
  const s = cleanStr(v, 30);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4] || "00"}` : null;
}

/* ============================================================
   INPUT VALIDATION (create + update)
   partial = true  -> only fields present in body are returned
   `existing` lets status rules use the stored follow_up_at / lost_reason
============================================================ */
type Vals = Record<string, unknown>;

export function parseLeadInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  partial: boolean,
  existing?: Record<string, unknown> | null
): { values: Vals; error?: string } {
  const v: Vals = {};
  const has = (k: string) => body[k] !== undefined;
  const take = (k: string) => !partial || has(k);

  // Name: single "name" field (stored in first_name) or first/last
  if (has("name") || has("first_name") || !partial) {
    const full = cleanStr(
      has("name")
        ? body.name
        : [body.first_name, body.last_name].filter(Boolean).join(" "),
      240
    );
    if (!full) return { values: v, error: "Name is required" };
    v.first_name = full.slice(0, 120);
    v.last_name = full.length > 120 ? full.slice(120, 240) : null;
  }

  const strFields: [string, number][] = [
    ["whatsapp", 40], ["phone", 40], ["alternate_phone", 40], ["email", 190],
    ["company_name", 200], ["designation", 120], ["city", 100],
    ["profession_other", 100], ["use_case_custom", 200],
    ["requirement_note", 500], ["follow_up_note", 255],
    ["lost_reason_other", 200], ["address", 5000], ["description", 10000],
    ["delivery_name", 120], ["delivery_phone", 40], ["delivery_phone2", 40],
    ["delivery_house", 100], ["delivery_street", 150], ["delivery_area", 150],
    ["delivery_landmark", 200], ["delivery_city", 100],
  ];
  for (const [k, max] of strFields) if (take(k)) v[k] = cleanStr(body[k], max);

  const enumField = (k: string, allowed: string[], label: string) => {
    if (!take(k)) return null;
    const x = cleanStr(body[k], 50);
    if (x && !allowed.includes(x)) return `Invalid ${label}`;
    v[k] = x;
    return null;
  };
  const e =
    enumField("source", LEAD_SOURCE_VALUES, "source") ||
    enumField("profession", PROFESSION_VALUES, "profession") ||
    enumField("budget_range", BUDGET_VALUES, "budget range") ||
    enumField("lost_reason", LOST_REASON_VALUES, "lost reason");
  if (e) return { values: v, error: e };

  if (take("use_cases")) {
    const arr = Array.isArray(body.use_cases)
      ? body.use_cases
      : String(body.use_cases || "").split(",");
    const clean = arr
      .map((x: unknown) => String(x).trim())
      .filter((x: string) => USE_CASE_VALUES.includes(x));
    v.use_cases = clean.length ? Array.from(new Set(clean)).join(",") : null;
  }

  if (take("status")) {
    v.status = LEAD_STATUSES.includes(body.status) ? body.status : "new";
  }
  if (take("priority")) {
    v.priority = LEAD_PRIORITIES.includes(body.priority) ? body.priority : "medium";
  }
  if (take("assigned_to")) {
    v.assigned_to = body.assigned_to ? Number(body.assigned_to) || null : null;
  }
  if (has("estimated_value")) v.estimated_value = Number(body.estimated_value) || 0;
  if (has("expected_close_date")) v.expected_close_date = cleanDate(body.expected_close_date);

  if (take("follow_up_at")) {
    v.follow_up_at = cleanDateTime(body.follow_up_at);
    // a new/changed follow-up time re-opens the reminder
    const before = existing?.follow_up_local as string | null | undefined;
    const after = v.follow_up_at ? String(v.follow_up_at).slice(0, 16).replace(" ", "T") : null;
    if (after && after !== before) v.follow_up_done = 0;
  }
  if (has("follow_up_done")) v.follow_up_done = body.follow_up_done ? 1 : 0;

  /* status rules */
  const status = (v.status ?? existing?.status) as string | undefined;
  if (v.status !== undefined || v.follow_up_at !== undefined || v.lost_reason !== undefined) {
    if (status === "follow_up") {
      const fu = v.follow_up_at !== undefined ? v.follow_up_at : existing?.follow_up_at;
      if (!fu) return { values: v, error: "Please set the follow-up date & time" };
    }
    if (status === "lost") {
      const lr = v.lost_reason !== undefined ? v.lost_reason : existing?.lost_reason;
      if (!lr) return { values: v, error: "Please select a lost reason" };
    }
  }
  if (status !== "lost" && v.status !== undefined) {
    v.lost_reason = null;
    v.lost_reason_other = null;
  }

  return { values: v };
}

/* Current Pakistan time "YYYY-MM-DD HH:MM:SS" (PKT = UTC+5, no DST).
   Follow-up times are stored as PKT wall-clock values. */
export function nowPKT(offsetDays = 0): string {
  const d = new Date(Date.now() + 5 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const LEAD_SELECT = `
  SELECT l.*, u.name AS assigned_name,
         DATE_FORMAT(l.follow_up_at, '%Y-%m-%dT%H:%i') AS follow_up_local
    FROM ${LEADS_TABLE} l
    LEFT JOIN users u ON u.id = l.assigned_to
`;

/* ============================================================
   FILTERS (shared by list + export)
   Query params:
     search, lead_number, name, phone, email, company, designation,
     city, source, status, priority, assigned_to (id | "unassigned"),
     value_min, value_max, close_from, close_to, created_from, created_to,
     address, notes, profession, budget_range, use_case, lost_reason,
     requirement, delivery, follow_up (due|overdue|today|upcoming|pending|done),
     follow_up_from, follow_up_to
============================================================ */
export function buildLeadFilters(
  sp: URLSearchParams,
  companyId: number
): { whereSql: string; params: unknown[] } {
  const where: string[] = ["l.company_id = ?"];
  const params: unknown[] = [companyId];
  const get = (k: string) => sp.get(k)?.trim() || "";
  const like = (v: string) => `%${v}%`;

  const search = get("search");
  if (search) {
    where.push(
      `(l.first_name LIKE ? OR l.last_name LIKE ? OR CONCAT_WS(' ', l.first_name, l.last_name) LIKE ?
        OR l.company_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.whatsapp LIKE ?
        OR l.alternate_phone LIKE ? OR l.lead_number LIKE ? OR l.city LIKE ?
        OR l.requirement_note LIKE ? OR l.delivery_phone LIKE ?)`
    );
    for (let i = 0; i < 12; i++) params.push(like(search));
  }

  const name = get("name");
  if (name) {
    where.push(
      `(CONCAT_WS(' ', l.first_name, l.last_name) LIKE ? OR l.first_name LIKE ? OR l.last_name LIKE ?)`
    );
    params.push(like(name), like(name), like(name));
  }

  const phone = get("phone");
  if (phone) {
    // match on digits only so 0300-1234567 / +92 300 1234567 both work
    const digits = phone.replace(/\D/g, "");
    const key = digits.length > 10 ? digits.slice(-10) : digits;
    if (key) {
      const norm = (col: string) =>
        `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(${col},''),' ',''),'-',''),'+',''),'(',''),')','')`;
      where.push(
        `(${norm("l.phone")} LIKE ? OR ${norm("l.whatsapp")} LIKE ? OR ${norm("l.alternate_phone")} LIKE ?)`
      );
      params.push(like(key), like(key), like(key));
    }
  }

  const textCols: [string, string][] = [
    ["lead_number", "l.lead_number"],
    ["email", "l.email"],
    ["company", "l.company_name"],
    ["designation", "l.designation"],
    ["address", "l.address"],
    ["notes", "l.description"],
  ];
  for (const [k, col] of textCols) {
    const v = get(k);
    if (v) {
      where.push(`${col} LIKE ?`);
      params.push(like(v));
    }
  }

  const city = get("city");
  if (city) {
    where.push("l.city = ?");
    params.push(city);
  }
  const source = get("source");
  if (source) {
    where.push("l.source = ?");
    params.push(source);
  }
  const status = get("status");
  if (status && LEAD_STATUSES.includes(status)) {
    where.push("l.status = ?");
    params.push(status);
  }
  const priority = get("priority");
  if (priority && LEAD_PRIORITIES.includes(priority)) {
    where.push("l.priority = ?");
    params.push(priority);
  }
  const assigned = get("assigned_to");
  if (assigned === "unassigned") {
    where.push("l.assigned_to IS NULL");
  } else if (assigned && Number(assigned)) {
    where.push("l.assigned_to = ?");
    params.push(Number(assigned));
  }

  const enumCols: [string, string][] = [
    ["profession", "l.profession"],
    ["budget_range", "l.budget_range"],
    ["lost_reason", "l.lost_reason"],
  ];
  for (const [k, col] of enumCols) {
    const v = get(k);
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  }
  const useCase = get("use_case");
  if (useCase) {
    where.push("FIND_IN_SET(?, l.use_cases) > 0");
    params.push(useCase);
  }
  const requirement = get("requirement");
  if (requirement) {
    where.push("(l.requirement_note LIKE ? OR l.use_case_custom LIKE ?)");
    params.push(like(requirement), like(requirement));
  }
  const delivery = get("delivery");
  if (delivery) {
    where.push(
      `CONCAT_WS(' ', l.delivery_name, l.delivery_phone, l.delivery_phone2, l.delivery_house,
        l.delivery_street, l.delivery_area, l.delivery_landmark, l.delivery_city) LIKE ?`
    );
    params.push(like(delivery));
  }

  /* follow-up: scope = due | overdue | today | upcoming | done, or date range */
  const fu = get("follow_up");
  const now = nowPKT();
  const today = now.slice(0, 10);
  if (fu === "due") {
    where.push("l.follow_up_at IS NOT NULL AND l.follow_up_done = 0 AND l.follow_up_at <= ?");
    params.push(`${today} 23:59:59`);
  } else if (fu === "overdue") {
    where.push("l.follow_up_at IS NOT NULL AND l.follow_up_done = 0 AND l.follow_up_at < ?");
    params.push(now);
  } else if (fu === "today") {
    where.push("l.follow_up_done = 0 AND l.follow_up_at BETWEEN ? AND ?");
    params.push(now, `${today} 23:59:59`);
  } else if (fu === "upcoming") {
    where.push("l.follow_up_done = 0 AND l.follow_up_at > ?");
    params.push(`${today} 23:59:59`);
  } else if (fu === "pending") {
    where.push("l.follow_up_at IS NOT NULL AND l.follow_up_done = 0");
  } else if (fu === "done") {
    where.push("l.follow_up_at IS NOT NULL AND l.follow_up_done = 1");
  }
  const fuFrom = cleanDate(get("follow_up_from"));
  if (fuFrom) {
    where.push("DATE(l.follow_up_at) >= ?");
    params.push(fuFrom);
  }
  const fuTo = cleanDate(get("follow_up_to"));
  if (fuTo) {
    where.push("DATE(l.follow_up_at) <= ?");
    params.push(fuTo);
  }

  const vmin = get("value_min");
  if (vmin !== "" && !isNaN(Number(vmin))) {
    where.push("l.estimated_value >= ?");
    params.push(Number(vmin));
  }
  const vmax = get("value_max");
  if (vmax !== "" && !isNaN(Number(vmax))) {
    where.push("l.estimated_value <= ?");
    params.push(Number(vmax));
  }

  const dateRange: [string, string, string][] = [
    ["close_from", "l.expected_close_date", ">="],
    ["close_to", "l.expected_close_date", "<="],
    ["created_from", "DATE(l.created_at)", ">="],
    ["created_to", "DATE(l.created_at)", "<="],
  ];
  for (const [k, col, op] of dateRange) {
    const d = cleanDate(get(k));
    if (d) {
      where.push(`${col} ${op} ?`);
      params.push(d);
    }
  }

  return { whereSql: where.join(" AND "), params };
}

/* Digits-only phone key (last 10 digits) for duplicate checks */
export function phoneKey(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

/* Next N lead numbers for a company (call inside a transaction) */
export async function nextLeadNumberBase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any,
  companyId: number
): Promise<number> {
  const [maxRows] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(lead_number, 6) AS UNSIGNED)) AS mx
       FROM ${LEADS_TABLE} WHERE company_id = ? FOR UPDATE`,
    [companyId]
  );
  return Number((maxRows as { mx: number | null }[])[0]?.mx || 0);
}

export function formatLeadNumber(n: number): string {
  return `LEAD-${String(n).padStart(4, "0")}`;
}
