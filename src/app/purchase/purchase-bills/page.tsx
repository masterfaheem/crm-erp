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

interface PurchaseBillRow {
  id: number;
  bill_number: string;
  supplier_invoice: string | null;
  supplier_id: number;
  supplier_name: string;
  purchase_order_id: number | null;
  po_number: string | null;
  bill_date: string;
  due_date: string | null;
  status: "draft" | "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled";
  subtotal: number;
  tax_total: number;
  discount_total: number;
  shipping_total: number;
  grand_total: number;
  paid_amount: number;
  balance: number;
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
  unpaid: "border-amber-200 bg-amber-50 text-amber-700",
  partially_paid: "border-indigo-200 bg-indigo-50 text-indigo-700",
  paid: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  overdue: "border-red-200 bg-red-50 text-red-600",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

function formatCurrency(n: number): string {
  return "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

function prettyStatus(s: string): string {
  return s.replace(/_/g, " ");
}

/* ============================================================
   PAGE
============================================================ */
export default function PurchaseBillsPage() {
  return (
    <>
      <Navbar />
      <PurchaseBillsMain />
    </>
  );
}

function PurchaseBillsMain() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () => {
      try { setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true"); }
      catch { /* ignore */ }
    };
    read();
    const onCustom = () => read();
    const onStorage = (e: StorageEvent) => { if (e.key === "erp_sidebar_collapsed") read(); };
    window.addEventListener("erp:sidebar-collapse", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("erp:sidebar-collapse", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <main className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <PurchaseBillsContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function PurchaseBillsContent() {
  const [bills, setBills] = useState<PurchaseBillRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 });
  const [totalBills, setTotalBills] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PurchaseBillRow | null>(null);

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

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (supplierFilter) params.set("supplier_id", supplierFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/purchase-bills?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Your session has expired. Please sign in again.");
        throw new Error("Unable to load purchase bills.");
      }
      const json = await res.json();
      setBills(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setTotalBills(json.total_bills || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, supplierFilter, page]);

  useEffect(() => {
    const t = setTimeout(fetchBills, 250);
    return () => clearTimeout(t);
  }, [fetchBills]);

  useEffect(() => { setPage(1); }, [search, statusFilter, supplierFilter]);

  const handleDelete = async (b: PurchaseBillRow) => {
    if (!window.confirm(`Delete bill "${b.bill_number}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/purchase-bills/${b.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchBills();
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
          <h1 className="text-xl font-semibold text-gray-900">Purchase Bills</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Record supplier bills and track payments.
          </p>
        </div>
        <div className="text-xs text-gray-500">{totalBills.toLocaleString()} total bills</div>
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
              placeholder="Search by bill# or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:max-w-[180px]">
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); setSupplierFilter(""); setPage(1); }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >Clear</button>
          )}
        </div>

        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New bill
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Bill #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Supplier</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Bill date</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Due date</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Paid</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-6 animate-pulse rounded bg-gray-100" /></td></tr>
                ))
              ) : error ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-600">{error}</p>
                  <button onClick={fetchBills} className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline">Try again</button>
                </td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {hasFilters ? "No purchase bills match your filters." : "No purchase bills yet. Create one to get started."}
                  </p>
                </td></tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="font-mono text-sm font-medium text-gray-900">{b.bill_number}</span>
                      {b.supplier_invoice && (
                        <div className="text-[11px] text-gray-400">Ref: {b.supplier_invoice}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">
                      {b.supplier_name}
                      {b.po_number && <div className="text-[11px] text-gray-400">PO: {b.po_number}</div>}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(b.bill_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(b.due_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">{formatCurrency(Number(b.grand_total))}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600 lg:table-cell">{formatCurrency(Number(b.paid_amount))}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm lg:table-cell">
                      <span className={Number(b.balance) > 0 ? "font-medium text-red-600" : "text-gray-500"}>
                        {formatCurrency(Number(b.balance))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[b.status] || STATUS_STYLE.draft}`}>
                        {prettyStatus(b.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button onClick={() => { setEditing(b); setShowModal(true); }} className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]">Edit</button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button onClick={() => handleDelete(b)} className="text-sm font-medium text-gray-700 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && !error && bills.length > 0 && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <span className="px-3 text-xs font-medium text-gray-700">{pagination.page} / {pagination.total_pages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={pagination.page === pagination.total_pages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <PurchaseBillModal
          bill={editing}
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchBills(); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   BILL MODAL
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
  return { subtotal: sub, discount, tax: taxAmt, total };
}

function PurchaseBillModal({
  bill,
  suppliers,
  onClose,
  onSaved,
}: {
  bill: PurchaseBillRow | null;
  suppliers: SupplierLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!bill;

  const [supplierId, setSupplierId] = useState<string>(bill?.supplier_id ? String(bill.supplier_id) : "");
  const [supplierInvoice, setSupplierInvoice] = useState(bill?.supplier_invoice || "");
  const [billDate, setBillDate] = useState<string>(bill?.bill_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(bill?.due_date?.slice(0, 10) || "");
  const [status, setStatus] = useState<string>(bill?.status || "unpaid");
  const [notes, setNotes] = useState(bill?.notes || "");
  const [paidAmount, setPaidAmount] = useState(String(bill?.paid_amount ?? 0));

  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit || !bill) return;
    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/purchase-bills/${bill.id}`, { credentials: "include" });
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
  }, [isEdit, bill]);

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
    if (!billDate) { setError("Bill date is required."); return; }
    if (lines.some((l) => !l.description.trim())) { setError("Every line needs a description."); return; }

    setSaving(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        supplier_invoice: supplierInvoice.trim() || null,
        bill_date: billDate,
        due_date: dueDate || null,
        status,
        notes: notes.trim() || null,
        paid_amount: Number(paidAmount) || 0,
        items: lines.map((l) => ({
          product_id: l.product_id ? Number(l.product_id) : null,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          tax_rate: Number(l.tax_rate) || 0,
          discount_percent: Number(l.discount_percent) || 0,
        })),
      };

      const url = isEdit ? `/api/purchase-bills/${bill!.id}` : "/api/purchase-bills";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Failed to save purchase bill.");
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
              {isEdit ? `Edit ${bill?.bill_number}` : "New purchase bill"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit ? "Update header and line items." : "Record a supplier bill."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {/* HEADER FIELDS */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Supplier <span className="text-red-500">*</span></label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls} required>
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Supplier invoice #</label>
                <input type="text" value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} placeholder="Optional" className={`${inputCls} font-mono`} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Bill date <span className="text-red-500">*</span></label>
                <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Due date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  <option value="draft">Draft</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially paid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Paid amount</label>
                <input type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className={inputCls} />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
            </div>

            {/* LINE ITEMS */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Line items</h3>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add line
                </button>
              </div>

              {loadingDetail ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">Loading items…</div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500">Description</th>
                        <th className="w-20 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Qty</th>
                        <th className="w-24 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Price</th>
                        <th className="w-20 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Tax %</th>
                        <th className="w-20 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Disc %</th>
                        <th className="w-28 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Total</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => {
                        const c = calcLine(l);
                        return (
                          <tr key={l.key}>
                            <td className="px-2 py-1.5">
                              <input type="text" value={l.description}
                                onChange={(e) => updateLine(l.key, { description: e.target.value })}
                                placeholder="Item description"
                                className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.quantity}
                                onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.unit_price}
                                onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.tax_rate}
                                onChange={(e) => updateLine(l.key, { tax_rate: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" max="100" value={l.discount_percent}
                                onChange={(e) => updateLine(l.key, { discount_percent: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(c.total)}
                            </td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeLine(l.key)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remove line">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* TOTALS */}
            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-xs rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
                <div className="flex justify-between py-1"><span className="text-gray-600">Subtotal</span><span className="font-medium text-gray-900">{formatCurrency(totals.subtotal)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-600">Discount</span><span className="font-medium text-gray-900">-{formatCurrency(totals.discount)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-600">Tax</span><span className="font-medium text-gray-900">{formatCurrency(totals.tax)}</span></div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold"><span>Grand total</span><span>{formatCurrency(totals.total)}</span></div>
                <div className="mt-1 flex justify-between text-xs"><span className="text-gray-500">Balance</span><span className={totals.total - (Number(paidAmount) || 0) > 0 ? "font-medium text-red-600" : "text-gray-500"}>{formatCurrency(totals.total - (Number(paidAmount) || 0))}</span></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
