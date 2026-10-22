"use client";

import { useEffect, useRef, useState } from "react";

/* Fetch a file (with login cookie) and save it */
export async function downloadFile(href: string, fallbackName: string) {
  const res = await fetch(href, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const name = cd.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ============================================================
   EXPORT MENU
   CSV / Excel download + "Copy for Google Sheets" (paste-ready)
============================================================ */
export function ExportMenu({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const url = (format: string) =>
    `/api/leads/export?${query ? query + "&" : ""}format=${format}`;

  const download = async (format: "csv" | "xlsx") => {
    setBusy(format);
    setMsg(null);
    try {
      await downloadFile(url(format), `leads.${format}`);
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const copyForSheets = async () => {
    setBusy("sheets");
    setMsg(null);
    try {
      const res = await fetch(url("tsv"), { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      const rows = Math.max(0, text.split("\r\n").length - 1);
      setMsg(
        `${rows} leads copied! Open a new Google Sheet, click cell A1 and press Ctrl+V.`
      );
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusy(null);
    }
  };

  const item =
    "flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <p className="border-b border-gray-100 px-3 py-2 text-[11px] text-gray-500">
            Exports all leads matching the current filters, with source,
            status, priority &amp; assigned labels.
          </p>
          <button type="button" disabled={!!busy} onClick={() => download("xlsx")} className={item}>
            <span className="mt-0.5 text-green-600">▦</span>
            <span>
              <span className="block font-semibold text-gray-900">
                {busy === "xlsx" ? "Preparing..." : "Excel (.xlsx)"}
              </span>
              <span className="text-xs text-gray-500">Formatted, with filters on every column</span>
            </span>
          </button>
          <button type="button" disabled={!!busy} onClick={() => download("csv")} className={item}>
            <span className="mt-0.5 text-blue-600">≡</span>
            <span>
              <span className="block font-semibold text-gray-900">
                {busy === "csv" ? "Preparing..." : "CSV (.csv)"}
              </span>
              <span className="text-xs text-gray-500">Works with Excel, Google Sheets, any CRM</span>
            </span>
          </button>
          <button type="button" disabled={!!busy} onClick={copyForSheets} className={item}>
            <span className="mt-0.5 text-emerald-600">⊞</span>
            <span>
              <span className="block font-semibold text-gray-900">
                {busy === "sheets" ? "Copying..." : "Google Sheets"}
              </span>
              <span className="text-xs text-gray-500">Copies all rows — paste into any Google Sheet</span>
            </span>
          </button>
        </div>
      )}
      {msg && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 shadow">
          {msg}
          <div className="mt-2 flex gap-3">
            {msg.includes("Google Sheet") && (
              <a
                href="https://sheets.new"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMsg(null)}
                className="font-semibold underline"
              >
                Open Google Sheets
              </a>
            )}
            <button className="font-semibold underline" onClick={() => setMsg(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   IMPORT MODAL
   Upload .xlsx / .csv (Google Sheets: File → Download → .xlsx or .csv)
   Step 1: validate (dry run)  ->  Step 2: import
============================================================ */
interface ImportSummary {
  dry_run: boolean;
  inserted: number;
  total_rows: number;
  valid: number;
  duplicates: number;
  errors: number;
  warnings: number;
  mapped_columns: { header: string; field: string }[];
  unmapped_columns: string[];
  error_list: { row: number; message: string }[];
  duplicate_list: { row: number; message: string }[];
  warning_list: { row: number; message: string }[];
}

export function ImportLeadsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [drag, setDrag] = useState(false);

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", dryRun ? "1" : "0");
      fd.append("skip_duplicates", skipDup ? "1" : "0");
      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Import failed (${res.status})`);
      setSummary(j as ImportSummary);
      if (!dryRun && j.inserted > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.(xlsx|csv|tsv|txt)$/i.test(f.name)) {
      setError("Please choose an .xlsx or .csv file");
      return;
    }
    setFile(f);
    setSummary(null);
    setError(null);
  };

  const done = summary && !summary.dry_run;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Import Leads</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Template */}
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">1. Download the template (optional)</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Excel template has dropdowns for Source, City, Status &amp; Priority.
              Your own sheet also works — columns like Name, Phone, City, Source
              are detected automatically.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadFile("/api/leads/export?template=1&format=xlsx", "leads-import-template.xlsx")} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-100">
                Excel template
              </button>
              <button type="button" onClick={() => downloadFile("/api/leads/export?template=1&format=csv", "leads-import-template.csv")} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-100">
                CSV template
              </button>
            </div>
          </div>

          {/* File */}
          <div>
            <p className="mb-1 text-sm font-semibold text-gray-900">2. Upload your file</p>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                drag ? "border-[#17D65D] bg-[#17D65D]/5" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <span className="text-sm font-semibold text-gray-900">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    {Math.max(1, Math.round(file.size / 1024))} KB — click to change
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-gray-900">
                    Click or drag a file here
                  </span>
                  <span className="mt-1 text-xs text-gray-500">
                    Excel (.xlsx) or CSV. From Google Sheets: File → Download → .xlsx or .csv
                  </span>
                </>
              )}
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={skipDup}
                onChange={(e) => {
                  setSkipDup(e.target.checked);
                  setSummary(null);
                }}
                className="h-4 w-4 accent-[#17D65D]"
              />
              Skip duplicates (phone/WhatsApp already in CRM or repeated in file)
            </label>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* Summary */}
          {summary && (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              {done ? (
                <p className="text-sm font-semibold text-green-700">
                  ✓ {summary.inserted} leads imported successfully.
                </p>
              ) : (
                <p className="text-sm font-semibold text-gray-900">3. Check before importing</p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Rows in file" value={summary.total_rows} />
                <Stat label={done ? "Imported" : "Ready"} value={done ? summary.inserted : summary.valid} tone="green" />
                <Stat label="Duplicates" value={summary.duplicates} tone="amber" />
                <Stat label="Errors" value={summary.errors} tone="red" />
              </div>
              {summary.mapped_columns.length > 0 && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Columns detected:</span>{" "}
                  {summary.mapped_columns.map((m) => m.header).join(", ")}
                </p>
              )}
              {summary.unmapped_columns.length > 0 && (
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Ignored columns:</span>{" "}
                  {summary.unmapped_columns.join(", ")}
                </p>
              )}
              <IssueList title="Errors (skipped)" items={summary.error_list} tone="red" />
              <IssueList title="Duplicates (skipped)" items={summary.duplicate_list} tone="amber" />
              <IssueList title="Warnings (imported with changes)" items={summary.warning_list} tone="gray" />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {done ? "Close" : "Cancel"}
            </button>
            {!done &&
              (summary && summary.dry_run ? (
                <button
                  type="button"
                  disabled={busy || summary.valid === 0}
                  onClick={() => send(false)}
                  className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455] disabled:opacity-50"
                >
                  {busy ? "Importing..." : `Import ${summary.valid} leads`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !file}
                  onClick={() => send(true)}
                  className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455] disabled:opacity-50"
                >
                  {busy ? "Checking..." : "Check file"}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
      ? "text-amber-700"
      : tone === "red"
      ? "text-red-700"
      : "text-gray-900";
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function IssueList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { row: number; message: string }[];
  tone: "red" | "amber" | "gray";
}) {
  if (!items.length) return null;
  const color =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-gray-600";
  return (
    <details className="text-xs">
      <summary className={`cursor-pointer font-semibold ${color}`}>
        {title} ({items.length})
      </summary>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-4">
        {items.map((it, i) => (
          <li key={i} className="text-gray-700">
            Row {it.row}: {it.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
