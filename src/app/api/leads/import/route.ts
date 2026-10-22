import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEADS_TABLE,
  ensureLeadsTable,
  formatLeadNumber,
  nextLeadNumberBase,
  parseLeadInput,
  phoneKey,
} from "@/lib/leadsTable";
import {
  mapHeaders,
  matchBudget,
  matchCity,
  matchLostReason,
  matchPriority,
  matchProfession,
  matchSource,
  matchStatus,
  matchUseCases,
  parseAnyDateTime,
  parseCSV,
  parseMoney,
} from "@/lib/leadsIO";

const MAX_ROWS = 5000;

/* values for NOT NULL columns when a row didn't set them */
const COL_DEFAULTS: Record<string, unknown> = {
  status: "new",
  priority: "medium",
  estimated_value: 0,
  follow_up_done: 0,
};
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
      const warn = (message: string) => warnings.push({ row: rowNo, message });

      const name =
        str(f.full_name, 240) ||
        [str(f.first_name, 120), str(f.last_name, 120)].filter(Boolean).join(" ");
      if (!name) {
        errors.push({ row: rowNo, message: "Name is missing" });
        return;
      }

      const phone = phoneStr(f.phone);
      const whatsapp = phoneStr(f.whatsapp);
      const alt = phoneStr(f.alternate_phone);

      if (skipDup) {
        const keys = [phone, whatsapp, alt].map(phoneKey).filter((k) => k.length >= 7);
        if (keys.some((k) => existing.has(k))) {
          duplicates.push({
            row: rowNo,
            message: `${name} — duplicate number (already in CRM or repeated in file)`,
          });
          return;
        }
        keys.forEach((k) => existing.add(k)); // also catches duplicates inside file
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        name,
        phone,
        whatsapp: whatsapp || (f.whatsapp === undefined ? phone : null),
        alternate_phone: alt,
        email: str(f.email, 190),
        company_name: str(f.company_name, 200),
        designation: str(f.designation, 120),
        requirement_note: str(f.requirement_note, 500),
        follow_up_note: str(f.follow_up_note, 255),
        address: str(f.address, 5000),
        description: str(f.description, 10000),
        delivery_name: str(f.delivery_name, 120),
        delivery_phone: phoneStr(f.delivery_phone),
        delivery_phone2: phoneStr(f.delivery_phone2),
        delivery_house: str(f.delivery_house, 100),
        delivery_street: str(f.delivery_street, 150),
        delivery_area: str(f.delivery_area, 150),
        delivery_landmark: str(f.delivery_landmark, 200),
      };
      const cityRaw = str(f.city, 100);
      body.city = cityRaw ? matchCity(cityRaw) : null;
      const dCity = str(f.delivery_city, 100);
      body.delivery_city = dCity ? matchCity(dCity) : null;
      if (f.estimated_value !== undefined) body.estimated_value = parseMoney(f.estimated_value);

      const srcRaw = str(f.source);
      if (srcRaw) {
        body.source = matchSource(srcRaw);
        if (!body.source) warn(`Unknown source "${srcRaw}" — left empty`);
      }
      const profRaw = str(f.profession);
      if (profRaw) {
        const m = matchProfession(profRaw);
        body.profession = m.profession;
        body.profession_other = m.other;
      }
      const budRaw = str(f.budget_range);
      if (budRaw) {
        body.budget_range = matchBudget(f.budget_range);
        if (!body.budget_range) warn(`Budget "${budRaw}" not understood — left empty`);
      }
      const ucRaw = str(f.use_cases, 500);
      if (ucRaw) {
        const m = matchUseCases(ucRaw);
        body.use_cases = m.use_cases;
        body.use_case_custom = m.custom;
      }

      body.status = "new";
      const stRaw = str(f.status);
      if (stRaw) {
        const m = matchStatus(stRaw);
        if (m) body.status = m;
        else warn(`Unknown status "${stRaw}" — set to New`);
      }
      body.priority = "medium";
      const prRaw = str(f.priority);
      if (prRaw) {
        const m = matchPriority(prRaw);
        if (m) body.priority = m;
        else warn(`Unknown priority "${prRaw}" — set to Medium`);
      }

      const fuRaw = f.follow_up_at;
      if (fuRaw !== undefined && fuRaw !== null && String(fuRaw).trim() !== "") {
        body.follow_up_at = parseAnyDateTime(fuRaw);
        if (!body.follow_up_at) warn(`Follow-up date "${fuRaw}" not understood — skipped`);
      }
      if (body.status === "follow_up" && !body.follow_up_at) {
        body.status = "new";
        warn("Status Follow Up without a date — set to New");
      }
      const lrRaw = str(f.lost_reason);
      if (lrRaw) {
        const m = matchLostReason(lrRaw);
        body.lost_reason = m.lost_reason;
        body.lost_reason_other = m.other;
      }
      if (body.status === "lost" && !body.lost_reason) body.lost_reason = "unknown";

      const asRaw = str(f.assigned);
      if (asRaw) {
        body.assigned_to = userByKey.get(asRaw.toLowerCase()) ?? null;
        if (!body.assigned_to) warn(`User "${asRaw}" not found — left unassigned`);
      }

      const { values, error } = parseLeadInput(body, false);
      if (error) {
        errors.push({ row: rowNo, message: error });
        return;
      }
      valid.push(values);
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
      const dataCols = Array.from(new Set(valid.flatMap((r) => Object.keys(r))));
      const cols = ["company_id", "branch_id", "lead_number", "created_by", ...dataCols];
      for (let i = 0; i < valid.length; i += 500) {
        const chunk = valid.slice(i, i + 500);
        const values = chunk.map((r) => [
          user.company_id,
          user.branch_id ?? null,
          formatLeadNumber(++n),
          user.id,
          ...dataCols.map((c) => (r[c] === undefined ? COL_DEFAULTS[c] ?? null : r[c])),
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
