import { getPool } from "@/lib/db";
import { cleanRules, DEFAULT_WARRANTY_RULES, type WarrantyRules } from "@/lib/extWarranty";

/* ============================================================
   COMPANY SETTINGS — small key/value store (JSON values).
   Table is created automatically on first use.
============================================================ */
export const SETTINGS_TABLE = "crm_company_settings";

let ready = false;
async function ensureSettingsTable(): Promise<void> {
  if (ready) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      company_id INT UNSIGNED NOT NULL,
      setting_key VARCHAR(60) NOT NULL,
      setting_value TEXT NULL,
      updated_by INT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ready = true;
}

async function getSetting(companyId: number, key: string): Promise<unknown> {
  await ensureSettingsTable();
  const [rows] = await getPool().query(
    `SELECT setting_value FROM ${SETTINGS_TABLE} WHERE company_id = ? AND setting_key = ? LIMIT 1`,
    [companyId, key]
  );
  const v = (rows as { setting_value: string | null }[])[0]?.setting_value;
  if (v === undefined || v === null) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

async function setSetting(companyId: number, key: string, value: unknown, userId: number): Promise<void> {
  await ensureSettingsTable();
  await getPool().query(
    `INSERT INTO ${SETTINGS_TABLE} (company_id, setting_key, setting_value, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [companyId, key, JSON.stringify(value), userId]
  );
}

const WARRANTY_KEY = "extended_warranty_rules";

export async function getWarrantyRules(companyId: number): Promise<WarrantyRules> {
  const v = await getSetting(companyId, WARRANTY_KEY);
  return v === undefined ? DEFAULT_WARRANTY_RULES : cleanRules(v);
}

export async function saveWarrantyRules(companyId: number, rules: unknown, userId: number): Promise<WarrantyRules> {
  const clean = cleanRules(rules);
  await setSetting(companyId, WARRANTY_KEY, clean, userId);
  return clean;
}
