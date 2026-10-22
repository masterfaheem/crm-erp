"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_GROUPS,
  leadSourceLabel,
} from "@/lib/leadOptions";
import { ExportMenu, ImportLeadsModal } from "./LeadsImportExport";
import {
  CitySelect,
  Field,
  PRIORITY_OPTIONS,
  PRIORITY_STYLES,
  STATUS_OPTIONS,
  STATUS_STYLES,
  formatCurrency,
  inputCls,
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
  email: "",
  company: "",
  designation: "",
  city: "",
  source: "",
  assigned_to: "",
  value_min: "",
  value_max: "",
  close_from: "",
  close_to: "",
  created_from: "",
  created_to: "",
  address: "",
  notes: "",
};
type Filters = typeof EMPTY_FILTERS;

const FILTER_LABELS: Record<keyof Filters, string> = {
  status: "Status",
  priority: "Priority",
  lead_number: "Lead #",
  name: "Name",
  phone: "Phone",
  email: "Email",
  company: "Company",
  designation: "Designation",
  city: "City",
  source: "Source",
  assigned_to: "Assigned",
  value_min: "Value ≥",
  value_max: "Value ≤",
  close_from: "Close from",
  close_to: "Close to",
  created_from: "Created from",
  created_to: "Created to",
  address: "Address",
  notes: "Notes",
};

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
      if (!res.ok) throw new Error("Delete failed");
      fetchLeads();
    } catch {
      window.alert("Failed to delete lead");
    }
  };

  const totalValue = useMemo(
    () => leads.reduce((s, l) => s + Number(l.estimated_value || 0), 0),
    [leads]
  );

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
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Import
              </button>
              <ExportMenu query={exportQuery} />
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
              </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Total Leads"
                value={pagination.total.toLocaleString()}
                accent="#3B82F6"
              />
              <StatCard
                label="On This Page"
                value={leads.length.toString()}
                accent="#17D65D"
              />
              <StatCard
                label="Page Value"
                value={formatCurrency(totalValue)}
                accent="#F59E0B"
              />
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
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="First or last name" className={inputCls} />
                    </Field>
                    <Field label="Phone / WhatsApp">
                      <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="0300..." className={inputCls} />
                    </Field>
                    <Field label="Email">
                      <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Lead #">
                      <input value={draft.lead_number} onChange={(e) => setDraft({ ...draft, lead_number: e.target.value })} placeholder="LEAD-0001" className={inputCls} />
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
                    <Field label="Assigned To">
                      <select value={draft.assigned_to} onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })} className={inputCls}>
                        <option value="">Anyone</option>
                        <option value="unassigned">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Company">
                      <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Designation">
                      <input value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Estimated Value (Rs)">
                      <div className="flex gap-2">
                        <input type="number" min="0" value={draft.value_min} onChange={(e) => setDraft({ ...draft, value_min: e.target.value })} placeholder="Min" className={inputCls} />
                        <input type="number" min="0" value={draft.value_max} onChange={(e) => setDraft({ ...draft, value_max: e.target.value })} placeholder="Max" className={inputCls} />
                      </div>
                    </Field>
                    <div className="lg:col-span-2">
                    <Field label="Expected Close">
                      <div className="flex gap-2">
                        <input type="date" value={draft.close_from} onChange={(e) => setDraft({ ...draft, close_from: e.target.value })} className={inputCls} />
                        <input type="date" value={draft.close_to} onChange={(e) => setDraft({ ...draft, close_to: e.target.value })} className={inputCls} />
                      </div>
                    </Field>
                    </div>
                    <div className="lg:col-span-2">
                    <Field label="Created Date">
                      <div className="flex gap-2">
                        <input type="date" value={draft.created_from} onChange={(e) => setDraft({ ...draft, created_from: e.target.value })} className={inputCls} />
                        <input type="date" value={draft.created_to} onChange={(e) => setDraft({ ...draft, created_to: e.target.value })} className={inputCls} />
                      </div>
                    </Field>
                    </div>
                    <Field label="Address">
                      <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Notes">
                      <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} />
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
                  <table className="w-full min-w-[1000px]">
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
                          Assigned
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Priority
                        </th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Value
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
                                className="text-sm font-semibold text-gray-900 hover:text-[#17D65D]"
                              >
                                {lead.lead_number}
                              </Link>
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium text-gray-900">
                                {fullName}
                              </p>
                              {lead.company_name && (
                                <p className="text-[11px] text-gray-500">
                                  {lead.company_name}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-sm text-gray-700">
                                {lead.phone || "-"}
                              </p>
                              {lead.email && (
                                <p className="text-[11px] text-gray-500">
                                  {lead.email}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                              {lead.source_name || "-"}
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                              {lead.assigned_name || "Unassigned"}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${s.dot}`}
                                />
                                {s.label}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.bg} ${p.text}`}
                              >
                                {p.label}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900">
                              {formatCurrency(Number(lead.estimated_value))}
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
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    phone: "",
    alternate_phone: "",
    whatsapp: "",
    designation: "",
    source: "",
    city: "",
    assigned_to: "",
    status: "new",
    priority: "medium",
    estimated_value: "",
    expected_close_date: "",
    address: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim()) {
      setError("First name is required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        company_name: form.company_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        alternate_phone: form.alternate_phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        designation: form.designation.trim() || null,
        source: form.source || null,
        source_name:
          LEAD_SOURCES.find((s) => s.value === form.source)?.label || null,
        city: form.city || null,
        city_name: form.city || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        status: form.status,
        priority: form.priority,
        estimated_value: form.estimated_value
          ? Number(form.estimated_value)
          : 0,
        expected_close_date: form.expected_close_date || null,
        address: form.address.trim() || null,
        description: form.description.trim() || null,
      };

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ||
            `Failed to create lead (${res.status})`
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
          <h2 className="text-base font-semibold text-gray-900">
            Create New Lead
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First Name" required>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Last Name">
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Company">
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Designation">
              <input
                type="text"
                value={form.designation}
                onChange={(e) => set("designation", e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Phone">
              <input
                type="text"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="WhatsApp">
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Source">
              <select
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                className={inputCls}
              >
                <option value="">Select source</option>
                {LEAD_SOURCE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {LEAD_SOURCES.filter((s) => s.group === g).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            <Field label="City">
              <CitySelect
                value={form.city}
                onChange={(v) => set("city", v)}
              />
            </Field>
            <Field label="Assigned To">
              <select
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className={inputCls}
              >
                {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Estimated Value (Rs)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_value}
                onChange={(e) => set("estimated_value", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Expected Close Date">
              <input
                type="date"
                value={form.expected_close_date}
                onChange={(e) => set("expected_close_date", e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Address">
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Description / Notes">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
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
              {saving ? "Saving..." : "Create Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
