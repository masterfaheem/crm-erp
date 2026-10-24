import ExcelJS from "exceljs";
import { getPool } from "@/lib/db";
import { STOCK_TABLE, ensureStockTable } from "@/lib/ledger";
import { parseCSV } from "@/lib/leadsIO";
import { ensureCostingTables, setOpeningCost } from "@/lib/costing";

/* ============================================================
   OPENING STOCK IMPORT
   Excel / CSV list of what is in the shop today, with cost.
   - existing product (same code, else same name) -> cost updated and
     opening stock set so that LIVE stock = the counted quantity
     (sales / purchases already in the CRM are kept)
   - new product -> created with its category, unit and cost
   Preview first, then commit in one transaction.
============================================================ */
type Cell = string | number | Date | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conn = any;

export const IMPORT_LOG_TABLE = "crm_stock_imports";

export type ImportRow = {
  line: number;
  code: string | null;
  name: string;
  brand: string | null;
  category: string;
  details: string | null;
  unit: string | null;
  qty: number;
  cost: number;
  sale_price: number | null;
};

export type PreviewRow = ImportRow & {
  action: "create" | "update";
  product_id: number | null;
  current_stock: number | null;
  old_cost: number | null;
  value: number;
  warnings: string[];
};

/* ---------------- read the file ---------------- */
export async function readSheet(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets.find((w) => w.state === "visible") || wb.worksheets[0];
    if (!ws) return [];
    const out: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const arr: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let v: any = row.getCell(c).value;
        if (v && typeof v === "object" && !(v instanceof Date)) {
          if ("result" in v) v = v.result;
          else if ("text" in v) v = v.text;
          else if ("richText" in v) v = v.richText.map((t: { text: string }) => t.text).join("");
          else v = String(v);
        }
        arr.push(v ?? null);
      }
      out.push(arr);
    });
    return out;
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCSV(buf.toString("utf8"));
  if (name.endsWith(".xls")) throw new Error("Old .xls format: open it in Excel / WPS and 'Save As' .xlsx, then upload");
  throw new Error("Upload an .xlsx or .csv file");
}

/* ---------------- understand the columns ---------------- */
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEAD: Record<string, string[]> = {
  code: ["code", "sku", "skucode", "productcode", "itemcode", "skucodeoptional"],
  name: ["product", "productname", "productmodel", "model", "item", "itemname", "name"],
  brand: ["brand", "make"],
  category: ["category", "productcategory", "type"],
  details: ["details", "specs", "specification", "specscpuramssdgen"],
  qty: ["quantity", "qty", "stock", "quantityinshoptoday", "onhand"],
  unit: ["unit", "uom"],
  cost: ["averagecostpkr", "averagecost", "avgcost", "cost", "costprice", "purchasecost", "purchaseprice", "purchasecostperunitrs", "unitcost"],
  sale: ["saleprice", "salepriceperunitrs", "sellingprice", "price", "retailprice"],
};

function findHeader(rows: Cell[][]) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(norm);
    const col = (key: string) => cells.findIndex((c) => HEAD[key].includes(c));
    const name = col("name");
    const qty = col("qty");
    if (name >= 0 && qty >= 0) {
      const map: Record<string, number> = {};
      for (const k of Object.keys(HEAD)) map[k] = col(k);
      /* exports often put the unit (ea / pc) in an unlabelled column right after quantity */
      if (map.unit < 0 && cells[qty + 1] === "") map.unit = qty + 1;
      return { headerRow: r, map };
    }
  }
  return null;
}

const num = (v: Cell): number => {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/rs\.?/i, "").trim();
  return s === "" ? NaN : Number(s);
};
const text = (v: Cell, max = 200): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/* tidy category names; guess from the product name when blank */
const CATEGORY_FIX: Record<string, string> = {
  chroombook: "Chromebook", chromebook: "Chromebook", chromebooks: "Chromebook",
  acesseries: "Accessories", accessories: "Accessories", accessory: "Accessories", acessories: "Accessories",
  laptops: "Laptops", laptop: "Laptops", ram: "RAM", ssd: "SSD", hdd: "HDD", charger: "Charger", chargers: "Charger",
  cable: "Cable", cables: "Cable", battery: "Battery",
};
export function tidyCategory(cat: string | null, name: string): string {
  const k = norm(cat);
  if (k) return CATEGORY_FIX[k] || String(cat).trim();
  const n = name.toLowerCase();
  if (/charger|adapter|\d+\s*w\b/.test(n)) return "Charger";
  if (/\bssd\b|\bnvme\b/.test(n)) return "SSD";
  if (/\bhdd\b|hard ?disk/.test(n)) return "HDD";
  if (/\bram\b|ddr\d/.test(n)) return "RAM";
  if (/cable/.test(n)) return "Cable";
  if (/chrome ?book/.test(n)) return "Chromebook";
  if (/battery/.test(n)) return "Battery";
  return "Other";
}

export function parseRows(rows: Cell[][]): { rows: ImportRow[]; skipped: { line: number; reason: string }[] } {
  const h = findHeader(rows);
  if (!h) throw new Error("Couldn't find the header row — the sheet needs at least 'Product' and 'Quantity' columns");
  const { headerRow, map } = h;
  const out: ImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k: string) => (map[k] >= 0 ? row[map[k]] : null);
    const name = text(get("name"), 200);
    const first = text(row[0], 60) || "";
    if (!name) {
      if (row.some((c) => c !== null && String(c).trim() !== "") && !/^total/i.test(first)) {
        skipped.push({ line: r + 1, reason: "No product name" });
      }
      continue;
    }
    if (/^total/i.test(first) || /^total/i.test(name)) continue;
    const qty = num(get("qty"));
    const cost = num(get("cost"));
    if (!Number.isFinite(qty) || qty < 0) {
      skipped.push({ line: r + 1, reason: `"${name}": quantity missing / wrong` });
      continue;
    }
    if (map.cost >= 0 && (!Number.isFinite(cost) || cost < 0)) {
      skipped.push({ line: r + 1, reason: `"${name}": cost missing / wrong` });
      continue;
    }
    const sale = num(get("sale"));
    out.push({
      line: r + 1,
      code: text(get("code"), 50),
      name,
      brand: text(get("brand"), 60),
      category: tidyCategory(text(get("category"), 60), name),
      details: text(get("details"), 255),
      unit: text(get("unit"), 20),
      qty: Math.round(qty * 1000) / 1000,
      cost: Number.isFinite(cost) ? Math.round(cost * 100) / 100 : 0,
      sale_price: Number.isFinite(sale) && sale > 0 ? Math.round(sale * 100) / 100 : null,
    });
  }
  return { rows: out, skipped };
}

/* ---------------- tables ---------------- */
let ready = false;
export async function ensureImportTables() {
  if (ready) return;
  await ensureStockTable();
  await ensureCostingTables();
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${IMPORT_LOG_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT UNSIGNED NOT NULL,
      file_name VARCHAR(200) NULL,
      products_created INT NOT NULL DEFAULT 0,
      products_updated INT NOT NULL DEFAULT 0,
      total_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
      total_value DECIMAL(16,2) NOT NULL DEFAULT 0,
      created_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ready = true;
}

/* same code twice in a file -> one product (qty added, cost averaged) */
function mergeDuplicates(rows: ImportRow[]) {
  const by = new Map<string, ImportRow>();
  const warnings: string[] = [];
  for (const r of rows) {
    const k = r.code ? `c:${r.code.toLowerCase()}` : `n:${norm(r.name)}`;
    const ex = by.get(k);
    if (!ex) {
      by.set(k, { ...r });
      continue;
    }
    const q = ex.qty + r.qty;
    ex.cost = q > 0 ? Math.round(((ex.qty * ex.cost + r.qty * r.cost) / q) * 100) / 100 : ex.cost;
    ex.qty = q;
    warnings.push(`"${r.name}" appears more than once — quantities added (line ${ex.line} + ${r.line})`);
  }
  return { rows: [...by.values()], warnings };
}

/* ---------------- preview ---------------- */
export async function previewImport(conn: Conn, companyId: number, input: ImportRow[]) {
  const { rows, warnings } = mergeDuplicates(input);
  const [prods] = await conn.query(
    `SELECT p.id, p.sku, p.name, p.purchase_price,
            COALESCE(p.opening_stock, 0) AS opening_stock,
            COALESCE((SELECT SUM(m.qty) FROM ${STOCK_TABLE} m WHERE m.product_id = p.id AND m.company_id = p.company_id), 0) AS moved
       FROM products p WHERE p.company_id = ?`,
    [companyId]
  );
  const bySku = new Map<string, Record<string, unknown>>();
  const byName = new Map<string, Record<string, unknown>>();
  for (const p of prods as Record<string, unknown>[]) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p);
    byName.set(norm(p.name), p);
  }
  const out: PreviewRow[] = rows.map((r) => {
    const p = (r.code && bySku.get(r.code.toLowerCase())) || byName.get(norm(r.name)) || null;
    const w: string[] = [];
    if (!(r.cost > 0)) w.push("No cost — profit on this item can't be worked out until a cost is added");
    if (p && r.code && p.sku && String(p.sku).toLowerCase() !== r.code.toLowerCase()) w.push(`Matched by name (CRM code ${p.sku})`);
    const current = p ? Number(p.opening_stock) + Number(p.moved) : null;
    return {
      ...r,
      action: p ? "update" : "create",
      product_id: p ? Number(p.id) : null,
      current_stock: current,
      old_cost: p ? Number(p.purchase_price) : null,
      value: Math.round(r.qty * r.cost * 100) / 100,
      warnings: w,
    };
  });
  return {
    rows: out,
    warnings,
    summary: {
      lines: out.length,
      create: out.filter((r) => r.action === "create").length,
      update: out.filter((r) => r.action === "update").length,
      total_qty: Math.round(out.reduce((a, r) => a + r.qty, 0) * 1000) / 1000,
      total_value: Math.round(out.reduce((a, r) => a + r.value, 0) * 100) / 100,
      no_cost: out.filter((r) => !(r.cost > 0)).length,
      categories: [...new Set(out.map((r) => r.category))].sort(),
    },
  };
}

/* ---------------- commit ---------------- */
const CAT_COLORS: Record<string, string> = {
  Laptops: "#17D65D", RAM: "#3B82F6", SSD: "#8B5CF6", HDD: "#6B7280", Charger: "#F59E0B",
  Cable: "#06B6D4", Chromebook: "#EC4899", Accessories: "#14B8A6", Battery: "#EF4444", Other: "#9CA3AF",
};

async function categoryId(conn: Conn, companyId: number, name: string, cache: Map<string, number>) {
  const k = name.toLowerCase();
  if (cache.has(k)) return cache.get(k)!;
  const [rows] = await conn.query(
    "SELECT id FROM product_categories WHERE company_id = ? AND LOWER(name) = ? LIMIT 1",
    [companyId, k]
  );
  let id = (rows as { id: number }[])[0]?.id;
  if (!id) {
    const [res] = await conn.query(
      `INSERT INTO product_categories (company_id, name, description, color, parent_id, status)
       VALUES (?, ?, NULL, ?, NULL, 'active')`,
      [companyId, name, CAT_COLORS[name] || "#9CA3AF"]
    );
    id = (res as { insertId: number }).insertId;
  }
  cache.set(k, id);
  return id;
}

async function pieceUnitId(conn: Conn, companyId: number) {
  const [rows] = await conn.query(
    `SELECT id FROM units WHERE company_id = ?
        AND (LOWER(short_name) IN ('pcs', 'pc', 'ea', 'nos') OR LOWER(name) IN ('piece', 'pieces', 'each'))
      ORDER BY id LIMIT 1`,
    [companyId]
  );
  const id = (rows as { id: number }[])[0]?.id;
  if (id) return id;
  const [res] = await conn.query(
    `INSERT INTO units (company_id, name, short_name, description, status) VALUES (?, 'Piece', 'pcs', 'One item', 'active')`,
    [companyId]
  );
  return (res as { insertId: number }).insertId;
}

export async function commitImport(
  conn: Conn,
  user: { id: number; company_id: number },
  rows: PreviewRow[],
  fileName: string | null
) {
  const companyId = user.company_id;
  const cats = new Map<string, number>();
  const unitId = await pieceUnitId(conn, companyId);
  let created = 0;
  let updated = 0;
  const stamp = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  for (const r of rows) {
    const catId = await categoryId(conn, companyId, r.category, cats);
    const description = [r.brand ? `Brand: ${r.brand}` : null, r.details].filter(Boolean).join(" · ") || null;
    if (r.action === "update" && r.product_id) {
      /* live stock must equal the counted qty: opening = counted - movements already recorded */
      const [mv] = await conn.query(
        `SELECT COALESCE(SUM(qty), 0) AS moved FROM ${STOCK_TABLE} WHERE company_id = ? AND product_id = ?`,
        [companyId, r.product_id]
      );
      const moved = Number((mv as { moved: number }[])[0]?.moved || 0);
      const opening = Math.round((r.qty - moved) * 1000) / 1000;
      await conn.query(
        `UPDATE products SET opening_stock = ?, purchase_price = ?, category_id = COALESCE(category_id, ?),
                unit_id = COALESCE(unit_id, ?), track_inventory = 1, product_type = 'product', status = 'active',
                sale_price = COALESCE(?, sale_price), sku = COALESCE(NULLIF(sku, ''), ?)
          WHERE id = ? AND company_id = ?`,
        [opening, r.cost, catId, unitId, r.sale_price, r.code, r.product_id, companyId]
      );
      await setOpeningCost(conn, companyId, r.product_id, r.cost);
      updated++;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO products
           (company_id, sku, barcode, name, description, product_type, category_id, unit_id,
            purchase_price, sale_price, wholesale_price, tax_rate, discount_percent,
            track_inventory, opening_stock, min_stock, max_stock, reorder_level, notes, status)
         VALUES (?, ?, NULL, ?, ?, 'product', ?, ?, ?, ?, 0, 0, 0, 1, ?, 0, 0, 0, ?, 'active')`,
        [companyId, r.code, r.name, description, catId, unitId, r.cost, r.sale_price || 0, r.qty,
         `Opening stock import ${stamp}${fileName ? ` (${fileName})` : ""}`.slice(0, 250)]
      );
      const newId = Number((ins as { insertId: number }).insertId);
      /* SKU is required on product edit: give code-less rows one */
      if (!r.code) await conn.query("UPDATE products SET sku = ? WHERE id = ?", [`IMP-${String(newId).padStart(6, "0")}`, newId]);
      await setOpeningCost(conn, companyId, newId, r.cost);
      created++;
    }
  }
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  await conn.query(
    `INSERT INTO ${IMPORT_LOG_TABLE} (company_id, file_name, products_created, products_updated, total_qty, total_value, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [companyId, fileName ? fileName.slice(0, 200) : null, created, updated, totalQty, Math.round(totalValue * 100) / 100, user.id]
  );
  return { created, updated, total_qty: totalQty, total_value: Math.round(totalValue * 100) / 100 };
}
