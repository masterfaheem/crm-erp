import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import {
  LEAD_SELECT,
  buildLeadFilters,
  ensureLeadsTable,
} from "@/lib/leadsTable";
import { LEAD_COLUMNS, toDelimited, toExportRow } from "@/lib/leadsIO";
import {
  LEAD_PRIORITY_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  PAKISTAN_CITIES,
} from "@/lib/leadOptions";

const MAX_EXPORT = 50000;

/* ============================================================
   GET /api/leads/export
     ?format=csv | xlsx | tsv   (default csv)
     ?template=1                -> empty import template
     + all list filters (search, city, status, ...)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return unauthorized();
    await ensureLeadsTable();

    const sp = new URL(req.url).searchParams;
    const format = (sp.get("format") || "csv").toLowerCase();
    const template = sp.get("template") === "1";
    const today = new Date().toISOString().slice(0, 10);

    let rows: Record<string, string | number>[] = [];
    if (template) {
      rows = [
        {
          first_name: "Ali",
          last_name: "Khan",
          company_name: "ABC Traders",
          designation: "Manager",
          phone: "03001234567",
          whatsapp: "03001234567",
          email: "ali@example.com",
          source: "Facebook",
          city: "Lahore",
          status: "New",
          priority: "Medium",
          estimated_value: 150000,
          expected_close_date: today,
          description: "Wants a gaming laptop",
        },
      ];
    } else {
      const { whereSql, params } = buildLeadFilters(sp, user.company_id);
      const [dbRows] = await getPool().query(
        `${LEAD_SELECT} WHERE ${whereSql} ORDER BY l.id DESC LIMIT ?`,
        [...params, MAX_EXPORT],
      );
      rows = (dbRows as unknown[]).map(toExportRow);
    }

    const columns = template
      ? LEAD_COLUMNS.filter(
          (c) => c.key !== "lead_number" && c.key !== "created_at",
        )
      : LEAD_COLUMNS;
    const base = template ? "leads-import-template" : `leads-${today}`;

    /* ---------- CSV / TSV ---------- */
    if (format === "csv" || format === "tsv") {
      const sep = format === "tsv" ? "\t" : ",";
      const body = toDelimited(rows, sep, columns);
      return new NextResponse(format === "csv" ? "﻿" + body : body, {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "text/tab-separated-values; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.${format}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    /* ---------- XLSX ---------- */
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "TechnoX CRM";
      wb.created = new Date();
      const ws = wb.addWorksheet("Leads", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      ws.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width,
      }));
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FF000000" } };
      head.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF17D65D" },
      };
      head.alignment = { vertical: "middle" };
      head.height = 22;

      rows.forEach((r) => ws.addRow(r));
      const valueCol =
        columns.findIndex((c) => c.key === "estimated_value") + 1;
      if (valueCol > 0) ws.getColumn(valueCol).numFmt = "#,##0";
      // keep phone numbers as text (no lost leading zero)
      ["phone", "alternate_phone", "whatsapp"].forEach((k) => {
        const idx = columns.findIndex((c) => c.key === k) + 1;
        if (idx > 0) ws.getColumn(idx).numFmt = "@";
      });

      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };

      /* Dropdown lists on a hidden sheet (import template only) */
      if (template) {
        const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
        const listData: [string, string[]][] = [
          ["source", LEAD_SOURCES.map((s) => s.label)],
          ["status", Object.values(LEAD_STATUS_LABELS)],
          ["priority", Object.values(LEAD_PRIORITY_LABELS)],
          ["city", PAKISTAN_CITIES],
        ];
        listData.forEach(([, values], i) => {
          values.forEach((v, r) => {
            lists.getCell(r + 1, i + 1).value = v;
          });
        });
        const lastRow = 1000;
        listData.forEach(([key, values], i) => {
          const colIdx = columns.findIndex((c) => c.key === key) + 1;
          if (colIdx <= 0) return;
          const letter = String.fromCharCode(65 + i);
          const formula = `Lists!$${letter}$1:$${letter}$${values.length}`;
          for (let r = 2; r <= lastRow; r++) {
            ws.getCell(r, colIdx).dataValidation = {
              type: "list",
              allowBlank: true,
              showErrorMessage: key !== "city", // city may be any town
              formulae: [formula],
            };
          }
        });
      }

      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (err) {
    console.error("GET /api/leads/export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
