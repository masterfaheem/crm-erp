"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface SupplierLite {
  id: number;
  name: string;
}

interface PurchaseOrderRow {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: "draft" | "pending" | "approved" | "partially_received" | "received" | "cancelled";
  subtotal: number;
  tax_total: number;
  discount_total: number;
  shipping_total: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  item_count: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-blue-200 bg-blue-50 text-blue-700",
  partially_received: "border-indigo-200 bg-indigo-50 text-indigo-700",
  received: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

function formatCurrency(n: number): string {
  return "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-PK", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return d;
  }
}

function prettyStatus(s: string): string {
  return s.replace(/_/g, " ");
}

/* ============================================================
   PAGE
============================================================ */
export default function PurchaseOrdersPage() {
  return (
    <>
      <Navbar />
      <PurchaseOrdersMain />
    </>
  );
}

function PurchaseOrdersMain() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true");
      } catch { /* ignore */ }
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
        <PurchaseOrdersContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function PurchaseOrdersContent() {
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 50, total: 0, total_pages: 0,
  });
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrderRow | null>(null);

  /* Load suppliers once */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/suppliers", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          setSuppliers(j.data || []);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (supplierFilter) params.set("supplier_id", supplierFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/purchase-orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load purchase orders.");
      }
      const json = await res.json();
      setOrders(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setTotalOrders(json.total_orders || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, supplierFilter, page]);

  useEffect(() => {
    const t = setTimeout(fetchOrders, 250);
    return () => clearTimeout(t);
  }, [fetchOrders]);

  useEffect(() => { setPage(1); }, [search, statusFilter, supplierFilter]);

  const handleDelete = async (o: PurchaseOrderRow) => {
    if (!window.confirm(`Delete purchase order "${o.po_number}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/purchase-orders/${o.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchOrders();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const hasFilters = !!search || !!statusFilter || !!supplierFilter;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Purchase Orders</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Create and track supplier purchase orders.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {totalOrders.toLocaleString()} total orders
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by PO# or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:max-w-[180px]"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="partially_received">Partially received</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch(""); setStatusFilter(""); setSupplierFilter(""); setPage(1);
              }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New order
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">PO #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Supplier</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Order date</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Expected</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3"><div className="h-6 animate-pulse rounded bg-gray-100" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-600">{error}</p>
                  <button onClick={fetchOrders} className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline">Try again</button>
                </td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {hasFilters ? "No purchase orders match your filters." : "No purchase orders yet. Create one to get started."}
                  </p>
                </td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="font-mono text-sm font-medium text-gray-900">{o.po_number}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{o.supplier_name}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(o.order_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(o.expected_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600 lg:table-cell">{o.item_count}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(o.grand_total))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[o.status] || STATUS_STYLE.draft}`}>
                        {prettyStatus(o.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => { setEditing(o); setShowModal(true); }}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button onClick={() => handleDelete(o)} className="text-sm font-medium text-gray-700 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && !error && orders.length > 0 && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >Previous</button>
              <span className="px-3 text-xs font-medium text-gray-700">{pagination.page} / {pagination.total_pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={pagination.page === pagination.total_pages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <PurchaseOrderModal
          order={editing}
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchOrders(); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   PO MODAL  (header + line items)
============================================================ */
interface DraftLine {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  discount_percent: string;
}

function newLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: "",
    description: "",
    quantity: "1",
    unit_price: "0",
    tax_rate: "0",
    discount_percent: "0",
  };
}

function calcLine(l: DraftLine) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const tax = Number(l.tax_rate) || 0;
  const disc = Number(l.discount_percent) || 0;

  const sub = qty * price;
  const discount = (sub * disc) / 100;
  const afterDisc = sub - discount;
  const taxAmt = (afterDisc * tax) / 100;
  const total = afterDisc + taxAmt;

  return {
    subtotal: sub,
    discount,
    tax: taxAmt,
    total,
  };
}

function PurchaseOrderModal({
  order,
  suppliers,
  onClose,
  onSaved,
}: {
  order: PurchaseOrderRow | null;
  suppliers: SupplierLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!order;

  const [supplierId, setSupplierId] = useState<string>(
    order?.supplier_id ? String(order.supplier_id) : ""
  );
  const [orderDate, setOrderDate] = useState<string>(
    order?.order_date?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState<string>(
    order?.expected_date?.slice(0, 10) || ""
  );
  const [status, setStatus] = useState<string>(order?.status || "draft");
  const [notes, setNotes] = useState(order?.notes || "");

  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* If editing, fetch line items */
  useEffect(() => {
    if (!isEdit || !order) return;
    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/purchase-orders/${order.id}`, { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled || !j.data) return;
        const items = (j.data.items || []) as Array<{
          product_id: number | null;
          description: string;
          quantity: number;
          unit_price: number;
          tax_rate: number;
          discount_percent: number;
        }>;
        if (items.length) {
          setLines(items.map((it) => ({
            key: Math.random().toString(36).slice(2),
            product_id: it.product_id ? String(it.product_id) : "",
            description: it.description || "",
            quantity: String(it.quantity ?? 0),
            unit_price: String(it.unit_price ?? 0),
            tax_rate: String(it.tax_rate ?? 0),
            discount_percent: String(it.discount_percent ?? 0),
          })));
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, order]);

  /* Totals */
  const totals = lines.reduce(
    (acc, l) => {
      const c = calcLine(l);
      acc.subtotal += c.subtotal;
      acc.discount += c.discount;
      acc.tax += c.tax;
      acc.total += c.total;
      return acc;
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!supplierId) { setError("Please choose a supplier."); return; }
    if (!orderDate) { setError("Order date is required."); return; }
    if (lines.some((l) => !l.description.trim())) {
      setError("Every line needs a description.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        order_date: orderDate,
        expected_date: expectedDate || null,
        status,
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product_id ? Number(l.product_id) : null,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          tax_rate: Number(l.tax_rate) || 0,
          discount_percent: Number(l.discount_percent) || 0,
        })),
      };

      const url = isEdit ? `/api/purchase-orders/${order!.id}` : "/api/purchase-orders";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Failed to save purchase order.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Edit ${order?.po_number}` : "New purchase order"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit ? "Update header and line items." : "Choose a supplier and add line items."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray
