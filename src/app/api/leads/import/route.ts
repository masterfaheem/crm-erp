import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEADS_TABLE,
  ensureLeadsTable,
  formatLeadNumber,
  nextLeadNumberBase,
  phoneKey,
} from "@/lib/leadsTable";
import {
  mapHeaders,
  matchCity,
  matchPriority,
  matchSource,
  matchStatus,
  parseAnyDate,
  parseCSV,
  parseMoney,
} from "@/lib/leadsIO";

const MAX_ROWS = 5000;
const MAX_BYTES = 10 * 1024 * 1024;

type Cell = string | number | Date | null;

/* ---------- read file into a 2D array ---------- */
async function readSheet(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets.find((w) => w.state === "visible") || wb.worksheets[0];
    if (!ws) return [];
    const out: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const arr: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let v: any = row.getCell(c).value;
        if (v && typeof v === "object" && !(v instanceof Date)) {
          if ("result" in v) v = v.result; // formula
          else if ("text" in v) v = v.text; // hyperlink
          else if ("richText" in v)
            v = v.richText.map((t: { text: string }) => t.text).join("");
          else v = String(v);
        }
        arr.push(v ?? null);
      }
      out.push(arr);
    });
    return out;
  }

  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseCSV(buf.toString("utf8"));
  }

  throw new Error("Unsupported file. Please upload .xlsx or .csv");
}

const str = (v: Cell, max = 255): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s ? s.slice(0, max) : null;
};

/* Excel often stores 03001234567 as the number 3001234567 */
const phoneStr = (v: Cell): string | null => {
  if (typeof v === "number") {
    const s = String(Math.round(v));
    return s.length === 10 && s.startsWith("3") ? "0" + s : s;
  }
  return str(v, 40);
};

/* ============================================================
   POST /api/leads/import   (multipart/form-data)
     file             : .xlsx | .csv
     dry_run          : "1" -> only validate & preview
     skip_duplicates  : "1" (default) -> skip rows whose phone/WhatsApp
                        already exists
============================================================ */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const form = await req.formData();
    const file = form.get("file");
    const dryRun = form.get("dry_run") === "1";
    const skipDup = form.get("skip_duplicates") !== "0";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    let sheet: Cell[][];
    try {
      sheet = await readSheet(file);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not read file" },
        { status: 400 }
      );
    }
    if (sheet.length < 2) {
      return NextResponse.json(
        { error: "File is empty or has no data rows" },
        { status: 400 }
      );
    }

    const headers = sheet[0].map((h) => String(h ?? "").trim());
    const headerMap = mapHeaders(headers);
    const mappedFields = Object.values(headerMap);
    if (!mappedFields.includes("first_name") && !mappedFields.includes("full_name")) {
      return NextResponse.json(
        {
          error:
            'Could not find a name column. Add a "First Name" or "Name" column (download the template for the correct format).',
        },
        { status: 400 }
      );
    }
    const unmapped = headers.filter((h, i) => h && !(i in headerMap));

    const dataRows = sheet.slice(1);
    if (dataRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${dataRows.length}). Max ${MAX_ROWS} per import.` },
        { status: 400 }
      );
    }

    /* users of this company for "Assigned To" */
    const pool = getPool();
    const [uRows] = await pool.query(
      `SELECT id, name, email FROM users WHERE company_id = ?`,
      [user.company_id]
    );
    const userByKey = new Map<string, number>();
    for (const u of uRows as { id: number; name: string; email: string }[]) {
      if (u.name) userByKey.set(u.name.trim().toLowerCase(), u.id);
      if (u.email) userByKey.set(u.email.trim().toLowerCase(), u.id);
    }

    /* existing phone keys for duplicate check */
    const existing = new Set<string>();
    if (skipDup) {
      const [pRows] = await pool.query(
        `SELECT phone, whatsapp, alternate_phone FROM ${LEADS_TABLE} WHERE company_id = ?`,
        [user.company_id]
      );
      for (const r of pRows as Record<string, string | null>[]) {
        for (const v of [r.phone, r.whatsapp, r.alternate_phone]) {
          const k = phoneKey(v);
          if (k.length >= 7) existing.add(k);
        }
      }
    }

    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];
    const duplicates: { row: number; message: string }[] = [];
    const valid: Record<string, unknown>[] = [];

    dataRows.forEach((cells, i) => {
      const rowNo = i + 2; // spreadsheet row number
      if (!cells.some((c) => c !== null && String(c).trim() !== "")) return;

      const f: Record<string, Cell> = {};
      for (const [idx, field] of Object.entries(headerMap)) {
        f[field] = cells[Number(idx)] ?? null;
      }

      let first = str(f.first_name, 120);
      let last = str(f.last_name, 120);
      if (!first && f.full_name) {
        const parts = String(f.full_name).trim().split(/\s+/);
        first = parts.shift()?.slice(0, 120) || null;
        if (!last && parts.length) last = parts.join(" ").slice(0, 120);
      }
      if (!first) {
        errors.push({ row: rowNo, message: "Name is missing" });
        return;
      }

      const phone = phoneStr(f.phone);
      const whatsapp = phoneStr(f.whatsapp);
      const alt = phoneStr(f.alternate_phone);

      if (skipDup) {
        const keys = [phone, whatsapp, alt]
          .map(phoneKey)
          .filter((k) => k.length >= 7);
        if (keys.some((k) => existing.has(k))) {
          duplicates.push({
            row: rowNo,
            message: `${first} ${last || ""} — duplicate number (already in CRM or repeated in file)`.trim(),
          });
          return;
        }
        keys.forEach((k) => existing.add(k)); // also catches duplicates inside file
      }

      let source: string | null = null;
      const srcRaw = str(f.source);
      if (srcRaw) {
        source = matchSource(srcRaw);
        if (!source) warnings.push({ row: rowNo, message: `Unknown source "${srcRaw}" — left empty` });
      }

      let status = "new";
      const stRaw = str(f.status);
      if (stRaw) {
        const m = matchStatus(stRaw);
        if (m) status = m;
        else warnings.push({ row: rowNo, message: `Unknown status "${stRaw}" — set to New` });
      }

      let priority = "medium";
      const prRaw = str(f.priority);
      if (prRaw) {
        const m = matchPriority(prRaw);
        if (m) priority = m;
        else warnings.push({ row: rowNo, message: `Unknown priority "${prRaw}" — set to Medium` });
      }

      let assignedTo: number | null = null;
      const asRaw = str(f.assigned);
      if (asRaw) {
        assignedTo = userByKey.get(asRaw.toLowerCase()) ?? null;
        if (!assignedTo) warnings.push({ row: rowNo, message: `User "${asRaw}" not found — left unassigned` });
      }

      const cityRaw = str(f.city, 100);

      valid.push({
        first_name: first,
        last_name: last,
        company_name: str(f.company_name, 200),
        designation: str(f.designation, 120),
        email: str(f.email, 190),
        phone,
        alternate_phone: alt,
        whatsapp,
        source,
        city: cityRaw ? matchCity(cityRaw) : null,
        assigned_to: assignedTo,
        status,
        priority,
        estimated_value: parseMoney(f.estimated_value),
        expected_close_date: parseAnyDate(f.expected_close_date),
        address: str(f.address, 5000),
        description: str(f.description, 10000),
      });
    });

    const summary = {
      total_rows: dataRows.length,
      valid: valid.length,
      duplicates: duplicates.length,
      errors: errors.length,
      warnings: warnings.length,
      mapped_columns: headers
        .map((h, i) => (headerMap[i] ? { header: h, field: headerMap[i] } : null))
        .filter(Boolean),
      unmapped_columns: unmapped,
      error_list: errors.slice(0, 200),
      duplicate_list: duplicates.slice(0, 200),
      warning_list: warnings.slice(0, 200),
      preview: valid.slice(0, 5),
    };

    if (dryRun || valid.length === 0) {
      return NextResponse.json({ dry_run: true, inserted: 0, ...summary });
    }

    /* ---------- insert ---------- */
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let n = await nextLeadNumberBase(conn, user.company_id);
      const cols = [
        "company_id", "branch_id", "lead_number", "first_name", "last_name",
        "company_name", "designation", "email", "phone", "alternate_phone",
        "whatsapp", "source", "city", "assigned_to", "status", "priority",
        "estimated_value", "expected_close_date", "address", "description",
        "created_by",
      ];
      for (let i = 0; i < valid.length; i += 500) {
        const chunk = valid.slice(i, i + 500);
        const values = chunk.map((r) => [
          user.company_id,
          user.branch_id ?? null,
          formatLeadNumber(++n),
          r.first_name, r.last_name, r.company_name, r.designation, r.email,
          r.phone, r.alternate_phone, r.whatsapp, r.source, r.city,
          r.assigned_to, r.status, r.priority, r.estimated_value,
          r.expected_close_date, r.address, r.description, user.id,
        ]);
        await conn.query(
          `INSERT INTO ${LEADS_TABLE} (${cols.join(", ")}) VALUES ?`,
          [values]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return NextResponse.json({ dry_run: false, inserted: valid.length, ...summary });
  } catch (err) {
    console.error("POST /api/leads/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
