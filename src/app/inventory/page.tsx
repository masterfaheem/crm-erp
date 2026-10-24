"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import StockModal from "./StockModal";

/* ============================================================
   TYPES
============================================================ */
interface StockRow {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  product_type: "product" | "service";
  current_stock: number;
  opening_stock: number;
  min_stock: number;
  max_stock: number;
  reorder_level: number;
  purchase_price: number;
  sale_price: number;
  stock_value: number;
  status: "active" | "inactive" | "discontinued";
  track_inventory: number;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_short_name: string | null;
  last_updated: string | null;
}

interface CategoryLite {
  id: number;
  name: string;
  color: string | null;
}

interface KPIs {
  total_products: number;
  total_stock_qty: number;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  healthy_count: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

type StockHealth = "healthy" | "low" | "out" | "overstock" | "untracked";

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const HEALTH_STYLE: Record<StockHealth, { badge: string; dot: string; label: string }> = {
  healthy: {
    badge: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
    dot: "bg-[#17D65D]",
    label: "Healthy",
  },
  low: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    label: "Low stock",
  },
  out: {
    badge: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
    label: "Out of stock",
  },
  overstock: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    label: "Overstock",
  },
  untracked: {
    badge: "border-gray-200 bg-gray-50 text-gray-600",
    dot: "bg-gray-400",
    label: "Not tracked",
  },
};

function formatCurrency(n: number): string {
  return (
    "Rs " +
    (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })
  );
}

function formatNumber(n: number): string {
  return (Number(n) || 0).toLocaleString("en-PK", {
    maximumFractionDigits: 3,
  });
}

/* cost / value is hidden (null) for users without "see cost price" */
function money(v: number | null | undefined): string {
  return v === null || v === undefined ? "🔒" : formatCurrency(v);
}

function getHealth(row: StockRow): StockHealth {
  if (!row.track_inventory) return "untracked";
  const stock = Number(row.current_stock) || 0;
  const min = Number(row.min_stock) || 0;
  const max = Number(row.max_stock) || 0;
  const reorder = Number(row.reorder_level) || 0;

  if (stock <= 0) return "out";
  if (reorder > 0 && stock <= reorder) return "low";
  if (min > 0 && stock <= min) return "low";
  if (max > 0 && stock > max) return "overstock";
  return "healthy";
}

/* ============================================================
   PAGE
============================================================ */
export default function InventoryStockLevelsPage() {
  return (
    <>
      <Navbar />
      <InventoryMain />
    </>
  );
}

function InventoryMain() {
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
        <InventoryContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function InventoryContent() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [kpis, setKpis] = useState<KPIs>({
    total_products: 0,
    total_stock_qty: 0,
    total_stock_value: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    healthy_count: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState<"" | StockHealth>("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"table" | "cards">("table");
  const [stockModal, setStockModal] = useState<{ id: number; name: string; tab: "adjust" | "history" } | null>(null);

  /* ---- Load categories ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/product-categories", {
          credentials: "include",
        });
        if (cancelled || !res.ok) return;
        const j = await res.json();
        setCategories(j.data || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Fetch stock ---- */
  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category_id", categoryFilter);
      if (typeFilter) params.set("product_type", typeFilter);
      if (healthFilter) params.set("health", healthFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/inventory/stock?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load stock levels.");
      }
      const json = await res.json();
      setRows(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
      if (json.kpis) setKpis(json.kpis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, typeFilter, healthFilter, page]);

  useEffect(() => {
    const t = setTimeout(fetchStock, 250);
    return () => clearTimeout(t);
  }, [fetchStock]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, typeFilter, healthFilter]);

  /* ---- Derived KPIs (fallback if API doesn't return them) ---- */
  const derivedKpis: KPIs = useMemo(() => {
    if (kpis.total_products > 0 || kpis.total_stock_value > 0) return kpis;
    const total_products = rows.length;
    const total_stock_qty = rows.reduce(
      (a, r) => a + (Number(r.current_stock) || 0),
      0
    );
    const total_stock_value = rows.reduce(
      (a, r) => a + (Number(r.stock_value) || 0),
      0
    );
    const low_stock_count = rows.filter((r) => getHealth(r) === "low").length;
    const out_of_stock_count = rows.filter((r) => getHealth(r) === "out").length;
    const healthy_count = rows.filter((r) => getHealth(r) === "healthy").length;
    return {
      total_products,
      total_stock_qty,
      total_stock_value,
      low_stock_count,
      out_of_stock_count,
      healthy_count,
    };
  }, [rows, kpis]);

  const hasFilters =
    !!search || !!categoryFilter || !!typeFilter || !!healthFilter;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Stock Levels
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Real-time inventory positions across all products.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/import"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Import opening stock
          </Link>
          <button
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              view === "table"
                ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            Table
          </button>
          <button
            onClick={() => setView("cards")}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              view === "cards"
                ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Cards
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total products"
          value={formatNumber(derivedKpis.total_products)}
          hint="Tracked items"
          accent="gray"
          icon={
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
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          }
        />
        <KpiCard
          label="Stock value"
          value={money(derivedKpis.total_stock_value)}
          hint={`${formatNumber(derivedKpis.total_stock_qty)} total units`}
          accent="green"
          icon={
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
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <KpiCard
          label="Low stock"
          value={formatNumber(derivedKpis.low_stock_count)}
          hint="Needs reorder"
          accent="amber"
          icon={
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
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          }
        />
        <KpiCard
          label="Out of stock"
          value={formatNumber(derivedKpis.out_of_stock_count)}
          hint="Unavailable"
          accent="red"
          icon={
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
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          }
        />
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
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
              placeholder="Search by name, SKU, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:max-w-[180px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={healthFilter}
            onChange={(e) =>
              setHealthFilter(e.target.value as "" | StockHealth)
            }
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All health</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="overstock">Overstock</option>
            <option value="untracked">Not tracked</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All types</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setCategoryFilter("");
                setTypeFilter("");
                setHealthFilter("");
                setPage(1);
              }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={fetchStock}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* ERROR / LOADING / EMPTY */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={fetchStock}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : view === "table" ? (
        <StockTable rows={rows} onOpen={(r, tab) => setStockModal({ id: r.id, name: r.name, tab })} />
      ) : (
        <StockCards rows={rows} onOpen={(r, tab) => setStockModal({ id: r.id, name: r.name, tab })} />
      )}

      {stockModal && (
        <StockModal
          productId={stockModal.id}
          productName={stockModal.name}
          initialTab={stockModal.tab}
          onClose={() => setStockModal(null)}
          onChanged={fetchStock}
        />
      )}

      {/* PAGINATION */}
      {!loading && !error && rows.length > 0 && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page === 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
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
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   KPI CARD
============================================================ */
function KpiCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  accent: "gray" | "green" | "amber" | "red";
  icon: React.ReactNode;
}) {
  const accentBg: Record<typeof accent, string> = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-[#17D65D]/15 text-[#0fa846]",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-600",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
          </div>
          <div className="mt-1.5 truncate text-xl font-semibold text-gray-900">
            {value}
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">{hint}</div>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accentBg[accent]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STOCK TABLE VIEW
============================================================ */
type OpenFn = (r: StockRow, tab: "adjust" | "history") => void;

function StockTable({ rows, onOpen }: { rows: StockRow[]; onOpen: OpenFn }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Product
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                Category
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                SKU
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Stock
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                Reorder
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 xl:table-cell">
                Unit cost
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Health
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const health = getHealth(r);
              const style = HEALTH_STYLE[health];
              const stockPct =
                r.max_stock > 0
                  ? Math.min(
                      100,
                      Math.round((r.current_stock / r.max_stock) * 100)
                    )
                  : r.current_stock > 0
                  ? 100
                  : 0;

              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        <span className="truncate text-sm font-medium text-gray-900">
                          {r.name}
                        </span>
                      </div>
                      {r.unit_short_name && (
                        <div className="ml-3.5 text-[11px] text-gray-400">
                          Per {r.unit_short_name}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 lg:table-cell">
                    {r.category_name ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: r.category_color || "#17D65D",
                          }}
                        />
                        {r.category_name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                    <span className="font-mono text-xs text-gray-600">
                      {r.sku}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-sm font-semibold ${
                          health === "out"
                            ? "text-red-600"
                            : health === "low"
                            ? "text-amber-700"
                            : "text-gray-900"
                        }`}
                      >
                        {formatNumber(r.current_stock)}
                      </span>
                      {/* Progress bar */}
                      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full ${style.dot}`}
                          style={{ width: `${stockPct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-xs text-gray-500 lg:table-cell">
                    {r.reorder_level > 0
                      ? formatNumber(r.reorder_level)
                      : r.min_stock > 0
                      ? formatNumber(r.min_stock)
                      : "—"}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-xs text-gray-600 xl:table-cell">
                    {money(r.purchase_price)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">
                    {money(r.stock_value)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${style.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {style.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => onOpen(r, "adjust")}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:border-[#17D65D] hover:text-gray-900"
                      >
                        Adjust
                      </button>
                      <button
                        onClick={() => onOpen(r, "history")}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:border-[#17D65D] hover:text-gray-900"
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   STOCK CARDS VIEW
============================================================ */
function StockCards({ rows, onOpen }: { rows: StockRow[]; onOpen: OpenFn }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const health = getHealth(r);
        const style = HEALTH_STYLE[health];
        const stockPct =
          r.max_stock > 0
            ? Math.min(100, Math.round((r.current_stock / r.max_stock) * 100))
            : r.current_stock > 0
            ? 100
            : 0;

        return (
          <div
            key={r.id}
            className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-[#17D65D]/40 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900">
                  {r.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                  <span className="font-mono">{r.sku}</span>
                  {r.category_name && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: r.category_color || "#17D65D",
                          }}
                        />
                        {r.category_name}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                {style.label}
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400">
                  On hand
                </div>
                <div
                  className={`text-lg font-semibold ${
                    health === "out"
                      ? "text-red-600"
                      : health === "low"
                      ? "text-amber-700"
                      : "text-gray-900"
                  }`}
                >
                  {formatNumber(r.current_stock)}
                  {r.unit_short_name && (
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      {r.unit_short_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">
                  Value
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {money(r.stock_value)}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${style.dot} transition-all`}
                  style={{ width: `${stockPct}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                <span>
                  Min: {r.min_stock > 0 ? formatNumber(r.min_stock) : "—"}
                </span>
                <span>
                  Max: {r.max_stock > 0 ? formatNumber(r.max_stock) : "—"}
                </span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onOpen(r, "adjust")}
                className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-700 hover:border-[#17D65D]"
              >
                Adjust
              </button>
              <button
                onClick={() => onOpen(r, "history")}
                className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-700 hover:border-[#17D65D]"
              >
                History
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   SKELETON
============================================================ */
function SkeletonTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="bg-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={8} className="px-4 py-3.5">
                <div className="h-6 animate-pulse rounded bg-gray-100" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <svg
          className="h-7 w-7 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900">
        {hasFilters ? "No items match your filters" : "No stock data yet"}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-gray-500">
        {hasFilters
          ? "Try adjusting your search or clearing filters."
          : "Once you add products and receive stock via purchase orders, they'll appear here."}
      </p>
    </div>
  );
}
