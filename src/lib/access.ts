import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from "@/lib/permissions";

/* ============================================================
   ACCESS — who is signed in and what they are allowed to do.
   Super Admin (system role) = everything.
   Others = their role's ticks, or their own custom ticks.
============================================================ */
export interface Access {
  userId: number;
  companyId: number;
  branchId: number | null;
  name: string;
  isSuperAdmin: boolean;
  roleId: number | null;
  roleName: string | null;
  custom: boolean;
  perms: Set<string>;
}

export const USER_PERMS_TABLE = "crm_user_permissions";
export const USER_ACCESS_TABLE = "crm_user_access";

/* ---------------- schema (runs once per process) ---------------- */
let schemaReady: Promise<void> | null = null;
export function ensureAccessSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const pool = getPool();
      // per-user custom ticks
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${USER_ACCESS_TABLE} (
          user_id INT UNSIGNED NOT NULL PRIMARY KEY,
          custom TINYINT(1) NOT NULL DEFAULT 0,
          updated_by INT UNSIGNED NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${USER_PERMS_TABLE} (
          user_id INT UNSIGNED NOT NULL,
          permission_key VARCHAR(100) NOT NULL,
          PRIMARY KEY (user_id, permission_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      // every key in the catalog exists in `permissions` (roles store permission ids)
      const [have] = await pool.query("SELECT permission_key FROM permissions");
      const existing = new Set((have as { permission_key: string }[]).map((r) => r.permission_key));
      for (const g of PERMISSION_GROUPS) {
        for (const it of g.items) {
          if (existing.has(it.key)) continue;
          const [module, action] = it.key.split(".");
          await pool.query(
            "INSERT INTO permissions (module, action, permission_key, description) VALUES (?, ?, ?, ?)",
            [module, action, it.key, it.label.slice(0, 250)]
          );
        }
      }

      // users can be added with a phone number only -> email may be empty
      const [cols] = await pool.query(
        `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'users'`
      );
      const byName = new Map((cols as { COLUMN_NAME: string; IS_NULLABLE: string; COLUMN_TYPE: string }[]).map((c) => [c.COLUMN_NAME, c]));
      const email = byName.get("email");
      if (email && email.IS_NULLABLE === "NO") {
        await pool.query(`ALTER TABLE users MODIFY email ${email.COLUMN_TYPE} NULL`);
      }
      if (!byName.has("phone")) await pool.query("ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL");
      if (!byName.has("username")) await pool.query("ALTER TABLE users ADD COLUMN username VARCHAR(60) NULL");
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/* ---------------- load + cache ---------------- */
const cache = new Map<number, { at: number; access: Access | null }>();
const TTL_MS = 15_000;

export function invalidateAccess(userId?: number) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function loadAccess(userId: number): Promise<Access | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.access;

  await ensureAccessSchema();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT u.id, u.company_id, u.branch_id, u.name, u.status,
            r.id AS role_id, r.name AS role_name, r.is_system_role,
            COALESCE(a.custom, 0) AS custom
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN ${USER_ACCESS_TABLE} a ON a.user_id = u.id
      WHERE u.id = ?
      ORDER BY r.is_system_role DESC
      LIMIT 1`,
    [userId]
  );
  const u = (rows as Record<string, unknown>[])[0];
  if (!u || u.status !== "active") {
    cache.set(userId, { at: Date.now(), access: null });
    return null;
  }
  const isSuperAdmin = Number(u.is_system_role) === 1;
  const custom = Number(u.custom) === 1;
  let keys: string[] = [];
  if (isSuperAdmin) {
    keys = ALL_PERMISSION_KEYS;
  } else if (custom) {
    const [p] = await pool.query(`SELECT permission_key FROM ${USER_PERMS_TABLE} WHERE user_id = ?`, [userId]);
    keys = (p as { permission_key: string }[]).map((r) => r.permission_key);
  } else if (u.role_id) {
    const [p] = await pool.query(
      `SELECT p.permission_key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`,
      [u.role_id]
    );
    keys = (p as { permission_key: string }[]).map((r) => r.permission_key);
  }
  const access: Access = {
    userId: Number(u.id),
    companyId: Number(u.company_id),
    branchId: (u.branch_id as number) ?? null,
    name: String(u.name || ""),
    isSuperAdmin,
    roleId: u.role_id ? Number(u.role_id) : null,
    roleName: (u.role_name as string) || null,
    custom,
    perms: new Set(keys),
  };
  cache.set(userId, { at: Date.now(), access });
  return access;
}

/* ---------------- live sessions ----------------
   A token only works while its row is in `sessions` (written at login).
   Logout, password change or deactivation removes the row, so the old
   token stops working at once. Re-checked every 5s per token. */
const sessionCache = new Map<string, { at: number; ok: boolean }>();
const SESSION_TTL_MS = 5_000; // short: the page proxy keeps its own copy, so logout takes effect within seconds

export function forgetSession(token: string) {
  sessionCache.delete(token);
}

async function sessionIsLive(token: string, userId: number): Promise<boolean> {
  const hit = sessionCache.get(token);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.ok;
  let ok = true;
  try {
    const [rows] = await getPool().query(
      /* (prefix match too, in case the column ever stored a shortened token) */
      `SELECT 1 FROM sessions
        WHERE user_id = ? AND (token = ? OR (CHAR_LENGTH(token) >= 60 AND ? LIKE CONCAT(token, '%')))
          AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [userId, token, token]
    );
    ok = (rows as unknown[]).length > 0;
  } catch (e) {
    /* sessions table unreadable: don't lock everyone out, the JWT is still verified */
    console.error("[access] session check failed", e);
    ok = true;
  }
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(token, { at: Date.now(), ok });
  return ok;
}

export async function accessFromRequest(req: NextRequest): Promise<Access | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  if (!(await sessionIsLive(token, Number(payload.userId)))) return null;
  return loadAccess(Number(payload.userId));
}

export function can(a: Access | null | undefined, ...keys: string[]): boolean {
  if (!a) return false;
  if (a.isSuperAdmin) return true;
  return keys.some((k) => a.perms.has(k));
}

/* Use inside a route handler: const a = await requirePerm(req, "x.y"); if (a instanceof Response) return a; */
export async function requirePerm(req: NextRequest, ...keys: string[]): Promise<Access | NextResponse> {
  const a = await accessFromRequest(req);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (keys.length && !can(a, ...keys)) {
    return NextResponse.json({ error: "You don't have permission for this." }, { status: 403 });
  }
  return a;
}

/* Hide confidential columns from users without the permission */
export function stripFields<T extends Record<string, unknown>>(row: T, fields: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) if (f in out) out[f] = null;
  return out as T;
}
