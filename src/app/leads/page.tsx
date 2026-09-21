"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

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

interface Source {
  id: number;
  name: string;
}

interface City {
  id: number;
  name: string;
}

interface UserOption {
  id: number;
  name: string;
}

/* ============================================================
   HELPERS
============================================================ */
function formatCurrency(n: number): string {
  return "Rs " + (n || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; label: string; dot: string }
> = {
  new: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "New" },
  contacted: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500", label: "Contacted" },
  qualified: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500", label: "Qualified" },
  proposal: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Proposal" },
  negotiation: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", label: "Negotiation" },
  won: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", label: "Won" },
  lost: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Lost" },
  junk: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400", label: "Junk" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
  medium: { bg: "bg-blue-50", text: "text-blue-700", label: "Medium" },
  high: { bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  urgent: { bg: "bg-red-50", text: "text-red-700", label: "Urgent" },
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "junk", label: "Junk" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:bg-white focus:ring-2 focus:ring-[#17D65D]/20";

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
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Load reference data ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, cRes, uRes] = await Promise.all([
          fetch("/api/lead-sources", { credentials: "include" }),
          fetch("/api/cities", { credentials: "include" }),
          fetch("/api/users", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (sRes.ok) {
          const j = await sRes.json();
          setSources(j.data || []);
        }
        if (cRes.ok) {
          const j = await cRes.json();
          setCities(j.data || []);
        }
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
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (statusFilter) qs.set("status", statusFilter);
      if (priorityFilter) qs.set("priority", priorityFilter);
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
  }, [search, statusFilter, priorityFilter, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /* ---------- Reset page on filter change ---------- */
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter]);

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
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={inputCls}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className={inputCls}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setPriorityFilter("");
                    setPage(1);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Reset Filters
                </button>
              </div>
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
                    {search || statusFilter || priorityFilter
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

      {/* CREATE MODAL */}
      {showCreate && (
        <CreateLeadModal
          sources={sources}
          cities={cities}
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
   FIELD
============================================================ */
function Field({
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
   CREATE LEAD MODAL
============================================================ */
function CreateLeadModal({
  sources,
  cities,
  users,
  onClose,
  onCreated,
}: {
  sources: Source[];
  cities: City[];
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
    source_id: "",
    city_id: "",
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
        source_id: form.source_id ? Number(form.source_id) : null,
        city_id: form.city_id ? Number(form.city_id) : null,
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
                value={form.source_id}
                onChange={(e) => set("source_id", e.target.value)}
                className={inputCls}
              >
                <option value="">Select source</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="City">
              <select
                value={form.city_id}
                onChange={(e) => set("city_id", e.target.value)}
                className={inputCls}
              >
                <option value="">Select city</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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