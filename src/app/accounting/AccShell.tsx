"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* Shared frame for the Accounting pages: menu, tabs, money format, date range */
export const rs = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  const s = "Rs " + Math.abs(v).toLocaleString("en-PK", { maximumFractionDigits: 0 });
  return v < 0 ? `(${s})` : s;
};
export const todayPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
export const inputCls =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const TABS = [
  { href: "/accounting/reports/profit-loss", label: "Profit & Loss" },
  { href: "/accounting/reports/balance-sheet", label: "Balance Sheet" },
  { href: "/accounting/reports/trial-balance", label: "Trial Balance" },
  { href: "/accounting/journal-entries", label: "Journal & Expenses" },
  { href: "/accounting/ledger", label: "Account Ledger" },
  { href: "/accounting/accounts", label: "Chart of Accounts" },
];

export type SyncInfo = {
  cost_estimated_lines: number; cost_missing_lines: number; unvalued_adjustments: number;
  unbalanced: { ref: string; diff: number }[]; skipped: string[]; at: string;
};

export function SyncNote({ sync }: { sync: SyncInfo | null | undefined }) {
  if (!sync) return null;
  const notes: string[] = [];
  if (sync.cost_estimated_lines) notes.push(`${sync.cost_estimated_lines} older bill line(s) had no saved cost — today's purchase price was used (estimate).`);
  if (sync.cost_missing_lines) notes.push(`${sync.cost_missing_lines} sold line(s) have no purchase price at all — their cost is not counted, so profit is shown higher. Add the purchase price on those products.`);
  if (sync.unvalued_adjustments) notes.push(`${sync.unvalued_adjustments} stock adjustment(s) are not valued (product has no purchase price).`);
  if (sync.unbalanced?.length) notes.push(`Old bills with totals that don't add up: ${sync.unbalanced.slice(0, 5).map((u) => `${u.ref} (${u.diff})`).join(", ")} — difference put in sales / suspense.`);
  if (sync.skipped?.length) notes.push(`Not included (module not set up): ${sync.skipped.join(", ")}.`);
  if (!notes.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      <div className="mb-1 font-semibold">Notes on these numbers</div>
      <ul className="list-disc space-y-0.5 pl-4">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

export function RangePicker({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  const t = todayPKT();
  const y = t.slice(0, 4);
  const m = t.slice(0, 7);
  const lastMonthEnd = new Date(`${m}-01T00:00:00Z`);
  lastMonthEnd.setUTCDate(0);
  const lme = lastMonthEnd.toISOString().slice(0, 10);
  const presets: [string, string, string][] = [
    ["Today", t, t],
    ["This month", `${m}-01`, t],
    ["Last month", `${lme.slice(0, 7)}-01`, lme],
    ["This year", `${y}-01-01`, t],
    ["All time", "", t],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(([l, f, to2]) => (
        <button key={l} type="button" onClick={() => onChange(f, to2)}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${from === f && to === to2 ? "border-[#17D65D] bg-[#17D65D]/10 text-gray-900" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
          {l}
        </button>
      ))}
      <input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className={`${inputCls} py-1.5 text-xs`} />
      <span className="text-xs text-gray-400">to</span>
      <input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className={`${inputCls} py-1.5 text-xs`} />
    </div>
  );
}

export default function AccShell({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [path, setPath] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath(window.location.pathname);
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
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2 print:hidden">
            {TABS.map((t) => (
              <a key={t.href} href={t.href}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${path === t.href ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {t.label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
            </div>
            {right}
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
