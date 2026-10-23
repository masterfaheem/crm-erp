"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccess } from "@/app/components/useAccess";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import {
  BUDGET_LABELS,
  BUDGET_RANGES,
  LEAD_SOURCES,
  LEAD_SOURCE_GROUPS,
  LOST_REASONS,
  PROFESSIONS,
  USE_CASES,
  leadSourceLabel,
  lostReasonText,
  professionText,
} from "@/lib/leadOptions";
import { ExportMenu, ImportLeadsModal } from "./LeadsImportExport";
import {
  EMPTY_LEAD_FORM,
  LeadFormFields,
  formToPayload,
  validateLeadForm,
  type LeadFormState,
} from "./LeadForm";
import {
  CitySelect,
  Field,
  PRIORITY_OPTIONS,
  PRIORITY_STYLES,
  STATUS_OPTIONS,
  STATUS_STYLES,
  fmtFollowUp,
  inputCls,
  isOverdue,
} from "./leadUi";

/* ============================================================
   TYPES
============================================================ */
interface LeadRow {
  id: number;
  lead_number: string;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  designation: string | null;
  status: string;
  priority: string;
  estimated_value: number;
  expected_close_date: string | null;
  source_name: string | null;
  city_name: string | null;
  profession_name: string | null;
  assigned_name: string | null;
  stage_name: string | null;
  pipeline_name: string | null;
  created_at: string;
  city: string | null;
  profession: string | null;
  profession_other: string | null;
  budget_range: string | null;
  follow_up_local: string | null;
  follow_up_done: number;
  lost_reason: string | null;
  lost_reason_other: string | null;
  handover_id: number | null;
  order_number: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface UserOption {
  id: number;
  name: string;
}

/* ============================================================
   HELPERS
============================================================ */
/* ---------- Advanced filters ---------- */
const EMPTY_FILTERS = {
  status: "",
  priority: "",
  lead_number: "",
  name: "",
  phone: "",
  city: "",
  source: "",
  profession: "",
  budget_range: "",
  use_case: "",
  lost_reason: "",
  follow_up: "",
  follow_up_from: "",
  follow_up_to: "",
  assigned_to: "",
  created_from: "",
  created_to: "",
  requirement: "",
  notes: "",
  delivery: "",
};
type Filters = typeof EMPTY_FILTERS;

const FILTER_LABELS: Record<keyof Filters, string> = {
  status: "Status",
  priority: "Priority",
  lead_number: "Lead #",
  name: "Name",
  phone: "Phone",
  city: "City",
  source: "Source",
  profession: "Profession",
  budget_range: "Budget",
  use_case: "Use case",
  lost_reason: "Lost reason",
  follow_up: "Follow-up",
  follow_up_from: "Follow-up from",
  follow_up_to: "Follow-up to",
  assigned_to: "Assigned",
  created_from: "Created from",
  created_to: "Created to",
  requirement: "Requirement",
  notes: "Notes",
  delivery: "Delivery address",
};

const FOLLOW_UP_SCOPES = [
  { value: "due", label: "Due (today + overdue)" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "All pending" },
  { value: "done", label: "Done" },
];

const optLabel = (arr: { value: string; label: string }[], v: string) =>
  arr.find((o) => o.value === v)?.label || v;

function buildQuery(search: string, f: Filters): string {
  const qs = new URLSearchParams();
  if (search.trim()) qs.set("search", search.trim());
  (Object.keys(f) as (keyof Filters)[]).forEach((k) => {
    if (f[k].trim()) qs.set(k, f[k].trim());
  });
  return qs.toString();
}

/* ============================================================
   PAGE
============================================================ */
export default function LeadsPage() {
  const { can } = useAccess();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [fuSummary, setFuSummary] = useState<{
    today: number;
    overdue: number;
    due: number;
  } | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Load reference data ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Sources & cities are fixed lists (see src/lib/leadOptions.ts)
        const uRes = await fetch("/api/users", { credentials: "include" });
        if (cancelled) return;
        if (uRes.ok) {
          const j = await uRes.json();
          setUsers(j.data || []);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Fetch leads ---------- */
  const fetchLeads = useCallback(async () => {
    // follow-up counts (badge + stats), refreshed with the list
    fetch("/api/leads/follow-ups", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setFuSummary(j.data))
      .catch(() => {});
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(buildQuery(search, filters));
      qs.set("page", String(page));
      qs.set("limit", "20");

      const res = await fetch(`/api/leads?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(`Failed to load leads (${res.status})`);
      }
      const json = await res.json();
      setLeads(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, filters, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /* ---------- Filter helpers ---------- */
  const applyFilters = (next: Filters) => {
    setFilters(next);
    setDraft(next);
    setPage(1);
  };
  const setQuick = (k: keyof Filters, v: string) =>
    applyFilters({ ...filters, [k]: v });
  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter(
    (k) => filters[k].trim() !== ""
  );
  const exportQuery = buildQuery(search, filters);
  const filterDisplay = (k: keyof Filters, v: string) => {
    if (k === "source") return leadSourceLabel(v);
    if (k === "status")
      return STATUS_OPTIONS.find((o) => o.value === v)?.label || v;
    if (k === "priority")
      return PRIORITY_OPTIONS.find((o) => o.value === v)?.label || v;
    if (k === "profession") return optLabel(PROFESSIONS, v);
    if (k === "budget_range") return optLabel(BUDGET_RANGES, v);
    if (k === "use_case") return optLabel(USE_CASES, v);
    if (k === "lost_reason") return optLabel(LOST_REASONS, v);
    if (k === "follow_up") return optLabel(FOLLOW_UP_SCOPES, v);
    if (k === "assigned_to")
      return v === "unassigned"
        ? "Unassigned"
        : users.find((u) => String(u.id) === v)?.name || v;
    return v;
  };

  /* ---------- Debounced search ---------- */
  const handleSearchChange = (v: string) => {
    setSearch(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setPage(1), 400);
  };

  /* ---------- Delete ---------- */
  const handleDelete = async (id: number, name: string) => {
    if (typeof window === "undefined") return;
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete lead");
      }
      fetchLeads();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to delete lead");
    }
  };


  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="space-y-5">
            {/* HEADER */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  Leads
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Manage and track your sales leads
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/leads/follow-ups"
                className="relative inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                📅 Follow Ups
                {!!fuSummary?.due && (
                  <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {fuSummary.due}
                  </span>
                )}
              </Link>
              {can("leads.import") && (
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Import
              </button>
              )}
              {can("leads.export") && <ExportMenu query={exportQuery} />}
              {can("leads.create") && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Lead
              </button>
              )}
              </div>
            </div>

            {/* FOLLOW-UP REMINDER */}
            {!!fuSummary?.due && (
              <Link
                href={fuSummary.overdue ? "/leads/follow-ups?tab=overdue" : "/leads/follow-ups"}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100"
              >
                <span>
                  🔔 <b>{fuSummary.due}</b> follow-up{fuSummary.due > 1 ? "s" : ""} due
                  {fuSummary.overdue ? (
                    <> — <b className="text-red-600">{fuSummary.overdue} overdue</b></>
                  ) : (
                    " today"
                  )}
                </span>
                <span className="font-semibold">Open →</span>
              </Link>
            )}

            {/* STATS */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Total Leads"
                value={pagination.total.toLocaleString()}
                accent="#3B82F6"
              />
              <Link href="/leads/follow-ups" className="block">
                <StatCard
                  label="Follow-ups Today"
                  value={String(fuSummary?.today ?? 0)}
                  accent="#6366F1"
                />
              </Link>
              <Link href="/leads/follow-ups?tab=overdue" className="block">
                <StatCard
                  label="Overdue Follow-ups"
                  value={String(fuSummary?.overdue ?? 0)}
                  accent="#EF4444"
                />
              </Link>
              <StatCard
                label="Page"
                value={`${pagination.page} / ${pagination.total_pages || 1}`}
                accent="#8B5CF6"
              />
            </div>

            {/* FILTERS */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search name, phone, email..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:bg-white focus:ring-2 focus:ring-[#17D65D]/20"
                  />
                </div>

                <select
                  value={filters.status}
                  onChange={(e) => setQuick("status", e.target.value)}
                  className={inputCls}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.priority}
                  onChange={(e) => setQuick("priority", e.target.value)}
                  className={inputCls}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFilters((v) => !v)}
                    className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      showFilters
                        ? "border-[#17D65D] bg-[#17D65D]/10 text-gray-900"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
                    </svg>
                    Filters
                    {activeFilters.length > 0 && (
                      <span className="rounded-full bg-[#17D65D] px-1.5 text-[11px] font-bold text-black">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setSearch("");
                      applyFilters(EMPTY_FILTERS);
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* ADVANCED FILTERS */}
              {showFilters && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyFilters(draft);
                  }}
                  className="mt-4 border-t border-gray-100 pt-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Name">
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Customer name" className={inputCls} />
                    </Field>
                    <Field label="Phone / WhatsApp">
                      <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="0300..." className={inputCls} />
                    </Field>
                    <Field label="City">
                      <CitySelect value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} placeholder="Any city" />
                    </Field>
                    <Field label="Source">
                      <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={inputCls}>
                        <option value="">Any source</option>
                        {LEAD_SOURCE_GROUPS.map((g) => (
                          <optgroup key={g} label={g}>
                            {LEAD_SOURCES.filter((x) => x.group === g).map((x) => (
                              <option key={x.value} value={x.value}>{x.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                    <Field label="Profession">
                      <select value={draft.profession} onChange={(e) => setDraft({ ...draft, profession: e.target.value })} className={inputCls}>
                        <option value="">Any profession</option>
                        {PROFESSIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Budget Range">
                      <select value={draft.budget_range} onChange={(e) => setDraft({ ...draft, budget_range: e.target.value })} className={inputCls}>
                        <option value="">Any budget</option>
                        {BUDGET_RANGES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Use Case">
                      <select value={draft.use_case} onChange={(e) => setDraft({ ...draft, use_case: e.target.value })} className={inputCls}>
                        <option value="">Any use case</option>
                        {USE_CASES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Lost Reason">
                      <select value={draft.lost_reason} onChange={(e) => setDraft({ ...draft, lost_reason: e.target.value })} className={inputCls}>
                        <option value="">Any reason</option>
                        {LOST_REASONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Follow-up">
                      <select value={draft.follow_up} onChange={(e) => setDraft({ ...draft, follow_up: e.target.value })} className={inputCls}>
                        <option value="">Any</option>
                        {FOLLOW_UP_SCOPES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="lg:col-span-2">
                    <Field label="Follow-up Date">
                      <div className="flex gap-2">
                        <input type="date" value={draft.follow_up_from} onChange={(e) => setDraft({ ...draft, follow_up_from: e.target.value })} className={inputCls} />
                        <input type="date" value={draft.follow_up_to} onChange={(e) => setDraft({ ...draft, follow_up_to: e.target.value })} className={inputCls} />
                      </div>
                    </Field>
                    </div>
                    <Field label="Assigned To">
                      <select value={draft.assigned_to} onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })} className={inputCls}>
                        <option value="">Anyone</option>
                        <option value="unassigned">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Lead #">
                      <input value={draft.lead_number} onChange={(e) => setDraft({ ...draft, lead_number: e.target.value })} placeholder="LEAD-0001" className={inputCls} />
                    </Field>
                    <div className="lg:col-span-2">
                    <Field label="Created Date">
                      <div className="flex gap-2">
                        <input type="date" value={draft.created_from} onChange={(e) => setDraft({ ...draft, created_from: e.target.value })} className={inputCls} />
                        <input type="date" value={draft.created_to} onChange={(e) => setDraft({ ...draft, created_to: e.target.value })} className={inputCls} />
                      </div>
                    </Field>
                    </div>
                    <Field label="Requirement Note">
                      <input value={draft.requirement} onChange={(e) => setDraft({ ...draft, requirement: e.target.value })} placeholder="e.g. i7, 16GB" className={inputCls} />
                    </Field>
                    <Field label="Description Note">
                      <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="" className={inputCls} />
                    </Field>
                    <Field label="Delivery Address">
                      <input value={draft.delivery} onChange={(e) => setDraft({ ...draft, delivery: e.target.value })} placeholder="House, area, landmark..." className={inputCls} />
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => applyFilters({ ...EMPTY_FILTERS, status: filters.status, priority: filters.priority })}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]"
                    >
                      Apply Filters
                    </button>
                  </div>
                </form>
              )}

              {/* ACTIVE FILTER CHIPS */}
              {activeFilters.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeFilters.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded-full bg-[#17D65D]/10 px-2.5 py-1 text-xs text-gray-800"
                    >
                      <span className="font-semibold">{FILTER_LABELS[k]}:</span>
                      {filterDisplay(k, filters[k])}
                      <button
                        type="button"
                        onClick={() => applyFilters({ ...filters, [k]: "" })}
                        className="ml-0.5 text-gray-500 hover:text-gray-900"
                        aria-label={`Remove ${FILTER_LABELS[k]} filter`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {loading ? (
                <div className="p-6">
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-12 animate-pulse rounded bg-gray-100"
                      />
                    ))}
                  </div>
                </div>
              ) : error ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={fetchLeads}
                    className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Try again
                  </button>
                </div>
              ) : leads.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#17D65D]/10">
                    <svg
                      className="h-7 w-7 text-[#17D65D]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 6.707A1 1 0 013 6V4z"
                      />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900">
                    No leads found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {search || activeFilters.length
                      ? "Try adjusting your filters."
                      : "Get started by creating your first lead."}
                  </p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-4 rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]"
                  >
                    Create Lead
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Lead #
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Name
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Contact
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Source
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Priority
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Budget
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Assigned
                        </th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => {
                        const s = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
                        const p =
                          PRIORITY_STYLES[lead.priority] || PRIORITY_STYLES.medium;
                        const fullName = [lead.first_name, lead.last_name]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <tr
                            key={lead.id}
                            className="border-b border-gray-50 transition hover:bg-gray-50/70"
                          >
                            <td className="px-5 py-3">
                              <Link
                                href={`/leads/${lead.id}`}
                                className="whitespace-nowrap text-sm font-semibold text-gray-900 hover:text-[#17D65D]"
                              >
                                {lead.lead_number}
                              </Link>
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium text-gray-900">
                                {fullName}
                              </p>
                              {lead.profession && (
                                <p className="text-[11px] text-gray-500">
                                  {professionText(lead.profession, lead.profession_other)}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-sm text-gray-700">
                                {lead.whatsapp || lead.phone || "-"}
                              </p>
                              {lead.city && (
                                <p className="text-[11px] text-gray-500">
                                  {lead.city}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                              {lead.source_name || "-"}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${s.dot}`}
                                />
                                {s.label}
                              </span>
                              {lead.follow_up_local && !lead.follow_up_done && (
                                <p
                                  className={`mt-1 whitespace-nowrap text-[11px] font-medium ${
                                    isOverdue(lead.follow_up_local) ? "text-red-600" : "text-indigo-600"
                                  }`}
                                >
                                  📅 {fmtFollowUp(lead.follow_up_local)}
                                </p>
                              )}
                              {lead.handover_id && (
                                <p className="mt-1 whitespace-nowrap text-[11px] font-semibold text-green-700">
                                  📦 {lead.order_number}
                                </p>
                              )}
                              {lead.status === "lost" && lead.lost_reason && (
                                <p className="mt-1 text-[11px] text-red-600">
                                  {lostReasonText(lead.lost_reason, lead.lost_reason_other)}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.bg} ${p.text}`}
                              >
                                {p.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-700">
                              {lead.budget_range ? BUDGET_LABELS[lead.budget_range] || lead.budget_range : "-"}
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                              {lead.assigned_name || "Unassigned"}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Link
                                  href={`/leads/${lead.id}`}
                                  className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                                  title="View"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                </Link>
                                <Link
                                  href={`/leads/${lead.id}/edit`}
                                  className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                                  title="Edit"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </Link>
                                {can("leads.delete") && (
                                <button
                                  onClick={() => handleDelete(lead.id, fullName)}
                                  className="rounded-lg p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                                  title="Delete"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION */}
              {!loading && !error && leads.length > 0 && pagination.total_pages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                  <p className="text-xs text-gray-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1}-
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{" "}
                    of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {Array.from({ length: Math.min(5, pagination.total_pages) }).map(
                      (_, i) => {
                        const start = Math.max(
                          1,
                          Math.min(
                            pagination.page - 2,
                            pagination.total_pages - 4
                          )
                        );
                        const pNum = start + i;
                        if (pNum > pagination.total_pages) return null;
                        return (
                          <button
                            key={pNum}
                            onClick={() => setPage(pNum)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              pNum === pagination.page
                                ? "bg-[#17D65D] text-black"
                                : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {pNum}
                          </button>
                        );
                      }
                    )}
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(pagination.total_pages, p + 1))
                      }
                      disabled={pagination.page === pagination.total_pages}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* IMPORT MODAL */}
      {showImport && (
        <ImportLeadsModal
          onClose={() => setShowImport(false)}
          onImported={fetchLeads}
        />
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <CreateLeadModal
          users={users}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchLeads();
          }}
        />
      )}
    </>
  );
}

/* ============================================================
   STAT CARD
============================================================ */
function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      <div
        className="pointer-events-none absolute -right-4 -top-4 h-14 w-14 rounded-full opacity-[0.08]"
        style={{ backgroundColor: accent }}
      />
    </div>
  );
}

/* ============================================================
   CREATE LEAD MODAL
============================================================ */
function CreateLeadModal({
  users,
  onClose,
  onCreated,
}: {
  users: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validateLeadForm(form);
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || `Failed to create lead (${res.status})`
        );
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Create New Lead</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <LeadFormFields form={form} setForm={setForm} users={users} />
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#15c455] disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
