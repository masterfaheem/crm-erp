import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

/* Best-effort audit trail (Settings > Audit Logs). Never blocks the action. */
export async function writeAudit(
  req: NextRequest,
  user: { id: number; company_id: number },
  action: string,
  entityType: string,
  entityId: number | null
) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    const ua = req.headers.get("user-agent");
    await getPool().query(
      `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.company_id, user.id, action.slice(0, 50), entityType.slice(0, 50), entityId, ip, ua ? ua.slice(0, 500) : null]
    );
  } catch (e) {
    console.error("[audit] write failed", e);
  }
}
