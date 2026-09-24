import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

async function nextBillNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await query<Array<{ c: number }>>(
    `SELECT COUNT(*) AS c FROM purchase_bills
      WHERE company_id = ? AND YEAR(created_at) = ?`,
    [companyId, year]
  );
  const seq = (row?.c ?? 0) + 1;
  return `PB-${year}-${String(seq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const supplierId = (searchParams.get("supplier_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["pb.company_id = ?"];
    const params: any[] = [companyId];

    if (search) {
      where.push("(pb.bill_number LIKE ? OR pb.supplier_invoice LIKE ? OR s.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push("pb.status = ?"); params.push(status); }
    if (supplierId && Number.isFinite(Number(supplierId))) {
      where.push("pb.supplier_id = ?");
      params.push(Number(supplierId));
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
         FROM purchase_bills pb
         LEFT JOIN suppliers s ON s.id = pb.supplier_id
         ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT
         pb.id, pb.bill_number, pb.supplier_invoice,
         pb.supplier_id, s.name AS supplier_name,
         pb.purchase_order_id, po.po_number,
         pb.bill_date, pb.due_date, pb.status,
         pb.subtotal, pb.tax_total, pb.discount_total, pb.shipping_total,
         pb.grand_total, pb.paid_amount, pb.balance,
         pb.notes, pb.created_at,
         COALESCE(items.cnt, 0) AS item_count
       FROM purchase_bills pb
       LEFT JOIN suppliers s ON s.id = pb.supplier_id
       LEFT JOIN purchase_orders po ON po.id = pb.purchase_order_id
       LEFT JOIN (
         SELECT purchase_bill_id, COUNT(*) AS cnt
           FROM purchase_bill_items
          GROUP BY purchase_bill_id
       ) items ON items.purchase_bill_id = pb.id
       ${whereSql}
       ORDER BY pb.created_at DESC, pb.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_bills }] = await query<Array<{ total_bills: number }>>(
      `SELECT COUNT(*) AS total_bills FROM purchase_bills WHERE company_id = ?`,
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_bills,
    });
  } catch (err) {
    console.error("[GET /api/purchase-bills]", err);
    return NextResponse.json({ error: "Unable to load purchase bills." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;
  const branchId = user.branch_id ?? null;
  const userId = user.id;

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => ({}));

    const supplier_id = Number(body.supplier_id);
    const supplier_invoice = body.supplier_invoice ? String(body.supplier_invoice).trim() : null;
    const purchase_order_id = body.purchase_order_id ? Number(body.purchase_order_id) : null;
    const bill_date = String(body.bill_date || "").slice(0, 10);
    const due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
    const status = String(body.status || "unpaid");
    const notes = body.notes ? String(body.notes).trim() : null;
    const paid_amount = Number(body.paid_amount) || 0;

    const items: Array<{
      product_id: number | null;
      description: string;
      quantity: number;
      unit_price: number;
      tax_rate: number;
      discount_percent: number;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!supplier_id) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }
    if (!bill_date) {
      return NextResponse.json({ error: "Bill date is required." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }

    let subtotal = 0, tax_total = 0, discount_total = 0, grand_total = 0;
    const prepared = items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const tax = Number(it.tax_rate) || 0;
      const disc = Number(it.discount_percent) || 0;
      const sub = qty * price;
      const line_discount = (sub * disc) / 100;
      const afterDisc = sub - line_discount;
      const line_tax = (afterDisc * tax) / 100;
      const line_total = afterDisc + line_tax;
      subtotal += sub;
      discount_total += line_discount;
      tax_total += line_tax;
      grand_total += line_total;
      return {
        product_id: it.product_id ?? null,
        description: String(it.description || "").trim(),
        quantity: qty, unit_price: price,
        tax_rate: tax, discount_percent: disc,
        line_subtotal: sub, line_tax, line_discount, line_total,
      };
    });

    const balance = Math.max(0, grand_total - paid_amount);

    await conn.beginTransaction();

    const bill_number = await nextBillNumber(companyId);

    const [insertRes] = await conn.query<any>(
      `INSERT INTO purchase_bills
         (company_id, branch_id, bill_number, supplier_invoice, supplier_id,
          purchase_order_id, bill_date, due_date, status,
          subtotal, tax_total, discount_total, shipping_total, grand_total,
          paid_amount, balance, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        companyId, branchId, bill_number, supplier_invoice, supplier_id,
        purchase_order_id, bill_date, due_date, status,
        subtotal, tax_total, discount_total, grand_total,
        paid_amount, balance, notes, userId,
      ]
    );

    const billId = insertRes.insertId;

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO purchase_bill_items
           (purchase_bill_id, product_id, description, quantity,
            unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billId, p.product_id, p.description, p.quantity,
          p.unit_price, p.tax_rate, p.discount_percent,
          p.line_subtotal, p.line_tax, p.line_discount, p.line_total,
        ]
      );
    }

    await conn.commit();
    conn.release();

    const [row] = await query<any[]>(
      `SELECT pb.*, s.name AS supplier_name
         FROM purchase_bills pb
         LEFT JOIN suppliers s ON s.id = pb.supplier_id
        WHERE pb.id = ? AND pb.company_id = ?`,
      [billId, companyId]
    );

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    conn.release();
    console.error("[POST /api/purchase-bills]", err);
    return NextResponse.json({ error: "Failed to create purchase bill." }, { status: 500 });
  }
}
