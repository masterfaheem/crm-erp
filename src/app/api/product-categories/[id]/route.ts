import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/requireAuth";

/* ============================================================
   Helper: would setting parent_id = X create a cycle?
============================================================ */
async function wouldCreateCycle(
  id: number,
  newParentId: number
): Promise<boolean> {
  if (id === newParentId) return true;

  let current: number | null = newParentId;
  const seen = new Set<number>();

  while (current) {
    if (current === id) return true;
    if (seen.has(current)) return true;
    seen.add(current);

    // Explicit annotation prevents TS7022 (implicit any in a loop).
    const rows: Array<{ parent_id: number | null }> = await query(
      "SELECT parent_id FROM product_categories WHERE id = ? LIMIT 1",
      [current]
    );
    if (!rows.length) return false;
    current = rows[0].parent_id ?? null;
  }
  return false;
}

/* ============================================================
   PUT  /api/product-categories/:id
   Next.js 16: `params` is a Promise — must be awaited.
============================================================ */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

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

    const [existing] = await query<any[]>(
      "SELECT id FROM product_categories WHERE id = ? LIMIT 1",
      [id]
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Category not found." },
        { status: 404 }
      );
    }

    if (parent_id) {
      const [parent] = await query<any[]>(
        "SELECT id FROM product_categories WHERE id = ? LIMIT 1",
        [parent_id]
      );
      if (!parent) {
        return NextResponse.json(
          { error: "Parent category not found." },
          { status: 400 }
        );
      }
      if (await wouldCreateCycle(id, parent_id)) {
        return NextResponse.json(
          { error: "Cannot set this parent — it would create a cycle." },
          { status: 400 }
        );
      }
    }

    await query(
      `UPDATE product_categories
         SET name = ?, description = ?, color = ?, parent_id = ?, status = ?
       WHERE id = ?`,
      [name, description, color, parent_id, status, id]
    );

    const [row] = await query<any[]>(
      `SELECT
         c.id, c.name, c.description, c.color, c.parent_id, c.status,
         c.created_at, p.name AS parent_name
       FROM product_categories c
       LEFT JOIN product_categories p ON p.id = c.parent_id
       WHERE c.id = ?`,
      [id]
    );

    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("[PUT /api/product-categories/:id]", err);
    return NextResponse.json(
      { error: "Failed to update category." },
      { status: 500 }
    );
  }
}

/* ============================================================
   DELETE  /api/product-categories/:id
   Next.js 16: `params` is a Promise — must be awaited.
============================================================ */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const [existing] = await query<any[]>(
      "SELECT id FROM product_categories WHERE id = ? LIMIT 1",
      [id]
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Category not found." },
        { status: 404 }
      );
    }

    const [prodCount] = await query<any[]>(
      "SELECT COUNT(*) AS cnt FROM products WHERE category_id = ?",
      [id]
    );
    if (prodCount?.cnt > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${prodCount.cnt} product(s) still use this category.`,
        },
        { status: 409 }
      );
    }

    const [subCount] = await query<any[]>(
      "SELECT COUNT(*) AS cnt FROM product_categories WHERE parent_id = ?",
      [id]
    );
    if (subCount?.cnt > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${subCount.cnt} subcategory(ies) depend on it.`,
        },
        { status: 409 }
      );
    }

    await query("DELETE FROM product_categories WHERE id = ?", [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/product-categories/:id]", err);
    return NextResponse.json(
      { error: "Failed to delete category." },
      { status: 500 }
    );
  }
}
