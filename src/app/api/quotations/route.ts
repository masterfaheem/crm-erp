import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

async function nextQuoteNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await query<Array<{ c: number }>>(
    "SELECT COUNT(*) AS c FROM quotations WHERE company_id = ? AND YEAR(created_at) = ?",
    [companyId, year]
  );
  const seq = (row?.c ?? 0) + 1;
  return `QT-${year}-${String(seq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const customerId = (searchParams.get("customer_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const offset = (page - 1) * limit;

    const where: string[] = ["q.company_id = ?"];
    const params: any[] = [companyId];
    if (search) { where.push("(q.quote_number LIKE ? OR c.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (status) { where.push("q.status = ?"); params.push(status); }
    if (customerId && Number.isFinite(Number(customerId))) { where.push("q.customer_id = ?"); params.push(Number(customerId)); }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id ${whereSql}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT q.id, q.quote_number, q.customer_id, c.name AS customer_name,
              q.quote_date, q.valid_until, q.status,
              q.subtotal, q.tax_total, q.discount_total, q.shipping_total, q.grand_total,
              q.notes, q.created_at,
              COALESCE(items.cnt, 0) AS item_count
         FROM quotations q
         LEFT JOIN customers c ON c.id = q.customer_id
         LEFT JOIN (
           SELECT quotation_id, COUNT(*) AS cnt FROM quotation_items GROUP BY quotation_id
         ) items ON items.quotation_id = q.id
         ${whereSql}
         ORDER BY q.created_at DESC, q.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total_quotations }] = await query<Array<{ total_quotations: number }>>(
      "SELECT COUNT(*) AS total_quotations FROM quotations WHERE company_id = ?",
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
      total_quotations,
    });
  } catch (err) {
    console.error("[GET /api/quotations]", err);
    return NextResponse.json({ error: "Unable to load quotations." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const body = await req.json().catch(() => ({}));
    const customer_id = Number(body.customer_id);
    const quote_date = String(body.quote_date || "").slice(0, 10);
    const valid_until = body.valid_until ? String(body.valid_until).slice(0, 10) : null;
    const status = String(body.status || "draft");
    const notes = body.notes ? String(body.notes).trim() : null;
    const terms = body.terms ? String(body.terms).trim() : null;

    const items: Array<{
      product_id: number | null; description: string;
      quantity: number; unit_price: number; tax_rate: number; discount_percent: number;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!customer_id) return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    if (!quote_date) return NextResponse.json({ error: "Quote date is required." }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });

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
      subtotal += sub; discount_total += line_discount; tax_total += line_tax; grand_total += line_total;
      return {
        product_id: it.product_id ?? null,
        description: String(it.description || "").trim(),
        quantity: qty, unit_price: price, tax_rate: tax, discount_percent: disc,
        line_subtotal: sub, line_tax, line_discount, line_total,
      };
    });

    await conn.beginTransaction();
    const quote_number = await nextQuoteNumber(companyId);
    const [ins] = await conn.query<any>(
      `INSERT INTO quotations
         (company_id, branch_id, quote_number, customer_id, quote_date, valid_until,
          status, subtotal, tax_total, discount_total, shipping_total, grand_total,
          notes, terms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        companyId, user.branch_id ?? null, quote_number, customer_id, quote_date, valid_until,
        status, subtotal, tax_total, discount_total, grand_total, notes, terms, user.id,
      ]
    );
    const quoteId = ins.insertId;

    for (const p of prepared) {
      await conn.query(
        `INSERT INTO quotation_items
           (quotation_id, product_id, description, quantity, unit_price, tax_rate, discount_percent,
            line_subtotal, line_tax, line_discount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteId, p.product_id, p.description, p.quantity, p.unit_price, p.tax_rate,
         p.discount_percent, p.line_subtotal, p.line_tax, p.line_discount, p.line_total]
      );
    }

    await conn.commit(); conn.release();

    const [row] = await query<any[]>(
      `SELECT q.*, c.name AS customer_name FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.id = ? AND q.company_id = ?`,
      [quoteId, companyId]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error("[POST /api/quotations]", err);
    return NextResponse.json({ error: "Failed to create quotation." }, { status: 500 });
  }
}
