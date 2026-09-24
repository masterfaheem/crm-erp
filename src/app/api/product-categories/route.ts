import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/requireAuth";

/* ============================================================
   GET  /api/product-categories
============================================================ */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const companyId = auth.session.companyId;

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();

    const where: string[] = ["c.company_id = ?"];
    const params: any[] = [companyId];

    if (search) {
      where.push("(c.name LIKE ? OR c.description LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status === "active" || status === "inactive") {
      where.push("c.status = ?");
      params.push(status);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const sql = `
      SELECT
        c.id,
        c.name,
        c.description,
        c.color,
        c.parent_id,
        c.status,
        c.created_at,
        p.name AS parent_name,
        COALESCE(prod.cnt, 0) AS product_count,
        COALESCE(sub.cnt, 0)  AS subcategory_count
      FROM product_categories c
      LEFT JOIN product_categories p
        ON p.id = c.parent_id AND p.company_id = c.company_id
      LEFT JOIN (
        SELECT category_id, COUNT(*) AS cnt
        FROM products
        WHERE category_id IS NOT NULL AND company_id = ?
        GROUP BY category_id
      ) prod ON prod.category_id = c.id
      LEFT JOIN (
        SELECT parent_id, COUNT(*) AS cnt
        FROM product_categories
        WHERE parent_id IS NOT NULL AND company_id = ?
        GROUP BY parent_id
      ) sub ON sub.parent_id = c.id
      ${whereSql}
      ORDER BY c.name ASC
    `;

    const allParams = [companyId, companyId, ...params];
    const rows = await query<any[]>(sql, allParams);

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[GET /api/product-categories]", err);
    return NextResponse.json(
      { error: "Unable to load categories." },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/product-categories
============================================================ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const companyId = auth.session.companyId;

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const color = body.color ? String(body.color).trim() : null;
    const parent_id = body.parent_id ? Number(body.parent_id) : null;
    const status = body.status === "inactive" ? "inactive" : "active";

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required." },
        { status: 400 }
      );
    }

    if (parent_id) {
      const [parent] = await query<any[]>(
        "SELECT id FROM product_categories WHERE id = ? AND company_id = ? LIMIT 1",
        [parent_id, companyId]
      );
      if (!parent) {
        return NextResponse.json(
          { error: "Parent category not found." },
          { status: 400 }
        );
      }
    }

    const result: any = await query(
      `INSERT INTO product_categories
         (company_id, name, description, color, parent_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, name, description, color, parent_id, status]
    );

    const insertId = result.insertId;

    const [row] = await query<any[]>(
      `SELECT
         c.id, c.name, c.description, c.color, c.parent_id, c.status,
         c.created_at, p.name AS parent_name
       FROM product_categories c
       LEFT JOIN product_categories p
         ON p.id = c.parent_id AND p.company_id = c.company_id
       WHERE c.id = ? AND c.company_id = ?`,
      [insertId, companyId]
    );

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/product-categories]", err);
    return NextResponse.json(
      { error: "Failed to create category." },
      { status: 500 }
    );
  }
}
