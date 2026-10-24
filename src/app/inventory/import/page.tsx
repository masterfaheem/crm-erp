"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   OPENING STOCK IMPORT  (/inventory/import)
   1. choose the Excel (.xlsx) / CSV list of stock in the shop with cost
   2. Preview: every line, new or existing product, qty, cost, value
   3. Save: products + opening stock + cost in one go
============================================================ */
type Row = {
  line: number; code: string | null; name: string; brand: string | null; category: string; unit: string | null;
  qty: number; cost: number; sale_price: number | null; action: "create" | "update";
  current_stock: number | null; old_cost: number | null; value: number; warnings: string[];
};
type Preview = {
  rows: Row[]; warnings: string[]; skipped: { line: number; reason: string }[]; file_name: string;
  summary: { lines: number; create: number; update: number; total_qty: number; total_value: number; no_cost: number; categories: string[] };
};

const rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const qty = (n: number) => (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });

export default function OpeningImportPage() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true");
      } catch {
        /* ignore */
      }
    };
    read();
    window.addEventListener("erp:sidebar-collapse", read);
    return () => window.removeEventListener("erp:sidebar-collapse", read);
  }, []);
  return (
    <>
      <Navbar />
      <main className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <ImportContent />
        </div>
      </main>
    </>
  );
}

function ImportContent() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; total_qty: number; total_value: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "create" | "update" | "warn">("all");
  const [cat, setCat] = useState("");
  const [agree, setAgree] = useState(false);

  const send = async (mode: "preview" | "commit") => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (mode === "commit" && pv) {
        fd.append("confirm_total", String(pv.summary.total_value));
        fd.append("confirm_lines", String(pv.summary.lines));
      }
      const res = await fetch("/api/inventory/opening-import", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        if (mode === "commit" && res.status === 409) setPv(null);
        return;
      }
      if (mode === "preview") {
        setPv(json);
        setAgree(false);
      } else {
        setDone(json);
        setPv(null);
      }
    } catch {
      setError("Network problem — check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!pv) return [];
    return pv.rows.filter(
      (r) =>
        (filter === "all" || (filter === "warn" ? r.warnings.length > 0 : r.action === filter)) &&
        (!cat || r.category === cat)
    );
  }, [pv, filter, cat]);

  const catTotals = useMemo(() => {
    const m = new Map<string, { n: number; q: number; v: number }>();
    for (const r of pv?.rows || []) {
      const x = m.get(r.category) || { n: 0, q: 0, v: 0 };
      x.n++;
      x.q += r.qty;
      x.v += r.value;
      m.set(r.category, x);
    }
    return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
  }, [pv]);

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Opening stock saved</h1>
        <p className="mt-1 text-sm text-gray-600">
          {done.created} new products added, {done.updated} existing products updated · {qty(done.total_qty)} units · stock value{" "}
          <b>{rs(done.total_value)}</b>
        </p>
        <p className="mt-2 text-xs text-gray-500">
          POS, purchases, sales, exchanges and adjustments now work from these quantities and costs. The books (Accounting → Balance Sheet) show
          this as Inventory / Opening Stock.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/inventory" className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12b94f]">
            Open Stock Levels
          </Link>
          <Link href="/products" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <Link href="/inventory" className="text-xs text-gray-500 hover:text-gray-700">
            ← Stock Levels
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Import opening stock</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Upload the list of what is in the shop today with cost. You&apos;ll see everything before anything is saved.
          </p>
        </div>
      </div>

      {/* step 1 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPv(null);
              setError(null);
            }}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200 sm:w-auto"
          />
          <button
            onClick={() => send("preview")}
            disabled={!file || busy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy && !pv ? "Reading…" : "Preview"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Columns used: <b>Code</b>, <b>Product</b>, Brand, Category, <b>Quantity</b>, <b>Average Cost</b> (or Cost), Sale price (optional). Old
          .xls files: open in Excel and “Save As” .xlsx first.
        </p>
        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>

      {pv && (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Lines" value={String(pv.summary.lines)} />
            <Kpi label="New products" value={String(pv.summary.create)} />
            <Kpi label="Existing (updated)" value={String(pv.summary.update)} />
            <Kpi label="Total units" value={qty(pv.summary.total_qty)} />
            <Kpi label="Stock value at cost" value={rs(pv.summary.total_value)} strong />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">By category</h2>
            <div className="flex flex-wrap gap-2">
              {catTotals.map(([c, x]) => (
                <button
                  key={c}
                  onClick={() => setCat(cat === c ? "" : c)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs ${cat === c ? "border-[#17D65D] bg-[#17D65D]/10" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                >
                  <div className="font-semibold text-gray-900">{c}</div>
                  <div className="text-gray-500">
                    {x.n} items · {qty(x.q)} units · {rs(x.v)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {(pv.warnings.length > 0 || pv.skipped.length > 0 || pv.summary.no_cost > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Please check</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {pv.summary.no_cost > 0 && <li>{pv.summary.no_cost} item(s) have no cost — profit on them can&apos;t be worked out until a cost is added.</li>}
                {pv.warnings.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {pv.skipped.map((s, i) => (
                  <li key={`s${i}`}>
                    Row {s.line} skipped: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* lines */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
              {(["all", "create", "update", "warn"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${filter === f ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                >
                  {f === "all" ? "All" : f === "create" ? "New" : f === "update" ? "Existing" : "Needs a look"}
                </button>
              ))}
              {cat && (
                <button onClick={() => setCat("")} className="text-xs text-gray-500 underline">
                  clear “{cat}”
                </button>
              )}
              <span className="ml-auto text-xs text-gray-500">{rows.length} shown</span>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={`${r.line}-${r.code}`} className={r.warnings.length ? "bg-amber-50/50" : ""}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">{r.code || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="text-gray-900">{r.name}</div>
                        {r.brand && <div className="text-xs text-gray-500">{r.brand}</div>}
                        {r.warnings.map((w, i) => (
                          <div key={i} className="text-xs text-amber-700">
                            {w}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {qty(r.qty)} {r.unit || ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{rs(r.cost)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{rs(r.value)}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.action === "create" ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">New</span>
                        ) : (
                          <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800" title="Stock will be set to the counted quantity">
                            Update ({qty(r.current_stock || 0)} → {qty(r.qty)})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* save */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              <span>
                I checked the list. Save <b>{pv.summary.lines}</b> products with <b>{qty(pv.summary.total_qty)}</b> units worth{" "}
                <b>{rs(pv.summary.total_value)}</b> as opening stock.
              </span>
            </label>
            <button
              onClick={() => send("commit")}
              disabled={!agree || busy}
              className="mt-3 rounded-md bg-[#17D65D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#12b94f] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save opening stock"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? "text-lg font-bold text-gray-900" : "text-base font-semibold text-gray-800"}`}>{value}</div>
    </div>
  );
}
