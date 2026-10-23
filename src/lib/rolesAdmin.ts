import { ALL_PERMISSION_KEYS } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;

/* Accepts permission_keys (preferred) or legacy permission_ids -> permission ids */
export async function resolvePermissionIds(conn: Conn, body: Record<string, unknown>): Promise<number[]> {
  if (Array.isArray(body.permission_keys)) {
    const valid = new Set(ALL_PERMISSION_KEYS);
    const keys = [...new Set(body.permission_keys.map(String).filter((k) => valid.has(k)))];
    if (!keys.length) return [];
    const [rows] = await conn.query("SELECT id FROM permissions WHERE permission_key IN (?)", [keys]);
    return (rows as { id: number }[]).map((r) => Number(r.id));
  }
  if (Array.isArray(body.permission_ids)) {
    return [...new Set(body.permission_ids.map((n) => Number(n)).filter(Boolean))];
  }
  return [];
}

export async function roleKeys(conn: Conn, roleId: number): Promise<string[]> {
  const [rows] = await conn.query(
    "SELECT p.id, p.permission_key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?",
    [roleId]
  );
  return (rows as { permission_key: string }[]).map((r) => r.permission_key);
}
