import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

/* ============================================================
   Helper: generate PO number  (PO-YYYY-NNNN)
============================================================ */
async function nextPoNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await query<Array<{ c: number }>>(
    `SELECT COUNT(*) AS c FROM purchase_orders
      WHERE company_id = ? AND YEAR(created_at) = ?`,
    [companyId, year]
  );
  const seq = (row?.c ?? 0) + 1;
  return `PO-${year}-${String(seq).padStart(4, "0")}`;
}

/* ============================================================
   GET  /api/purchase-orders
============================================================ */
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

    const where: string[] = ["po.company_id = ?"];
    const params: any[] = [companyId];

    if (search) {
      where.push("(po.po_number LIKE ? OR s.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) { where.push("po.status = ?"); params.push(status); }
    if (supplierId && Number.isFinite(Number(supplierId))) {
      where.push("po.supplier_id = ?");
      params.push(Number(supplierId));
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po.supplier_id
         ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT
         po.id, po.po_number, po.supplier_id, s.name AS supplier_name,
         po.order_date, po.expected_date, po.status,
         po.subtotal, po.tax_total, po.discount_total, po.shipping_total,
         po.grand_total, po.notes, po.created_at,
         COALESCE(items.cnt, 0) AS item_count
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN (
         SELECT purchase_order_id, COUNT(*) AS cnt
           FROM purchase_order_items
          GROUP BY purchase_order_id
       ) items ON items.purchase_order_id = po.id
       ${whereSql}
       ORDER BY po.created_at DESC, po.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_orders }] = await query<Array<{ total_orders: number }>>(
      `SELECT COUNT(*) AS total_orders FROM purchase_orders WHERE company_id = ?`,
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_orders,
    });
  } catch (err) {
    console.error("[GET /api/purchase-orders]", err);
    return NextResponse.json({ error: "Unable to load purchase orders." }, { status: 500 });
  }
}

/* ============================================================
   POST /api/purchase-orders   (transaction: header + items)
============================================================ */
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
    const order_date = String(body.order_date || "").slice(0, 10);
    const expected_date = body.expected_date ? String(body.expected_date).slice(0, 10) : null;
    const status = String(body.status || "draft");
    const notes = body.notes ? String(body.notes).trim() : null;

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
    if (!order_date) {
      return NextResponse.json({ error: "Order date is required." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }

    /* Compute totals server-side */
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
        quantity: qty,
        unit_price: price,
        tax_rate: tax,
        discount_percent: disc,
        line_subtotal: sub,
        line_tax,
        line_discount,
        line_total,
      };
    });

    await conn.beginTransaction();

    const po_number = await nextPoNumber(companyId);

    const [insertRes] = await conn.query<any>(
      `INSERT INTO purchase_orders
         (company_id, branch_id, po_number, supplier_id, order_date, expected_date,
          status, subtotal, tax_total, discount_total, shipping_total, grand_total,
          notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        companyId, branchId, po_number, supplier_id, order_date, expected_date,
        status, subtotal, tax_total, discount_total, grand_total, notes, userId,
      ]
    );

    const poId = insertRes.insertId;

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO purchase_order_items
           (purchase_order_id, product_id, description, quantity,
            unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          poId, p.product_id, p.description, p.quantity,
          p.unit_price, p.tax_rate, p.discount_percent,
          p.line_subtotal, p.line_tax, p.line_discount, p.line_total,
        ]
      );
    }

    await conn.commit();
    conn.release();

    const [row] = await query<any[]>(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ? AND po.company_id = ?`,
      [poId, companyId]
    );

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    conn.release();
    console.error("[POST /api/purchase-orders]", err);
    return NextResponse.json({ error: "Failed to create purchase order." }, { status: 500 });
  }
}
