import { getPool } from "@/lib/db";
import { LEAD_SOURCES, leadSourceLabel } from "@/lib/leadOptions";

/* ============================================================
   LEADS TABLE
   Table is created automatically on first use (no manual SQL needed).
============================================================ */
export const LEADS_TABLE = "crm_leads";

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
  ensured = true;
}

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "junk",
];
export const LEAD_PRIORITIES = ["low", "medium", "high", "urgent"];
export const LEAD_SOURCE_VALUES = LEAD_SOURCES.map((s) => s.value);

/* Shape a DB row for the frontend */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLeadRow(r: any) {
  return {
    ...r,
    estimated_value: Number(r.estimated_value || 0),
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

export const LEAD_SELECT = `
  SELECT l.*, u.name AS assigned_name
    FROM ${LEADS_TABLE} l
    LEFT JOIN users u ON u.id = l.assigned_to
`;
