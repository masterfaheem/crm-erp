"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
}

interface LineItem {
  key: string;
  product_id: number | null;
  product_name: string;
  sku: string;
  unit_short_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  line_total: number;
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

const readOnlyCls =
  "w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  ordered: "border-blue-200 bg-blue-50 text-blue-600",
  received: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  cancelled: "border-red-200 bg-red-50 text-red-600",
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

function emptyLine(): LineItem {
  return {
    key: genKey(),
    product_id: null,
    product_name: "",
    sku: "",
    unit_short_name: "",
    quantity: 1,
    unit_price: 0,
    tax_rate: 0,
    discount_percent: 0,
    line_total: 0,
  };
}

function computeLineTotal(item: LineItem): number {
  const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const discount = gross * ((Number(item.discount_percent) || 0) / 100);
  const taxable = gross - discount;
  const tax = taxable * ((Number(item.tax_rate) || 0) / 100);
  return taxable + tax;
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
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
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

  const [showModal, setShowModal] = useState(false);

  /* ---- Load reference data ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          fetch("/api/suppliers?limit=500", { credentials: "include" }),
          fetch("/api/products?limit=500&status=active", {
            credentials: "include",
          }),
        ]);
        if (cancelled) return;
        if (sRes.ok) {
          const j = await sRes.json();
          setSuppliers(j.data || []);
        }
        if (pRes.ok) {
          const j = await pRes.json();
          setProducts(j.data || []);
        }
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
        `Delete purchase order "${po.po_number}"? This cannot be undone.`
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
            Create and manage purchase orders to your suppliers.
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
          suppliers={suppliers}
          products={products}
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
  suppliers,
  products,
  onClose,
  onSaved,
}: {
  suppliers: SupplierLite[];
  products: ProductLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  /* ---------- header state ---------- */
  const [supplierId, setSupplierId] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");

  /* ---------- line items ---------- */
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [productSearch, setProductSearch] = useState<Record<string, string>>(
    {}
  );
  const [openProductPicker, setOpenProductPicker] = useState<string | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => String(s.id) === supplierId) || null,
    [suppliers, supplierId]
  );

  /* ---------- line helpers ---------- */
  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        next.line_total = computeLineTotal(next);
        return next;
      })
    );
  };

  const addLine = () => setItems((prev) => [...prev, emptyLine()]);

  const removeLine = (key: string) =>
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((it) => it.key !== key)
    );

  const pickProduct = (lineKey: string, product: ProductLite) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== lineKey) return it;
        const next: LineItem = {
          ...it,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          unit_short_name: product.unit_short_name || "",
          unit_price: Number(product.purchase_price) || 0,
          tax_rate: Number(product.tax_rate) || 0,
        };
        next.line_total = computeLineTotal(next);
        return next;
      })
    );
    setProductSearch((prev) => ({ ...prev, [lineKey]: "" }));
    setOpenProductPicker(null);
  };

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => {
      const gross =
        (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
      const discount =
        gross * ((Number(it.discount_percent) || 0) / 100);
      return acc + (gross - discount);
    }, 0);

    const tax = items.reduce((acc, it) => {
      const gross =
        (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
      const discount =
        gross * ((Number(it.discount_percent) || 0) / 100);
      return acc + (gross - discount) * ((Number(it.tax_rate) || 0) / 100);
    }, 0);

    const discountTotal = items.reduce((acc, it) => {
      const gross =
        (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
      return acc + gross * ((Number(it.discount_percent) || 0) / 100);
    }, 0);

    const grand = subtotal + tax;

    return {
      subtotal,
      tax,
      discountTotal,
      grand,
      totalItems: items.length,
      totalQty: items.reduce(
        (acc, it) => acc + (Number(it.quantity) || 0),
        0
      ),
    };
  }, [items]);

  /* ---------- submit ---------- */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!supplierId) {
      setError("Please select a supplier.");
      return;
    }
    if (!orderDate) {
      setError("Order date is required.");
      return;
    }
    const validItems = items.filter(
      (it) => it.product_id && Number(it.quantity) > 0
    );
    if (validItems.length === 0) {
      setError("Please add at least one product with a quantity.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        order_date: orderDate,
        expected_date: expectedDate || null,
        status,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          tax_rate: Number(it.tax_rate) || 0,
          discount_percent: Number(it.discount_percent) || 0,
          line_total: computeLineTotal(it),
        })),
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        discount_amount: totals.discountTotal,
        total_amount: totals.grand,
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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              New Purchase Order
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Create a purchase invoice for a supplier.
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

            {/* ---------------- INVOICE HEADER ---------------- */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  Purchase Invoice
                </h3>
                <span className="font-mono text-xs text-gray-500">
                  PO-{new Date().getFullYear()}-
                  {String(Math.floor(Math.random() * 9000) + 1000)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Supplier selector */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Supplier <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      required
                      className={inputCls}
                    >
                      <option value="">— Select a supplier —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.company_name ? ` — ${s.company_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Supplier auto-filled details */}
                  {selectedSupplier && (
                    <div className="rounded-md border border-[#17D65D]/30 bg-[#17D65D]/5 p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#0fa846]">
                        Supplier details
                      </div>
                      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Name</dt>
                          <dd className="font-medium text-gray-900">
                            {selectedSupplier.name}
                          </dd>
                        </div>
                        {selectedSupplier.company_name && (
                          <div className="sm:col-span-2">
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
                          <div>
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
                          <div className="sm:col-span-2">
                            <dt className="text-gray-500">Address</dt>
                            <dd className="text-gray-800">
                              {selectedSupplier.address}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>

                {/* Order meta */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                        <option value="received">Received</option>
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
                </div>
              </div>
            </div>

            {/* ---------------- LINE ITEMS ---------------- */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  Items
                </h3>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add line
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Product
                        </th>
                        <th className="w-24 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Qty
                        </th>
                        <th className="w-28 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Unit price
                        </th>
                        <th className="w-20 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Disc %
                        </th>
                        <th className="w-20 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Tax %
                        </th>
                        <th className="w-28 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Total
                        </th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((it) => (
                        <tr key={it.key} className="align-top">
                          {/* Product picker */}
                          <td className="px-3 py-2.5">
                            {it.product_id ? (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {it.product_name}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                                  <span className="font-mono">
                                    {it.sku}
                                  </span>
                                  {it.unit_short_name && (
                                    <span>
                                      Per {it.unit_short_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search product by name or SKU..."
                                  value={productSearch[it.key] || ""}
                                  onChange={(e) =>
                                    setProductSearch((prev) => ({
                                      ...prev,
                                      [it.key]: e.target.value,
                                    }))
                                  }
                                  onFocus={() =>
                                    setOpenProductPicker(it.key)
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                                />
                                {openProductPicker === it.key && (
                                  <ProductPicker
                                    query={productSearch[it.key] || ""}
                                    products={products}
                                    onSelect={(p) =>
                                      pickProduct(it.key, p)
                                    }
                                    onClose={() =>
                                      setOpenProductPicker(null)
                                    }
                                  />
                                )}
                              </div>
                            )}
                          </td>

                          {/* Qty */}
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={it.quantity}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                            />
                          </td>

                          {/* Unit price */}
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unit_price}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  unit_price: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                            />
                          </td>

                          {/* Discount */}
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={it.discount_percent}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  discount_percent:
                                    Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                            />
                          </td>

                          {/* Tax */}
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={it.tax_rate}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  tax_rate: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                            />
                          </td>

                          {/* Line total */}
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold text-gray-900">
                            {formatCurrency(computeLineTotal(it))}
                          </td>

                          {/* Remove */}
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(it.key)}
                              disabled={items.length === 1}
                              className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ---------------- TOTALS ---------------- */}
            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Items</span>
                  <span className="font-medium text-gray-800">
                    {totals.totalItems}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total qty</span>
                  <span className="font-medium text-gray-800">
                    {totals.totalQty}
                  </span>
                </div>
                <div className="my-1 border-t border-gray-200" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-800">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="text-gray-800">
                    − {formatCurrency(totals.discountTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="text-gray-800">
                    {formatCurrency(totals.tax)}
                  </span>
                </div>
                <div className="my-1 border-t border-gray-200" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    Grand total
                  </span>
                  <span className="text-base font-bold text-[#0fa846]">
                    {formatCurrency(totals.grand)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
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
              disabled={saving}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create purchase order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   PRODUCT PICKER (inline dropdown)
============================================================ */
function ProductPicker({
  query,
  products,
  onSelect,
  onClose,
}: {
  query: string;
  products: ProductLite[];
  onSelect: (p: ProductLite) => void;
  onClose: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
        );
    return list.slice(0, 30);
  }, [query, products]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-product-picker]")) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      data-product-picker
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-500">
          No products found.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {p.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                    <span className="font-mono">{p.sku}</span>
                    {p.unit_short_name && (
                      <span>Per {p.unit_short_name}</span>
                    )}
                    {p.category_name && <span>{p.category_name}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-gray-600">
                  {formatCurrency(Number(p.purchase_price))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
