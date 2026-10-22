import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { ensureStockTable, STOCK_SQL, STOCK_TABLE } from "@/lib/ledger";

/* GET  /api/inventory/moves?product_id=  -> stock history of one product
   POST /api/inventory/moves                -> manual stock adjustment
        { product_id, mode: "add" | "remove" | "set", qty, note } */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  try {
    await ensureStockTable();
    const productId = Number(new URL(req.url).searchParams.get("product_id") || 0);
    if (!productId) return NextResponse.json({ error: "product_id is required." }, { status: 400 });
    const [product] = await query<Record<string, unknown>[]>(
      `SELECT p.id, p.name, p.sku, p.opening_stock, ${STOCK_SQL} AS current_stock
         FROM products p WHERE p.id = ? AND p.company_id = ?`,
      [productId, companyId]
    );
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const rows = await query<Record<string, unknown>[]>(
      `SELECT m.id, m.qty, m.move_type, m.ref_type, m.ref_id, m.ref_number, m.note, m.created_at,
              u.name AS created_by_name
         FROM ${STOCK_TABLE} m
         LEFT JOIN users u ON u.id = m.created_by
        WHERE m.company_id = ? AND m.product_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 200`,
      [companyId, productId]
    );
    return NextResponse.json({
      product: { ...product, current_stock: Number(product.current_stock) || 0 },
      data: rows.map((r) => ({ ...r, qty: Number(r.qty) || 0 })),
    });
  } catch (err) {
    console.error("[GET /api/inventory/moves]", err);
    return NextResponse.json({ error: "Unable to load stock history." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const companyId = user.company_id;
  try {
    await ensureStockTable();
    const body = await req.json().catch(() => ({}));
    const productId = Number(body.product_id);
    const mode = String(body.mode || "add");
    const qty = Number(body.qty);
    const note = String(body.note || "").trim().slice(0, 250);
    if (!productId) return NextResponse.json({ error: "Product is required." }, { status: 400 });
    if (!Number.isFinite(qty) || qty < 0 || (mode !== "set" && qty === 0)) {
      return NextResponse.json({ error: "Enter a valid quantity." }, { status: 400 });
    }
    if (!note) return NextResponse.json({ error: "Reason is required (e.g. damaged, count correction)." }, { status: 400 });

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [[p]] = (await conn.query(
        `SELECT p.id, p.name, ${STOCK_SQL} AS current_stock FROM products p
          WHERE p.id = ? AND p.company_id = ? FOR UPDATE`,
        [productId, companyId]
      )) as unknown as [Array<{ id: number; name: string; current_stock: number }>];
      if (!p) {
        await conn.rollback();
        return NextResponse.json({ error: "Product not found." }, { status: 404 });
      }
      const current = Number(p.current_stock) || 0;
      const change = mode === "set" ? qty - current : mode === "remove" ? -qty : qty;
      if (change === 0) {
        await conn.rollback();
        return NextResponse.json({ error: "Stock is already at that quantity." }, { status: 400 });
      }
      await conn.query(
        `INSERT INTO ${STOCK_TABLE} (company_id, product_id, qty, move_type, ref_type, note, created_by)
         VALUES (?, ?, ?, 'adjustment', 'adjustment', ?, ?)`,
        [companyId, productId, change, note, user.id]
      );
      await conn.commit();
      return NextResponse.json({ success: true, change, current_stock: current + change });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("[POST /api/inventory/moves]", err);
    return NextResponse.json({ error: "Failed to adjust stock." }, { status: 500 });
  }
}
