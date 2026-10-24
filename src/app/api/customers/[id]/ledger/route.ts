import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ensureLedgerReady } from "@/lib/ledgerSetup";

/* GET /api/customers/:id/ledger — customer khata (statement)
   opening balance + bills (debit) − payments (credit), with running balance */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    await ensureLedgerReady().catch((e) => console.error("ledger setup", e));
    const [c] = await query<Record<string, unknown>[]>(
      `SELECT id, name, customer_code, opening_balance, balance_type, current_balance, created_at
         FROM customers WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!c) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

    const bills = await query<Record<string, unknown>[]>(
      `SELECT i.id, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS d, i.invoice_number AS num,
              i.grand_total AS amount, i.status, i.created_at
         FROM invoices i
        WHERE i.company_id = ? AND i.customer_id = ? AND i.status NOT IN ('cancelled', 'draft')`,
      [companyId, id]
    );
    const pays = await query<Record<string, unknown>[]>(
      `SELECT cp.id, DATE_FORMAT(cp.payment_date, '%Y-%m-%d') AS d, cp.payment_number AS num,
              cp.amount, cp.method, cp.reference, cp.notes, cp.created_at, i.invoice_number
         FROM customer_payments cp
         LEFT JOIN invoices i ON i.id = cp.invoice_id
        WHERE cp.company_id = ? AND cp.customer_id = ? AND cp.status = 'cleared'`,
      [companyId, id]
    );

    /* money paid back (cancelled bill / exchange to a cheaper model) */
    let refunds: Record<string, unknown>[] = [];
    try {
      refunds = await query<Record<string, unknown>[]>(
        `SELECT r.id, DATE_FORMAT(r.refund_date, '%Y-%m-%d') AS d, r.refund_number AS num, r.amount, r.method,
                r.reason, r.created_at, i.invoice_number
           FROM crm_customer_refunds r LEFT JOIN invoices i ON i.id = r.invoice_id
          WHERE r.company_id = ? AND r.customer_id = ?`,
        [companyId, id]
      );
    } catch {
      /* no refunds table yet */
    }

    type Entry = {
      date: string;
      type: "bill" | "payment" | "refund";
      ref_id: number;
      number: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
      sort: string;
    };
    const entries: Entry[] = [
      ...bills.map((b) => ({
        date: String(b.d),
        type: "bill" as const,
        ref_id: Number(b.id),
        number: String(b.num),
        /* an exchange to a cheaper model is a credit to the customer */
        description: String(b.num).startsWith("EXC-")
          ? Number(b.amount) < 0 ? "Exchange credit" : "Exchange difference"
          : "Sale bill",
        debit: Math.max(0, Number(b.amount) || 0),
        credit: Math.max(0, -(Number(b.amount) || 0)),
        balance: 0,
        sort: `${b.d} 0 ${new Date(String(b.created_at)).getTime()}`,
      })),
      ...pays.map((p) => ({
        date: String(p.d),
        type: "payment" as const,
        ref_id: Number(p.id),
        number: String(p.num),
        description:
          [p.reference, p.invoice_number ? `for ${p.invoice_number}` : null, p.notes].filter(Boolean).join(" · ") ||
          "Payment received",
        method: String(p.method || ""),
        debit: 0,
        credit: Number(p.amount) || 0,
        balance: 0,
        sort: `${p.d} 1 ${new Date(String(p.created_at)).getTime()}`,
      })),
      ...refunds.map((r) => ({
        date: String(r.d),
        type: "refund" as const,
        ref_id: Number(r.id),
        number: String(r.num),
        description: ["Refund paid", r.invoice_number ? `for ${r.invoice_number}` : null, r.reason].filter(Boolean).join(" · "),
        method: String(r.method || ""),
        debit: Number(r.amount) || 0,
        credit: 0,
        balance: 0,
        sort: `${r.d} 2 ${new Date(String(r.created_at)).getTime()}`,
      })),
    ].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));

    const opening = (Number(c.opening_balance) || 0) * (c.balance_type === "credit" ? -1 : 1);
    let run = opening;
    for (const e of entries) {
      run = Math.round((run + e.debit - e.credit) * 100) / 100;
      e.balance = run;
    }
    const totalBills = entries.reduce((a, e) => a + e.debit, 0);
    const totalPaid = entries.reduce((a, e) => a + e.credit, 0);

    return NextResponse.json({
      data: entries.reverse().map((e) => {
        const out: Partial<Entry> = { ...e };
        delete out.sort;
        return out;
      }),
      summary: {
        opening,
        total_bills: totalBills,
        total_paid: totalPaid,
        balance: run,
      },
    });
  } catch (err) {
    console.error("[GET /api/customers/:id/ledger]", err);
    return NextResponse.json({ error: "Unable to load khata." }, { status: 500 });
  }
}
