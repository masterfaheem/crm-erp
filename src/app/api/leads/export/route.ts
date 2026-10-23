import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accessFromRequest, can } from "@/lib/access";
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
  PROFESSIONS,
  BUDGET_RANGES,
  LOST_REASONS,
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
          name: "Ali Khan",
          whatsapp: "03001234567",
          city: "Lahore",
          source: "Facebook",
          profession: "Student",
          budget_range: "60k – 80k",
          use_cases: "Study, Graphic Design",
          requirement_note: "16GB RAM, backlit keyboard",
          status: "Follow Up",
          priority: "Medium",
          follow_up_at: `${today} 17:00`,
          follow_up_note: "Send 2 options",
          description: "Asked on Instagram DM",
          delivery_name: "Ali Khan",
          delivery_phone: "03001234567",
          delivery_house: "12-B",
          delivery_street: "Street 5",
          delivery_area: "Johar Town Block J",
          delivery_landmark: "Near Emporium Mall",
          delivery_city: "Lahore",
        },
      ];
    } else {
      const ownerId = can(await accessFromRequest(req), "leads.view_all") ? null : user.id;
      const { whereSql, params } = buildLeadFilters(sp, user.company_id, ownerId);
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
          ["profession", PROFESSIONS.map((o) => o.label)],
          ["budget_range", BUDGET_RANGES.map((o) => o.label)],
          ["lost_reason", LOST_REASONS.map((o) => o.label)],
          ["delivery_city", PAKISTAN_CITIES],
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
              // free text allowed for city, profession & lost reason ("other")
            showErrorMessage: !["city", "delivery_city", "profession", "lost_reason"].includes(key),
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
