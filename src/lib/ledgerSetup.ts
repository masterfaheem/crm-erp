import { getPool } from "@/lib/db";
import { ensureHandoverTable } from "@/lib/orderHandover";
import { addCustomerPayment, ensureStockTable, recalcCustomer, recalcInvoice } from "@/lib/ledger";

/* ============================================================
   One-time setup for the khata (customer balance) + stock.
   Safe to call on every request: real work runs once per DB.
============================================================ */
let ready = false;

async function runOnce(key: string, fn: () => Promise<void>) {
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_meta (
       k VARCHAR(60) NOT NULL PRIMARY KEY,
       v VARCHAR(255) NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  const [rows] = await pool.query("SELECT v FROM crm_meta WHERE k = ?", [key]);
  if ((rows as unknown[]).length) return;
  await fn();
  await pool.query("INSERT IGNORE INTO crm_meta (k, v) VALUES (?, 'done')", [key]);
}

export async function ensureLedgerReady(): Promise<void> {
  if (ready) return;
  await ensureHandoverTable();
  await ensureStockTable();
  await runOnce("khata_v1", async () => {
    const pool = getPool();
    /* Bills marked paid before payments were recorded: keep them paid by
       adding the missing payment (so old walk-in sales don't show as dues). */
    const [gaps] = await pool.query(
      `SELECT i.id, i.company_id, i.branch_id, i.customer_id, i.invoice_number, i.invoice_date, i.created_by,
              i.grand_total, i.paid_amount, i.status,
              COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp
                         WHERE cp.invoice_id = i.id AND cp.company_id = i.company_id AND cp.status = 'cleared'), 0) AS recorded
         FROM invoices i
        WHERE i.status IN ('paid', 'partially_paid')`
    );
    for (const g of gaps as Record<string, unknown>[]) {
      const total = Number(g.grand_total) || 0;
      const recorded = Number(g.recorded) || 0;
      const target = g.status === "paid" ? total : Math.min(total, Number(g.paid_amount) || 0);
      const missing = Math.round((target - recorded) * 100) / 100;
      if (missing <= 0 || !g.customer_id) continue;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await addCustomerPayment(
          conn,
          { id: Number(g.created_by) || 0, company_id: Number(g.company_id), branch_id: (g.branch_id as number) ?? null },
          {
            customer_id: Number(g.customer_id),
            invoice_id: Number(g.id),
            amount: missing,
            method: "other",
            payment_date: g.invoice_date ? new Date(new Date(String(g.invoice_date)).getTime() + 5 * 3600000).toISOString().slice(0, 10) : null,
            notes: `Recorded before khata (${g.invoice_number})`,
          }
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        console.error("khata backfill (invoice) failed", g.id, e);
      } finally {
        conn.release();
      }
    }
    /* recompute every invoice + customer balance */
    const conn = await pool.getConnection();
    try {
      const [invs] = await conn.query("SELECT id, company_id FROM invoices");
      for (const i of invs as { id: number; company_id: number }[]) {
        await recalcInvoice(conn, i.id, i.company_id);
      }
      const [custs] = await conn.query("SELECT id, company_id FROM customers");
      for (const c of custs as { id: number; company_id: number }[]) {
        await recalcCustomer(conn, c.company_id, c.id);
      }
    } finally {
      conn.release();
    }
  });
  ready = true;
}
