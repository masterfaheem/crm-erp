import { getPool } from "@/lib/db";
import { isExchangeNo } from "@/lib/format";

/* ============================================================
   LEDGER HELPERS — invoices, payments, customer balance, stock
   One place for the money/stock rules so every screen agrees.
============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;

export const STOCK_TABLE = "crm_stock_moves";

/* customer_payments.method values (DB may use an ENUM) */
export const PAYMENT_METHOD_MAP: Record<string, string> = {
  bank: "bank_transfer",
  bank_transfer: "bank_transfer",
  cash: "cash",
  card: "card",
  jazzcash: "online",
  easypaisa: "online",
  wallet: "online",
  online: "online",
  cheque: "cheque",
};
export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  wallet: "JazzCash / Easypaisa",
  cash: "Cash",
  card: "Card (POS machine)",
  none: "Not paid yet",
};

/* ---------------- refunds (money paid back to a customer) ----------------
   Kept in crm_customer_refunds (see salesOps.ts). 0 if the table doesn't exist yet. */
export const REFUND_TABLE = "crm_customer_refunds";
async function refundTotal(conn: Conn, companyId: number, col: "invoice_id" | "customer_id", id: number) {
  try {
    const [[r]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM ${REFUND_TABLE} WHERE company_id = ? AND ${col} = ?`,
      [companyId, id]
    );
    return Number(r?.t || 0);
  } catch (e) {
    if ((e as { code?: string })?.code === "ER_NO_SUCH_TABLE") return 0;
    throw e;
  }
}

/* ---------------- invoice paid / balance ---------------- */
export async function recalcInvoice(conn: Conn, invoiceId: number, companyId: number) {
  const [[sum]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM customer_payments
      WHERE company_id = ? AND invoice_id = ? AND status = 'cleared'`,
    [companyId, invoiceId]
  );
  /* paid on this bill = received - refunded */
  const paidRaw = Number(sum?.paid ?? 0) - (await refundTotal(conn, companyId, "invoice_id", invoiceId));
  const [[inv]] = await conn.query(
    "SELECT grand_total, status, customer_id, invoice_number FROM invoices WHERE id = ? AND company_id = ?",
    [invoiceId, companyId]
  );
  if (!inv) return;
  const total = Number(inv.grand_total ?? 0);
  const paid = Math.round(paidRaw * 100) / 100;
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  let status = "unpaid";
  if (paid >= total && total > 0) status = "paid";
  else if (balance === 0 && invoiceIsCredit(total, inv.invoice_number)) status = "paid"; // exchange: nothing to collect
  else if (paid > 0) status = "partially_paid";
  if (inv.status === "cancelled" || inv.status === "draft") status = inv.status;
  await conn.query(
    "UPDATE invoices SET paid_amount = ?, balance = ?, status = ? WHERE id = ? AND company_id = ?",
    [paid, balance, status, invoiceId, companyId]
  );
  if (inv.customer_id) await recalcCustomer(conn, companyId, Number(inv.customer_id));
}

/* a bill whose total is negative is a credit to the customer (exchange to a cheaper model) */
function invoiceIsCredit(total: number, invoiceNumber: unknown) {
  return total < 0 || (total === 0 && isExchangeNo(invoiceNumber));
}

/* ---------------- customer khata ----------------
   current_balance  > 0  -> customer owes us (due)
   current_balance  < 0  -> customer has paid extra (advance)
   opening_balance + balance_type (debit/credit) are the opening entry. */
export async function recalcCustomer(conn: Conn, companyId: number, customerId: number) {
  if (!customerId) return;
  const [[c]] = await conn.query(
    "SELECT opening_balance, balance_type FROM customers WHERE id = ? AND company_id = ?",
    [customerId, companyId]
  );
  if (!c) return;
  const opening = Number(c.opening_balance || 0) * (c.balance_type === "credit" ? -1 : 1);
  const [[inv]] = await conn.query(
    `SELECT COALESCE(SUM(grand_total), 0) AS t FROM invoices
      WHERE company_id = ? AND customer_id = ? AND status NOT IN ('cancelled', 'draft')`,
    [companyId, customerId]
  );
  const [[pay]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM customer_payments
      WHERE company_id = ? AND customer_id = ? AND status = 'cleared'`,
    [companyId, customerId]
  );
  const refunded = await refundTotal(conn, companyId, "customer_id", customerId);
  const net = Math.round((opening + Number(inv.t) - Number(pay.t) + refunded) * 100) / 100;
  await conn.query("UPDATE customers SET current_balance = ? WHERE id = ? AND company_id = ?", [
    net,
    customerId,
    companyId,
  ]);
}

/* ---------------- payment numbers ---------------- */
export async function nextCustomerPaymentNumber(conn: Conn, companyId: number): Promise<string> {
  return nextDocNumber("customer_payments", "payment_number", "CP", companyId, conn);
}

/* Record a cleared customer payment (POS / online-order payment) */
export async function addCustomerPayment(
  conn: Conn,
  user: { id: number; company_id: number; branch_id: number | null },
  p: {
    customer_id: number;
    invoice_id: number | null;
    amount: number;
    method: string;
    reference?: string | null;
    payment_date?: string | null;
    notes?: string | null;
  }
) {
  const amount = Math.round(Number(p.amount) * 100) / 100;
  if (!(amount > 0)) return null;
  const method = PAYMENT_METHOD_MAP[p.method] || "other";
  const walletName =
    p.method === "jazzcash" ? "JazzCash" : p.method === "easypaisa" ? "Easypaisa" : p.method === "wallet" ? "Wallet" : null;
  const reference = [walletName, p.reference].filter(Boolean).join(" ") || null;
  const date = p.payment_date || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const num = await nextCustomerPaymentNumber(conn, user.company_id);
  const [res] = await conn.query(
    `INSERT INTO customer_payments
       (company_id, branch_id, payment_number, customer_id, invoice_id, payment_date, amount,
        method, reference, bank_name, cheque_number, cheque_date, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'cleared', ?, ?)`,
    [user.company_id, user.branch_id ?? null, num, p.customer_id, p.invoice_id, date, amount, method, reference, p.notes || null, user.id]
  );
  return (res as { insertId: number }).insertId;
}

/* ============================================================
   STOCK — opening_stock + movements
   purchase bill  -> +qty     invoice -> -qty     adjustment -> ±qty
============================================================ */
let stockReady = false;
export async function ensureStockTable(): Promise<void> {
  if (stockReady) return;
  const pool = getPool();
  const [exists] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [STOCK_TABLE]
  );
  const isNew = Number((exists as { n: number }[])[0]?.n || 0) === 0;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STOCK_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      qty DECIMAL(14,3) NOT NULL,
      move_type VARCHAR(20) NOT NULL,
      ref_type VARCHAR(20) NULL,
      ref_id INT UNSIGNED NULL,
      ref_number VARCHAR(40) NULL,
      note VARCHAR(255) NULL,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_product (company_id, product_id),
      KEY idx_ref (ref_type, ref_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (isNew) {
    // one-time: bring stock in line with bills/invoices made before tracking existed
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [bills] = await conn.query(
        "SELECT id, company_id, bill_number FROM purchase_bills WHERE status <> 'cancelled'"
      );
      for (const b of bills as { id: number; company_id: number; bill_number: string }[]) {
        await syncDocStock(conn, b.company_id, "purchase_bill", b.id, null);
      }
      const [invs] = await conn.query(
        "SELECT id, company_id FROM invoices WHERE status NOT IN ('cancelled', 'draft')"
      );
      for (const i of invs as { id: number; company_id: number }[]) {
        await syncDocStock(conn, i.company_id, "invoice", i.id, null);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error("stock backfill failed", e);
    } finally {
      conn.release();
    }
  }
  stockReady = true;
}

/* SQL expression for a product's live stock (alias p = products) */
export const STOCK_SQL = `(COALESCE(p.opening_stock, 0) + COALESCE((SELECT SUM(m.qty) FROM ${STOCK_TABLE} m WHERE m.product_id = p.id AND m.company_id = p.company_id), 0))`;

/* Re-create the stock movements of one document from its items */
export async function syncDocStock(
  conn: Conn,
  companyId: number,
  refType: "purchase_bill" | "invoice",
  refId: number,
  userId: number | null
) {
  await conn.query(`DELETE FROM ${STOCK_TABLE} WHERE company_id = ? AND ref_type = ? AND ref_id = ?`, [
    companyId,
    refType,
    refId,
  ]);
  const isBill = refType === "purchase_bill";
  const [[doc]] = await conn.query(
    isBill
      ? "SELECT bill_number AS num, status FROM purchase_bills WHERE id = ? AND company_id = ?"
      : "SELECT invoice_number AS num, status FROM invoices WHERE id = ? AND company_id = ?",
    [refId, companyId]
  );
  if (!doc || doc.status === "cancelled" || doc.status === "draft") return;
  const [items] = await conn.query(
    isBill
      ? `SELECT it.product_id, SUM(it.quantity) AS q FROM purchase_bill_items it
           JOIN products p ON p.id = it.product_id
          WHERE it.purchase_bill_id = ? AND p.company_id = ?
            AND COALESCE(p.track_inventory, 1) = 1 AND COALESCE(p.product_type, 'product') = 'product'
          GROUP BY it.product_id`
      : `SELECT it.product_id, SUM(it.quantity) AS q FROM invoice_items it
           JOIN products p ON p.id = it.product_id
          WHERE it.invoice_id = ? AND p.company_id = ?
            AND COALESCE(p.track_inventory, 1) = 1 AND COALESCE(p.product_type, 'product') = 'product'
          GROUP BY it.product_id`,
    [refId, companyId]
  );
  for (const it of items as { product_id: number; q: number }[]) {
    const q = Number(it.q) || 0;
    if (!q) continue;
    await conn.query(
      `INSERT INTO ${STOCK_TABLE} (company_id, product_id, qty, move_type, ref_type, ref_id, ref_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, it.product_id, isBill ? q : -q, isBill ? "purchase" : "sale", refType, refId, doc.num, userId]
    );
  }
}

export async function removeDocStock(conn: Conn, companyId: number, refType: string, refId: number) {
  await conn.query(`DELETE FROM ${STOCK_TABLE} WHERE company_id = ? AND ref_type = ? AND ref_id = ?`, [
    companyId,
    refType,
    refId,
  ]);
}

/* ============================================================
   DOCUMENT NUMBERS — next = highest existing number + 1
   (COUNT-based numbers repeat after a delete)
============================================================ */
export async function nextDocNumber(
  table: string,
  column: string,
  prefix: string,
  companyId: number,
  conn?: Conn
): Promise<string> {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const db = conn || getPool();
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(${column}, '-', -1) AS UNSIGNED)) AS m
       FROM ${table} WHERE company_id = ? AND ${column} LIKE ?`,
    [companyId, like]
  );
  const seq = Number((rows as { m: number | null }[])[0]?.m || 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}
