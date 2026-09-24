import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";

/* ============================================================
   GET  /api/products
   Query: search, status, product_type, category_id, page, limit
============================================================ */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const type = (searchParams.get("product_type") || "").trim();
    const categoryId = (searchParams.get("category_id") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get("limit") || 50))
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["p.company_id = ?"];
    const params: any[] = [companyId];

    if (search) {
      where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status === "active" || status === "inactive" || status === "discontinued") {
      where.push("p.status = ?");
      params.push(status);
    }
    if (type === "product" || type === "service") {
      where.push("p.product_type = ?");
      params.push(type);
    }
    if (categoryId && Number.isFinite(Number(categoryId))) {
      where.push("p.category_id = ?");
      params.push(Number(categoryId));
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    /* -------- Total count -------- */
    const [{ total }] = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
      params
    );

    /* -------- Rows -------- */
    const rows = await query<any[]>(
      `SELECT
         p.id,
         p.sku,
         p.barcode,
         p.name,
         p.description,
         p.product_type,
         p.purchase_price,
         p.sale_price,
         p.wholesale_price,
         p.tax_rate,
         p.discount_percent,
         p.min_stock,
         p.max_stock,
         p.reorder_level,
         p.opening_stock,
         p.track_inventory,
         p.image_path,
         p.status,
         p.notes,
         p.created_at,
         p.category_id,
         c.name  AS category_name,
         c.color AS category_color,
         p.unit_id,
         u.name       AS unit_name,
         u.short_name AS unit_short_name
       FROM products p
       LEFT JOIN product_categories c
         ON c.id = p.category_id AND c.company_id = p.company_id
       LEFT JOIN units u
         ON u.id = p.unit_id AND u.company_id = p.company_id
       ${whereSql}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    /* -------- Total for the whole company (for header badge) -------- */
    const [{ total_products }] = await query<Array<{ total_products: number }>>(
      `SELECT COUNT(*) AS total_products FROM products WHERE company_id = ?`,
      [companyId]
    );

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      },
      total_products,
    });
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Unable to load products." },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/products
============================================================ */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const companyId = user.company_id;

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

    /* Validate category belongs to this company */
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

    /* Validate unit belongs to this company */
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

    /* Unique SKU per company */
    const [dup] = await query<any[]>(
      "SELECT id FROM products WHERE company_id = ? AND sku = ? LIMIT 1",
      [companyId, sku]
    );
    if (dup) {
      return NextResponse.json(
        { error: "A product with this SKU already exists." },
        { status: 409 }
      );
    }

    const result: any = await query(
      `INSERT INTO products
         (company_id, sku, barcode, name, description, product_type,
          category_id, unit_id,
          purchase_price, sale_price, wholesale_price, tax_rate, discount_percent,
          track_inventory, opening_stock, min_stock, max_stock, reorder_level,
          notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
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
      ]
    );

    const insertId = result.insertId;

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
      [insertId, companyId]
    );

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/products]", err);
    return NextResponse.json(
      { error: "Failed to create product." },
      { status: 500 }
    );
  }
}
