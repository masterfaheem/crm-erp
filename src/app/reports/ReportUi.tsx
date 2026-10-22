"use client";

import { useState } from "react";

/* ============================================================
   SHARED REPORT UI (tiles, bar lists, column charts, date range)
   Single brand hue for magnitude; status colors only for won/lost.
============================================================ */
export const BRAND = "#17D65D";

export const rs = (n: number) =>
  "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function ymd(d: Date) {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  const daysAgo = (n: number) => ymd(new Date(now.getTime() - n * 86400000));
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: daysAgo(6), to: today };
    case "30d":
      return { from: daysAgo(29), to: today };
    case "month":
      return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: ymd(s), to: ymd(e) };
    }
    case "90d":
      return { from: daysAgo(89), to: today };
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return { from: "", to: "" };
  }
}

const PRESETS = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["month", "This month"],
  ["last_month", "Last month"],
  ["90d", "90 days"],
  ["year", "This year"],
  ["all", "All time"],
];

export function DateRangeBar({
  from,
  to,
  onChange,
  children,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
  children?: React.ReactNode;
}) {
  const [active, setActive] = useState("30d");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setActive(k);
              onChange(presetRange(k));
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setActive("");
            onChange({ from: e.target.value, to });
          }}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setActive("");
            onChange({ from, to: e.target.value });
          }}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        />
        {children}
      </div>
    </div>
  );
}

export function Tile({
  label,
  value,
  sub,
  tone = "text-gray-900",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 font-bold ${value.length > 10 ? "text-lg" : "text-2xl"} ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export function Card({
  title,
  hint,
  right,
  children,
  id,
  className = "",
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* CSV download for any table */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50">
      ⬇ CSV
    </button>
  );
}

/* Horizontal bar list: one hue, value + optional detail columns */
export interface BarRow {
  label: string;
  value: number;
  won?: number;
  lost?: number;
  revenue?: number;
}

export function BarList({
  rows,
  showConversion = false,
  showRevenue = false,
  empty = "No data yet",
  max,
  format = (n: number) => String(n),
}: {
  rows: BarRow[];
  showConversion?: boolean;
  showRevenue?: boolean;
  empty?: string;
  max?: number;
  format?: (n: number) => string;
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-400">{empty}</p>;
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {showConversion && (
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <span className="flex-1">Name · share</span>
          <span className="w-12 text-right">Leads</span>
          <span className="w-14 text-right">Won %</span>
          {showRevenue && <span className="hidden w-24 text-right sm:block">Revenue</span>}
        </div>
      )}
      {rows.map((r) => {
        const conv = pct(r.won || 0, (r.won || 0) + (r.lost || 0));
        return (
          <div
            key={r.label}
            className="group flex items-center gap-3"
            title={`${r.label}: ${r.value} (${pct(r.value, total)}%)${
              showConversion ? ` · won ${r.won || 0}, lost ${r.lost || 0}` : ""
            }${showRevenue && r.revenue ? ` · ${rs(r.revenue)}` : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-gray-800">{r.label}</span>
                <span className="shrink-0 text-gray-500">{pct(r.value, total)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full transition-all group-hover:opacity-80"
                  style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: BRAND }}
                />
              </div>
            </div>
            <span className="min-w-12 whitespace-nowrap text-right text-sm font-bold text-gray-900">{format(r.value)}</span>
            {showConversion && (
              <span className={`w-14 text-right text-xs font-semibold ${(r.won || 0) + (r.lost || 0) ? "text-gray-800" : "text-gray-300"}`}>
                {(r.won || 0) + (r.lost || 0) ? `${conv}%` : "—"}
              </span>
            )}
            {showRevenue && (
              <span className="hidden w-24 text-right text-xs text-gray-600 sm:block">{r.revenue ? rs(r.revenue) : "—"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Vertical columns (time / weekday / hour) with hover tooltip */
export function Columns({
  rows,
  height = 140,
  format = (n: number) => String(n),
  secondary,
}: {
  rows: { label: string; value: number; extra?: string }[];
  height?: number;
  format?: (n: number) => string;
  secondary?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-400">No data yet</p>;
  const top = Math.max(...rows.map((r) => r.value), 1);
  const showEvery = Math.ceil(rows.length / 12);
  return (
    <div>
      <div className="relative flex items-end gap-[2px]" style={{ height }}>
        {rows.map((r, i) => (
          <div
            key={r.label + i}
            className="relative flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="mx-auto w-full max-w-[44px] rounded-t-[4px]"
              style={{
                height: `${r.value ? Math.max(3, (r.value / top) * 100) : 0}%`,
                background: BRAND,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow">
                <b>{r.label}</b>: {format(r.value)}
                {r.extra && <span className="text-gray-300"> · {r.extra}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-gray-200 pt-1">
        {rows.map((r, i) => (
          <div key={i} className="flex-1 truncate text-center text-[9px] text-gray-500">
            {i % showEvery === 0 ? r.label : ""}
          </div>
        ))}
      </div>
      {secondary && <p className="mt-1 text-[11px] text-gray-400">{secondary}</p>}
    </div>
  );
}
