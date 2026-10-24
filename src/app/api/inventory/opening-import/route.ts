import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { accessFromRequest, can } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { commitImport, ensureImportTables, parseRows, previewImport, readSheet } from "@/lib/inventoryImport";

/* ============================================================
   POST /api/inventory/opening-import   (multipart: file, mode)
   mode=preview -> what will happen (nothing saved)
   mode=commit  -> same file again + confirm_total (the total the user saw);
                   re-checked on the server, saved in one transaction
============================================================ */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const a = await accessFromRequest(req);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(can(a, "products.create") && can(a, "inventory.adjust") && can(a, "products.cost"))) {
    return NextResponse.json(
      { error: "Opening stock import needs: add products, adjust stock and see cost price." },
      { status: 403 }
    );
  }
  const user = { id: a.userId, company_id: a.companyId };

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload the file again." }, { status: 400 });
  }
  const file = form.get("file");
  const mode = String(form.get("mode") || "preview");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too big (max 5 MB)." }, { status: 400 });

  let parsed: ReturnType<typeof parseRows>;
  try {
    parsed = parseRows(await readSheet(file));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the file." }, { status: 400 });
  }
  if (!parsed.rows.length) return NextResponse.json({ error: "No product rows found in the file.", skipped: parsed.skipped }, { status: 400 });

  await ensureImportTables();
  const pool = getPool();

  if (mode !== "commit") {
    try {
      const pv = await previewImport(pool, a.companyId, parsed.rows);
      return NextResponse.json({ ...pv, skipped: parsed.skipped, file_name: file.name });
    } catch (e) {
      console.error("[opening-import preview]", e);
      return NextResponse.json({ error: "Couldn't prepare the preview." }, { status: 500 });
    }
  }

  /* ---------- commit ---------- */
  const confirmTotal = Number(form.get("confirm_total"));
  const confirmLines = Number(form.get("confirm_lines"));
  const conn = await pool.getConnection();
  let locked = false;
  try {
    const [lk] = await conn.query("SELECT GET_LOCK(?, 10) AS ok", [`stock_import_${a.companyId}`]);
    locked = Number((lk as { ok: number }[])[0]?.ok) === 1;
    if (!locked) return NextResponse.json({ error: "Another import is running. Try again in a moment." }, { status: 409 });

    await conn.beginTransaction();
    const pv = await previewImport(conn, a.companyId, parsed.rows);
    if (
      !Number.isFinite(confirmTotal) ||
      Math.abs(pv.summary.total_value - confirmTotal) > 0.5 ||
      pv.summary.lines !== confirmLines
    ) {
      await conn.rollback();
      return NextResponse.json(
        { error: "The data changed since the preview. Press Preview again and re-check before saving." },
        { status: 409 }
      );
    }
    const res = await commitImport(conn, user, pv.rows, file.name);
    await conn.commit();
    await writeAudit(req, user, "stock_opening_import", "products", null);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error("[opening-import commit]", e);
    return NextResponse.json({ error: "Import failed — nothing was saved." }, { status: 500 });
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [`stock_import_${a.companyId}`]).catch(() => {});
    conn.release();
  }
}
