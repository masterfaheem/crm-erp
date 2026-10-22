"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PAKISTAN_CITIES } from "@/lib/leadOptions";

/* Shared UI pieces for the Leads module (list, view, edit) */

export function formatCurrency(n: number): string {
  return "Rs " + (n || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; label: string; dot: string }
> = {
  new: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "New" },
  mature: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500", label: "Mature" },
  proposal: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Proposal" },
  negotiation: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", label: "Negotiation" },
  follow_up: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500", label: "Follow Up" },
  won: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", label: "Won" },
  lost: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Lost" },
};

export const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
  medium: { bg: "bg-blue-50", text: "text-blue-700", label: "Medium" },
  high: { bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  urgent: { bg: "bg-red-50", text: "text-red-700", label: "Urgent" },
};

export const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "mature", label: "Mature" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "follow_up", label: "Follow Up" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:bg-white focus:ring-2 focus:ring-[#17D65D]/20";

/* ============================================================
   FIELD
============================================================ */
export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

/* ============================================================
   SEARCHABLE CITY SELECT (all Pakistan cities)
============================================================ */
export function CitySelect({
  value,
  onChange,
  placeholder = "Select city",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return PAKISTAN_CITIES;
    const starts = PAKISTAN_CITIES.filter((c) => c.toLowerCase().startsWith(t));
    const contains = PAKISTAN_CITIES.filter(
      (c) => !c.toLowerCase().startsWith(t) && c.toLowerCase().includes(t)
    );
    return [...starts, ...contains];
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);


  const pick = (c: string) => {
    onChange(c);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between text-left`}
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value || placeholder}
        </span>
        <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[highlight]) pick(filtered[highlight]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search city..."
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => pick("")}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
                >
                  Clear selection
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No city found</li>
            ) : (
              filtered.map((c, i) => (
                <li key={c}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(c)}
                    className={`w-full px-3 py-1.5 text-left text-sm ${
                      i === highlight ? "bg-[#17D65D]/10" : ""
                    } ${c === value ? "font-semibold text-gray-900" : "text-gray-700"}`}
                  >
                    {c}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* "2026-10-25T14:30" -> "25 Oct, 2:30 PM" */
export function fmtFollowUp(local?: string | null): string {
  if (!local) return "";
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return local;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h = Number(m[4]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}, ${h}:${m[5]} ${ampm}`;
}

/* Is a follow-up (PKT wall-clock string) overdue right now? */
export function isOverdue(local?: string | null): boolean {
  if (!local) return false;
  const nowPk = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16);
  return local < nowPk;
}
