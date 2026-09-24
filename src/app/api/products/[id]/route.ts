import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

/* ============================================================
   PUT  /api/products/:id
============================================================ */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? "").trim();
    const sku = String(body.sku ?? "").trim();
    const barcode = body.barcode ? String(body.barcode).trim() : null;
    const description = body.description
      ? String(body.description).trim()
      : null;
    const product_type =
      body.product_type === "service" ? "service" : "product";
    const category_id = body.category_id ? Number(body.category_id) : null;
    const unit_id = body.unit_id ? Number(body.unit_id) : null;
    const status =
      body.status === "inactive"
        ? "inactive"
        : body.status === "discontinued"
        ? "discontinued"
        : "active";
    const notes = body.notes ? String(body.notes).trim() : null;

    const purchase_price = Number(body.purchase_price) || 0;
    const sale_price = Number(body.sale_price) || 0;
    const wholesale_price = Number(body.wholesale_price) || 0;
    const tax_rate = Number(body.tax_rate) || 0;
    const discount_percent = Number(body.discount_percent) || 0;

    const track_inventory = body.track_inventory ? 1 : 0;
    const opening_stock = Number(body.opening_stock) || 0;
    const min_stock = Number(body.min_stock) || 0;
    const max_stock = Number(body.max_stock) || 0;
    const reorder_level = Number(body.reorder_level) || 0;

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }
    if (!sku) {
      return NextResponse.json(
        { error: "SKU is required." },
        { status: 400 }
      );
    }

    const [existing] = await query<any[]>(
      "SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }

    if (category_id) {
      const [cat] = await query<any[]>(
        "SELECT id FROM product_categories WHERE id = ? AND company_id = ? LIMIT 1",
        [category_id, companyId]
      );
      if (!cat) {
        return NextResponse.json(
          { error: "Category not found." },
          { status: 400 }
        );
      }
    }

    if (unit_id) {
      const [u] = await query<any[]>(
        "SELECT id FROM units WHERE id = ? AND company_id = ? LIMIT 1",
        [unit_id, companyId]
      );
      if (!u) {
        return NextResponse.json(
          { error: "Unit not found." },
          { status: 400 }
        );
      }
    }

    /* Unique SKU (excluding self) */
    const [dup] = await query<any[]>(
      "SELECT id FROM products WHERE company_id = ? AND sku = ? AND id <> ? LIMIT 1",
      [companyId, sku, id]
    );
    if (dup) {
      return NextResponse.json(
        { error: "Another product already uses this SKU." },
        { status: 409 }
      );
    }

    await query(
      `UPDATE products SET
         sku = ?, barcode = ?, name = ?, description = ?, product_type = ?,
         category_id = ?, unit_id = ?,
         purchase_price = ?, sale_price = ?, wholesale_price = ?,
         tax_rate = ?, discount_percent = ?,
         track_inventory = ?, opening_stock = ?, min_stock = ?,
         max_stock = ?, reorder_level = ?,
         notes = ?, status = ?
       WHERE id = ? AND company_id = ?`,
      [
        sku,
        barcode,
        name,
        description,
        product_type,
        category_id,
        unit_id,
        purchase_price,
        sale_price,
        wholesale_price,
        tax_rate,
        discount_percent,
        track_inventory,
        opening_stock,
        min_stock,
        max_stock,
        reorder_level,
        notes,
        status,
        id,
        companyId,
      ]
    );

    const [row] = await query<any[]>(
      `SELECT
         p.id, p.sku, p.barcode, p.name, p.description, p.product_type,
         p.purchase_price, p.sale_price, p.wholesale_price,
         p.tax_rate, p.discount_percent,
         p.min_stock, p.max_stock, p.reorder_level, p.opening_stock,
         p.track_inventory, p.image_path, p.status, p.notes, p.created_at,
         p.category_id, c.name AS category_name, c.color AS category_color,
         p.unit_id, u.name AS unit_name, u.short_name AS unit_short_name
       FROM products p
       LEFT JOIN product_categories c
         ON c.id = p.category_id AND c.company_id = p.company_id
       LEFT JOIN units u
         ON u.id = p.unit_id AND u.company_id = p.company_id
       WHERE p.id = ? AND p.company_id = ?`,
      [id, companyId]
    );

    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("[PUT /api/products/:id]", err);
    return NextResponse.json(
      { error: "Failed to update product." },
      { status: 500 }
    );
  }
}

/* ============================================================
   DELETE  /api/products/:id
============================================================ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const [existing] = await query<any[]>(
      "SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1",
      [id, companyId]
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }

    await query("DELETE FROM products WHERE id = ? AND company_id = ?", [
      id,
      companyId,
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/products/:id]", err);
    return NextResponse.json(
      { error: "Failed to delete product." },
      { status: 500 }
    );
  }
}
