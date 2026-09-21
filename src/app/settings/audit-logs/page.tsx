"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface AuditLogRow {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  old_values: unknown | null;
  new_values: unknown | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface Filters {
  actions: string[];
  entity_types: string[];
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const ACTION_STYLE: Record<string, string> = {
  login: "border-blue-200 bg-blue-50 text-blue-700",
  logout: "border-gray-200 bg-gray-50 text-gray-600",
  register: "border-purple-200 bg-purple-50 text-purple-700",
  create: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  update: "border-amber-200 bg-amber-50 text-amber-700",
  delete: "border-red-200 bg-red-50 text-red-600",
};

function actionStyle(action: string): string {
  return (
    ACTION_STYLE[action] || "border-gray-200 bg-gray-50 text-gray-700"
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

/* ============================================================
   PAGE
============================================================ */
export default function AuditLogsPage() {
  return (
    <>
      <Navbar />
      <AuditLogsMain />
    </>
  );
}

/* ============================================================
   MAIN WRAPPER
============================================================ */
function AuditLogsMain() {
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
    const onCustom = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "erp_sidebar_collapsed") read();
    };
    window.addEventListener("erp:sidebar-collapse", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("erp:sidebar-collapse", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <main
      className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-64"
      }`}
    >
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <AuditLogsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function AuditLogsContent() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [filters, setFilters] = useState<Filters>({
    actions: [],
    entity_types: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ---- Fetch ---- */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity_type", entityFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load audit logs.");
      }

      const json = await res.json();
      setLogs(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
      if (json.filters) setFilters(json.filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, entityFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = setTimeout(fetchLogs, 250);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  /* ---- Reset page on filter change ---- */
  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, entityFilter, dateFrom, dateTo]);

  const resetFilters = () => {
    setSearch("");
    setActionFilter("");
    setEntityFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasFilters =
    !!search || !!actionFilter || !!entityFilter || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audit Logs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Track every action taken by users in your workspace.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {pagination.total.toLocaleString()} total entries
        </div>
      </div>

      {/* ============ TOOLBAR ============ */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
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
                d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search action, entity, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All actions</option>
            {filters.actions.map((a) => (
              <option key={a} value={a}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All entities</option>
            {filters.entity_types.map((e) => (
              <option key={e} value={e}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
            className={inputCls}
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
            className={inputCls}
          />
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">Showing filtered results</p>
            <button
              onClick={resetFilters}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ============ TABLE ============ */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Action
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Entity
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell">
                  User
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  IP
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600">{error}</p>
                    <button
                      onClick={fetchLogs}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No logs match your filters."
                        : "No audit entries yet. Actions will appear here as they happen."}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isOpen = expandedId === log.id;
                  const hasDetails =
                    log.old_values !== null || log.new_values !== null;
                  return (
                    <FragmentRow
                      key={log.id}
                      log={log}
                      isOpen={isOpen}
                      hasDetails={hasDetails}
                      onToggle={() =>
                        setExpandedId(isOpen ? null : log.id)
                      }
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ---- Pagination ---- */}
        {!loading &&
          !error &&
          logs.length > 0 &&
          pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
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
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-3 text-xs font-medium text-gray-700">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.total_pages, p + 1))
                  }
                  disabled={pagination.page === pagination.total_pages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/* ============================================================
   ROW COMPONENT
   Extracted to avoid React `<>` fragment key issues and to
   keep the map() return simple.
============================================================ */
function FragmentRow({
  log,
  isOpen,
  hasDetails,
  onToggle,
}: {
  log: AuditLogRow;
  isOpen: boolean;
  hasDetails: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`transition hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`}>
        <td className="px-4 py-3.5">
          {hasDetails ? (
            <button
              onClick={onToggle}
              className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
              title={isOpen ? "Hide details" : "Show details"}
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ) : (
            <div className="h-5 w-5" />
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3.5">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${actionStyle(
              log.action
            )}`}
          >
            {log.action}
          </span>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
          {log.entity_type ? (
            <span className="text-sm text-gray-700">
              <span className="capitalize">{log.entity_type}</span>
              {log.entity_id && (
                <span className="ml-1 text-xs text-gray-400">
                  #{log.entity_id}
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3.5 sm:table-cell">
          {log.user_id ? (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#17D65D]/10 text-[10px] font-semibold text-[#0fa846]">
                {initials(log.user_name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-800">
                  {log.user_name || "Unknown"}
                </div>
                {log.user_email && (
                  <div className="truncate text-xs text-gray-400">
                    {log.user_email}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-400">System</span>
          )}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3.5 text-xs text-gray-500 lg:table-cell">
          {log.ip_address || "—"}
        </td>
        <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600">
          <span title={absoluteTime(log.created_at)}>
            {relativeTime(log.created_at)}
          </span>
        </td>
      </tr>

      {isOpen && hasDetails && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {log.old_values !== null && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Before
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700">
                    {JSON.stringify(log.old_values, null, 2)}
                  </pre>
                </div>
              )}
              {log.new_values !== null && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    After
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700">
                    {JSON.stringify(log.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {log.user_agent && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  User agent
                </div>
                <p className="truncate rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
                  {log.user_agent}
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}