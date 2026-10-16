"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface SupplierLite {
  id: number;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  ntn: string | null;
  strn: string | null;
  payment_terms: string | null;
  opening_balance?: number;
  current_balance?: number;
}

interface ProductLite {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  purchase_price: number;
  sale_price: number;
  tax_rate: number;
  unit_name: string | null;
  unit_short_name: string | null;
  category_name: string | null;
  current_stock?: number;
}

interface BucketItem {
  key: string;
  product_id: number;
  product_name: string;
  sku: string;
  barcode: string | null;
  unit_short_name: string;
  category_name: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  line_total: number;
  current_stock: number;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: "draft" | "ordered" | "received" | "cancelled";
  total_amount: number;
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
  ordered: "border-blue-200 bg-blue-50 text-blue-600",
  received: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

const STOCK_STYLE: Record<string, string> = {
  ok: "text-gray-500",
  low: "text-amber-600",
  out: "text-red-600",
};

function formatCurrency(n: number): string {
  return (
    "Rs " +
    (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function genKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function computeLineTotal(item: {
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
}): number {
  const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const discount = gross * ((Number(item.discount_percent) || 0) / 100);
  const taxable = gross - discount;
  const tax = taxable * ((Number(item.tax_rate) || 0) / 100);
  return Math.round((taxable + tax) * 100) / 100;
}

function stockLevel(stock: number): "ok" | "low" | "out" {
  if (stock <= 0) return "out";
  if (stock <= 10) return "low";
  return "ok";
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
        <PurchaseOrdersContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function PurchaseOrdersContent() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);

  const [showModal, setShowModal] = useState(false);

  /* ---- Load suppliers for the filter dropdown ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/suppliers?limit=500", {
          credentials: "include",
        });
        if (cancelled || !res.ok) return;
        const j = await res.json();
        setSuppliers(j.data || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Fetch purchase orders ---- */
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
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
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

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, supplierFilter]);

  const handleDelete = async (po: PurchaseOrder) => {
    if (
      !window.confirm(
        `Delete purchase order "${po.po_number}"? Stock will be reverted if it was received.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchOrders();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete purchase order"
      );
    }
  };

  const hasFilters = !!search || !!statusFilter || !!supplierFilter;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Purchase Orders
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Create purchase invoices that automatically update stock.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {pagination.total.toLocaleString()} total orders
        </div>
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
              placeholder="Search PO number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:max-w-[200px]"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setSupplierFilter("");
                setPage(1);
              }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New purchase order
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  PO #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Supplier
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Order date
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  Expected
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Items
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Total
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600">{error}</p>
                    <button
                      onClick={fetchOrders}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No purchase orders match your filters."
                        : "No purchase orders yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="font-mono text-xs font-medium text-gray-900">
                        {po.po_number}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-medium text-gray-900">
                        {po.supplier_name}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">
                      {formatDate(po.order_date)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 lg:table-cell">
                      {formatDate(po.expected_date)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600 md:table-cell">
                      {po.item_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(po.total_amount))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLE[po.status] || STATUS_STYLE.draft
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(po)}
                        className="text-sm font-medium text-gray-700 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading &&
          !error &&
          orders.length > 0 &&
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

      {showModal && (
        <PurchaseOrderModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   PURCHASE ORDER MODAL
============================================================ */
function PurchaseOrderModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  /* ---------- header ---------- */
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierLite | null>(null);
  const [orderDate, setOrderDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [updateStock, setUpdateStock] = useState(true);

  /* ---------- bucket (cart) ---------- */
  const [bucket, setBucket] = useState<BucketItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ---------- bucket ops ---------- */
  const addToBucket = useCallback((product: ProductLite) => {
    setBucket((prev) => {
      const existing = prev.find((x) => x.product_id === product.id);
      if (existing) {
        return prev.map((x) =>
          x.product_id === product.id
            ? {
                ...x,
                quantity: x.quantity + 1,
                line_total: computeLineTotal({
                  ...x,
                  quantity: x.quantity + 1,
                }),
              }
            : x
        );
      }
      const item: BucketItem = {
        key: genKey(),
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        unit_short_name: product.unit_short_name || "pcs",
        category_name: product.category_name,
        quantity: 1,
        unit_price: Number(product.purchase_price) || 0,
        tax_rate: Number(product.tax_rate) || 0,
        discount_percent: 0,
        current_stock: Number(product.current_stock) || 0,
        line_total: 0,
      };
      item.line_total = computeLineTotal(item);
      return [...prev, item];
    });
  }, []);

  const updateBucketItem = (key: string, patch: Partial<BucketItem>) => {
    setBucket((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        next.line_total = computeLineTotal(next);
        return next;
      })
    );
  };

  const removeBucketItem = (key: string) =>
    setBucket((prev) => prev.filter((it) => it.key !== key));

  const clearBucket = () => {
    if (bucket.length === 0) return;
    if (window.confirm("Clear all items from bucket?")) setBucket([]);
  };

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    const subtotal = bucket.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      const discount = gross * (it.discount_percent / 100);
      return acc + (gross - discount);
    }, 0);
    const discountTotal = bucket.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      return acc + gross * (it.discount_percent / 100);
    }, 0);
    const tax = bucket.reduce((acc, it) => {
      const gross = it.quantity * it.unit_price;
      const discount = gross * (it.discount_percent / 100);
      return acc + (gross - discount) * (it.tax_rate / 100);
    }, 0);
    const grand = subtotal + tax;
    const totalQty = bucket.reduce((acc, it) => acc + it.quantity, 0);
    return { subtotal, discountTotal, tax, grand, totalQty };
  }, [bucket]);

  /* ---------- submit ---------- */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!selectedSupplier) {
      setError("Please select a supplier.");
      return;
    }
    if (!orderDate) {
      setError("Order date is required.");
      return;
    }
    if (bucket.length === 0) {
      setError("Your bucket is empty. Add at least one product.");
      return;
    }
    for (const it of bucket) {
      if (it.quantity <= 0) {
        setError(`Quantity for "${it.product_name}" must be greater than 0.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        supplier_id: selectedSupplier.id,
        order_date: orderDate,
        expected_date: expectedDate || null,
        status,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        update_stock: updateStock && status === "received",
        items: bucket.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          tax_rate: Number(it.tax_rate) || 0,
          discount_percent: Number(it.discount_percent) || 0,
          line_total: computeLineTotal(it),
        })),
        subtotal: Math.round(totals.subtotal * 100) / 100,
        discount_amount: Math.round(totals.discountTotal * 100) / 100,
        tax_amount: Math.round(totals.tax * 100) / 100,
        total_amount: Math.round(totals.grand * 100) / 100,
      };

      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to save purchase order."
        );
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- render ---------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              New Purchase Invoice
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Select supplier and add products to your bucket.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
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

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              {/* ============ LEFT: Supplier + Product picker ============ */}
              <div className="space-y-5 lg:col-span-3">
                {/* SUPPLIER REAL-TIME SEARCH */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <SupplierSearch
                    selected={selectedSupplier}
                    onSelect={setSelectedSupplier}
                    onClear={() => setSelectedSupplier(null)}
                  />
                </div>

                {/* SUPPLIER DETAILS PANEL */}
                {selectedSupplier && (
                  <div className="rounded-lg border border-[#17D65D]/30 bg-[#17D65D]/5 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#17D65D]/20">
                        <svg
                          className="h-4 w-4 text-[#0fa846]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#0fa846]">
                          Supplier details
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          {selectedSupplier.name}
                        </div>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                      {selectedSupplier.company_name && (
                        <div className="col-span-2 sm:col-span-3">
                          <dt className="text-gray-500">Company</dt>
                          <dd className="text-gray-800">
                            {selectedSupplier.company_name}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.phone && (
                        <div>
                          <dt className="text-gray-500">Phone</dt>
                          <dd className="text-gray-800">
                            {selectedSupplier.phone}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.email && (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Email</dt>
                          <dd className="truncate text-gray-800">
                            {selectedSupplier.email}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.city && (
                        <div>
                          <dt className="text-gray-500">City</dt>
                          <dd className="text-gray-800">
                            {selectedSupplier.city}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.payment_terms && (
                        <div>
                          <dt className="text-gray-500">Terms</dt>
                          <dd className="text-gray-800">
                            {selectedSupplier.payment_terms}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.ntn && (
                        <div>
                          <dt className="text-gray-500">NTN</dt>
                          <dd className="font-mono text-gray-800">
                            {selectedSupplier.ntn}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.strn && (
                        <div>
                          <dt className="text-gray-500">STRN</dt>
                          <dd className="font-mono text-gray-800">
                            {selectedSupplier.strn}
                          </dd>
                        </div>
                      )}
                      {selectedSupplier.address && (
                        <div className="col-span-2 sm:col-span-3">
                          <dt className="text-gray-500">Address</dt>
                          <dd className="text-gray-800">
                            {selectedSupplier.address}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {/* PRODUCT REAL-TIME SEARCH */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-xs font-medium text-gray-700">
                      Add products to bucket
                    </label>
                    <span className="text-[11px] text-gray-400">
                      Tip: search by name, SKU, or barcode
                    </span>
                  </div>
                  <ProductSearch onAdd={addToBucket} />
                </div>

                {/* ORDER META */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Order date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Expected date
                    </label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={inputCls}
                    >
                      <option value="draft">Draft</option>
                      <option value="ordered">Ordered</option>
                      <option value="received">Received (updates stock)</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Reference
                    </label>
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. Quotation #"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes for this purchase order"
                    className={inputCls}
                  />
                </div>

                {/* STOCK UPDATE TOGGLE */}
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={updateStock}
                    onChange={(e) => setUpdateStock(e.target.checked)}
                    disabled={status !== "received"}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D] disabled:opacity-50"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-800">
                      Update stock on save
                    </span>
                    <span className="block text-xs text-gray-500">
                      {status === "received"
                        ? "Stock will be added to inventory when saved."
                        : "Set status to 'Received' to enable stock update."}
                    </span>
                  </div>
                </label>
              </div>

              {/* ============ RIGHT: Bucket ============ */}
              <div className="lg:col-span-2">
                <div className="sticky top-0 flex h-full flex-col rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      <h3 className="text-sm font-semibold text-gray-800">
                        Bucket
                      </h3>
                      <span className="rounded-full bg-[#17D65D]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0fa846]">
                        {bucket.length}
                      </span>
                    </div>
                    {bucket.length > 0 && (
                      <button
                        type="button"
                        onClick={clearBucket}
                        className="text-xs font-medium text-gray-500 hover:text-red-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {bucket.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                        <svg
                          className="h-6 w-6 text-gray-400"
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
                      <p className="text-sm font-medium text-gray-700">
                        Your bucket is empty
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Search and select products on the left to add them here.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Bucket items */}
                      <div className="max-h-[380px] flex-1 overflow-y-auto">
                        <ul className="divide-y divide-gray-200">
                          {bucket.map((it) => (
                            <li
                              key={it.key}
                              className="bg-white px-4 py-3 transition hover:bg-gray-50"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-gray-900">
                                    {it.product_name}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                                    <span className="font-mono">
                                      {it.sku}
                                    </span>
                                    <span>·</span>
                                    <span>Per {it.unit_short_name}</span>
                                    <span>·</span>
                                    <span
                                      className={
                                        STOCK_STYLE[stockLevel(it.current_stock)]
                                      }
                                    >
                                      Stock: {it.current_stock}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeBucketItem(it.key)}
                                  className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
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
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </div>

                              {/* Editable row */}
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-medium uppercase text-gray-400">
                                    Qty
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={it.quantity}
                                    onChange={(e) =>
                                      updateBucketItem(it.key, {
                                        quantity:
                                          Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D] focus:ring-1 focus:ring-[#17D65D]/30"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-medium uppercase text-gray-400">
                                    Price
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={it.unit_price}
                                    onChange={(e) =>
                                      updateBucketItem(it.key, {
                                        unit_price:
                                          Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D] focus:ring-1 focus:ring-[#17D65D]/30"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-medium uppercase text-gray-400">
                                    Disc %
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={it.discount_percent}
                                    onChange={(e) =>
                                      updateBucketItem(it.key, {
                                        discount_percent:
                                          Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D] focus:ring-1 focus:ring-[#17D65D]/30"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-medium uppercase text-gray-400">
                                    Tax %
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={it.tax_rate}
                                    onChange={(e) =>
                                      updateBucketItem(it.key, {
                                        tax_rate:
                                          Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-[#17D65D] focus:ring-1 focus:ring-[#17D65D]/30"
                                  />
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                  Line total
                                </span>
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(
                                    computeLineTotal(it)
                                  )}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Totals */}
                      <div className="space-y-1.5 border-t border-gray-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">
                            Total qty
                          </span>
                          <span className="font-medium text-gray-700">
                            {totals.totalQty}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="text-gray-800">
                            {formatCurrency(totals.subtotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Discount</span>
                          <span className="text-gray-800">
                            − {formatCurrency(totals.discountTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Tax</span>
                          <span className="text-gray-800">
                            {formatCurrency(totals.tax)}
                          </span>
                        </div>
                        <div className="my-1.5 border-t border-gray-200" />
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">
                            Grand total
                          </span>
                          <span className="text-base font-bold text-[#0fa846]">
                            {formatCurrency(totals.grand)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <div className="text-xs text-gray-500">
              {bucket.length > 0 && selectedSupplier ? (
                <>
                  {bucket.length} item{bucket.length !== 1 ? "s" : ""} · Grand
                  total{" "}
                  <span className="font-semibold text-gray-800">
                    {formatCurrency(totals.grand)}
                  </span>
                </>
              ) : (
                "Select a supplier and add products to continue."
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || bucket.length === 0 || !selectedSupplier}
                className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Creating invoice..."
                  : status === "received" && updateStock
                  ? "Create invoice & update stock"
                  : "Create purchase invoice"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   SUPPLIER SEARCH (real-time)
============================================================ */
function SupplierSearch({
  selected,
  onSelect,
  onClear,
}: {
  selected: SupplierLite | null;
  onSelect: (s: SupplierLite) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SupplierLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Debounced server search */
  useEffect(() => {
    if (selected) return;
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        params.set("limit", "20");
        const res = await fetch(
          `/api/suppliers?${params.toString()}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        setResults(json.data || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, open, selected]);

  /* Click-outside */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Keyboard nav */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) {
        onSelect(pick);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-[#17D65D] bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#17D65D]/15 text-[#0fa846]">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              {selected.name}
            </div>
            {selected.company_name && (
              <div className="text-[11px] text-gray-500">
                {selected.company_name}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onClear();
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-600"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
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
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search supplier by name, company, phone, email..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
        />
        {loading && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#17D65D]" />
          </div>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              Searching suppliers...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {query
                ? `No suppliers match "${query}".`
                : "Start typing to search suppliers..."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((s, idx) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => {
                      onSelect(s);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition ${
                      idx === highlight ? "bg-[#17D65D]/10" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {s.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                        {s.company_name && <span>{s.company_name}</span>}
                        {s.phone && (
                          <>
                            <span>·</span>
                            <span>{s.phone}</span>
                          </>
                        )}
                        {s.city && (
                          <>
                            <span>·</span>
                            <span>{s.city}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {idx === highlight && (
                      <span className="shrink-0 self-center rounded bg-[#17D65D] px-1.5 py-0.5 text-[10px] font-semibold text-black">
                        ↵
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PRODUCT SEARCH (real-time)
============================================================ */
function ProductSearch({ onAdd }: { onAdd: (p: ProductLite) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [recentlyAdded, setRecentlyAdded] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        params.set("status", "active");
        params.set("limit", "25");
        const res = await fetch(
          `/api/products?${params.toString()}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        setResults(json.data || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAdd = (p: ProductLite) => {
    onAdd(p);
    setRecentlyAdded(p.id);
    setTimeout(() => setRecentlyAdded(null), 1200);
    // keep search open for continuous adding
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) handleAdd(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
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
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products by name, SKU, or barcode..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
        />
        {loading && (
          <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#17D65D]" />
          </div>
        )}
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              Searching products...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {query
                ? `No products match "${query}".`
                : "Start typing to search products..."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((p, idx) => {
                const level = stockLevel(p.current_stock ?? 0);
                const justAdded = recentlyAdded === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => handleAdd(p)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                        justAdded
                          ? "bg-[#17D65D]/20"
                          : idx === highlight
                          ? "bg-[#17D65D]/10"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {p.name}
                          </span>
                          {justAdded && (
                            <span className="shrink-0 rounded bg-[#17D65D] px-1.5 py-0.5 text-[10px] font-semibold text-black">
                              ADDED
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                          <span className="font-mono">{p.sku}</span>
                          {p.barcode && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{p.barcode}</span>
                            </>
                          )}
                          {p.unit_short_name && (
                            <>
                              <span>·</span>
                              <span>Per {p.unit_short_name}</span>
                            </>
                          )}
                          {p.category_name && (
                            <>
                              <span>·</span>
                              <span>{p.category_name}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className={STOCK_STYLE[level]}>
                            Stock: {p.current_stock ?? 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(p.purchase_price))}
                        </span>
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#17D65D]/40 bg-[#17D65D]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#0fa846]">
                          <svg
                            className="h-2.5 w-2.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          ADD
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
