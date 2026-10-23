import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { USER_ACCESS_TABLE, USER_PERMS_TABLE } from "@/lib/access";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;

export const phoneKey = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);

export interface UserInput {
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  password: string;
  branch_id: number | null;
  role_id: number | null;
  status: string;
  custom: boolean;
  permissions: string[];
}

export function parseUserInput(body: Record<string, unknown>): UserInput {
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
  const perms = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
  const valid = new Set(ALL_PERMISSION_KEYS);
  return {
    name: s(body.name).slice(0, 100),
    email: s(body.email).toLowerCase() || null,
    phone: s(body.phone) || null,
    username: s(body.username).toLowerCase().replace(/\s+/g, "") || null,
    password: body.password === undefined || body.password === null ? "" : String(body.password),
    branch_id: body.branch_id ? Number(body.branch_id) || null : null,
    role_id: body.role_id ? Number(body.role_id) || null : null,
    status: ["active", "inactive", "suspended"].includes(s(body.status)) ? s(body.status) : "active",
    custom: body.custom === true || body.custom === 1 || body.custom === "1",
    permissions: [...new Set(perms.filter((k) => valid.has(k)))],
  };
}

/* returns an error message or null */
export function validateUser(u: UserInput, isNew: boolean): string | null {
  if (!u.name) return "Name is required";
  if (!u.email && !u.phone && !u.username) return "Add at least an email, phone number or username for login";
  if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) return "Please enter a valid email address";
  if (u.phone && phoneKey(u.phone).length < 10) return "Phone number looks incomplete (e.g. 0300 1234567)";
  if (u.username && !/^[a-z0-9._-]{3,40}$/.test(u.username))
    return "Username: 3-40 letters / numbers (dot, dash, underscore allowed), no spaces";
  if (u.username && /^\d+$/.test(u.username)) return "Username can't be only numbers (that looks like a phone)";
  if ((isNew || u.password) && u.password.length < 8) return "Password must be at least 8 characters";
  return null;
}

/* duplicate login details anywhere (logins are not company-scoped) */
export async function findDuplicate(conn: Conn, u: UserInput, exceptId: number | null): Promise<string | null> {
  const ex = exceptId || 0;
  if (u.email) {
    const [r] = await conn.query("SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1", [u.email, ex]);
    if ((r as unknown[]).length) return "Another user already has this email";
    const [r2] = await conn.query("SELECT id FROM users WHERE LOWER(username) = ? AND id <> ? LIMIT 1", [u.email, ex]);
    if ((r2 as unknown[]).length) return "This email is already used as a username";
  }
  if (u.username) {
    const [r] = await conn.query(
      "SELECT id FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND id <> ? LIMIT 1",
      [u.username, u.username, ex]
    );
    if ((r as unknown[]).length) return "This username is already taken";
  }
  if (u.phone) {
    const [r] = await conn.query("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone <> '' AND id <> ?", [ex]);
    const key = phoneKey(u.phone);
    if ((r as { phone: string }[]).some((x) => phoneKey(x.phone) === key)) return "Another user already has this phone number";
  }
  return null;
}

export async function isSystemRole(conn: Conn, roleId: number | null, companyId: number): Promise<boolean> {
  if (!roleId) return false;
  const [r] = await conn.query("SELECT is_system_role FROM roles WHERE id = ? AND company_id = ?", [roleId, companyId]);
  const row = (r as { is_system_role: number }[])[0];
  return !!row && Number(row.is_system_role) === 1;
}

export async function roleExists(conn: Conn, roleId: number, companyId: number): Promise<boolean> {
  const [r] = await conn.query("SELECT id FROM roles WHERE id = ? AND company_id = ?", [roleId, companyId]);
  return (r as unknown[]).length > 0;
}

/* how many active Super Admins the company has (excluding one user) */
export async function activeSuperAdmins(conn: Conn, companyId: number, exceptUserId = 0): Promise<number> {
  const [r] = await conn.query(
    `SELECT COUNT(DISTINCT u.id) AS n FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles ro ON ro.id = ur.role_id AND ro.is_system_role = 1
      WHERE u.company_id = ? AND u.status = 'active' AND u.id <> ?`,
    [companyId, exceptUserId]
  );
  return Number((r as { n: number }[])[0]?.n || 0);
}

export async function saveUserAccess(conn: Conn, userId: number, u: UserInput, byUserId: number) {
  await conn.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  if (u.role_id) await conn.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, u.role_id]);
  await conn.query(
    `INSERT INTO ${USER_ACCESS_TABLE} (user_id, custom, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE custom = VALUES(custom), updated_by = VALUES(updated_by)`,
    [userId, u.custom ? 1 : 0, byUserId]
  );
  await conn.query(`DELETE FROM ${USER_PERMS_TABLE} WHERE user_id = ?`, [userId]);
  if (u.custom && u.permissions.length) {
    await conn.query(`INSERT INTO ${USER_PERMS_TABLE} (user_id, permission_key) VALUES ?`, [
      u.permissions.map((k) => [userId, k]),
    ]);
  }
}

export async function audit(
  conn: Conn,
  companyId: number,
  userId: number,
  action: string,
  entityId: number,
  values: Record<string, unknown>,
  req?: { headers: Headers }
) {
  try {
    const ip = req?.headers.get("x-forwarded-for")?.split(",")[0].trim() || req?.headers.get("x-real-ip") || null;
    const ua = req?.headers.get("user-agent") || null;
    await conn.query(
      `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`,
      [companyId, userId, action, entityId, JSON.stringify(values), ip, ua ? ua.slice(0, 500) : null]
    );
  } catch {
    /* audit is best-effort */
  }
}
