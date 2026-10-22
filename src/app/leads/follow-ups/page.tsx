"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { BUDGET_LABELS, formatUseCases } from "@/lib/leadOptions";
import { STATUS_STYLES, fmtFollowUp, inputCls, isOverdue } from "../leadUi";

interface FollowUpRow {
  id: number;
  lead_number: string;
  first_name: string;
  last_name: string | null;
  whatsapp: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  budget_range: string | null;
  use_cases: string | null;
  use_case_custom: string | null;
  requirement_note: string | null;
  follow_up_local: string | null;
  follow_up_note: string | null;
  follow_up_done: number;
  assigned_name: string | null;
}

type Tab = "overdue" | "today" | "upcoming" | "done";
const TABS: { key: Tab; label: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", tone: "text-red-600" },
  { key: "today", label: "Today", tone: "text-indigo-600" },
  { key: "upcoming", label: "Upcoming", tone: "text-gray-700" },
  { key: "done", label: "Done", tone: "text-green-600" },
];

function waNumber(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

function preset(days: number, hour = 11): string {
  const d = new Date(Date.now() + days * 86400000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={null}>
      <FollowUps />
    </Suspense>
  );
}

function FollowUps() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("tab") as Tab) || "today";
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === initial) ? initial : "today"
  );
  const [rows, setRows] = useState<FollowUpRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [newTime, setNewTime] = useState("");

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const [lRes, cRes] = await Promise.all([
        fetch(`/api/leads?follow_up=${t}&limit=200`, { credentials: "include" }),
        fetch("/api/leads/follow-ups", { credentials: "include" }),
      ]);
      if (lRes.status === 401) throw new Error("Session expired. Please log in again.");
      if (!lRes.ok) throw new Error(`Failed to load (${lRes.status})`);
      setRows((await lRes.json()).data || []);
      if (cRes.ok) setCounts((await cRes.json()).data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(tab);
  }, [tab, load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setRescheduleId(null);
    router.replace(`/leads/follow-ups?tab=${t}`);
  };

  const update = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Update failed");
      }
      setRescheduleId(null);
      await load(tab);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <Link href="/leads" className="text-sm font-semibold text-gray-600 hover:text-gray-900">
                  ← Leads
                </Link>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  Follow Ups
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Leads you need to call or message back
                </p>
              </div>
            </div>

            {/* TABS */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => switchTab(t.key)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                    tab === t.key ? "border-[#17D65D] ring-2 ring-[#17D65D]/20" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${t.tone}`}>{counts[t.key] ?? 0}</p>
                </button>
              ))}
            </div>

            {/* LIST */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
                  ))}
                </div>
              ) : error ? (
                <p className="p-10 text-center text-sm text-red-600">{error}</p>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-3xl">🎉</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} follow-ups
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Set a follow-up from any lead (status &quot;Follow Up&quot; or the 📅 button).
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const name = [r.first_name, r.last_name].filter(Boolean).join(" ");
                    const st = STATUS_STYLES[r.status] || STATUS_STYLES.new;
                    const num = r.whatsapp || r.phone;
                    const late = !r.follow_up_done && isOverdue(r.follow_up_local);
                    const uses = formatUseCases(r.use_cases, r.use_case_custom);
                    return (
                      <li key={r.id} className="p-4 sm:px-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/leads/${r.id}`} className="text-sm font-bold text-gray-900 hover:text-[#0f9d48]">
                                {name}
                              </Link>
                              <span className="text-xs text-gray-400">{r.lead_number}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                            </div>
                            <p className={`mt-1 text-sm font-semibold ${late ? "text-red-600" : r.follow_up_done ? "text-green-700" : "text-indigo-700"}`}>
                              📅 {fmtFollowUp(r.follow_up_local)}
                              {late && " · overdue"}
                              {!!r.follow_up_done && " · done"}
                            </p>
                            {r.follow_up_note && (
                              <p className="mt-0.5 text-sm text-gray-700">“{r.follow_up_note}”</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              {[num, r.city, r.budget_range && BUDGET_LABELS[r.budget_range], uses, r.requirement_note, r.assigned_name && `👤 ${r.assigned_name}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {num && (
                              <a
                                href={`https://wa.me/${waNumber(num)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                              >
                                WhatsApp
                              </a>
                            )}
                            {num && (
                              <a href={`tel:${num}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                Call
                              </a>
                            )}
                            {!r.follow_up_done ? (
                              <button
                                disabled={busyId === r.id}
                                onClick={() => update(r.id, { follow_up_done: 1 })}
                                className="rounded-lg bg-[#17D65D] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#15c455] disabled:opacity-50"
                              >
                                ✓ Done
                              </button>
                            ) : (
                              <button
                                disabled={busyId === r.id}
                                onClick={() => update(r.id, { follow_up_done: 0 })}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Undo
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setRescheduleId(rescheduleId === r.id ? null : r.id);
                                setNewTime(preset(1));
                              }}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Reschedule
                            </button>
                          </div>
                        </div>

                        {rescheduleId === r.id && (
                          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-gray-50 p-3 sm:flex-row sm:items-center">
                            <input type="datetime-local" value={newTime} onChange={(e) => setNewTime(e.target.value)} className={`${inputCls} sm:max-w-xs`} />
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                ["Tomorrow", preset(1)],
                                ["In 3 days", preset(3)],
                                ["Next week", preset(7)],
                              ].map(([l, v]) => (
                                <button key={l} type="button" onClick={() => setNewTime(v)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                                  {l}
                                </button>
                              ))}
                            </div>
                            <button
                              disabled={!newTime || busyId === r.id}
                              onClick={() => update(r.id, { follow_up_at: newTime })}
                              className="rounded-lg bg-[#17D65D] px-4 py-2 text-xs font-semibold text-black hover:bg-[#15c455] disabled:opacity-50 sm:ml-auto"
                            >
                              Save new time
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
