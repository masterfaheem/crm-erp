"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import { formatCurrency, formatDate, prettyStatus } from "@/lib/format";

interface CustomerLite { id: number; name: string; }

interface SalesOrderRow {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  order_date: string;
  delivery_date: string | null;
  status: "draft" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  subtotal: number;
  tax_total: number;
  discount_total: number;
  shipping_total: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  item_count: number;
}

interface Pagination { page: number; limit: number; total: number; total_pages: number; }

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  shipped: "border-amber-200 bg-amber-50 text-amber-700",
  delivered: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

export default function SalesOrdersPage() {
  return (<><Navbar /><SalesOrdersMain /></>);
}

function SalesOrdersMain() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const read = () => { try { setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true"); } catch {} };
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><SalesOrdersContent /></div>
    </main>
  );
}

function SalesOrdersContent() {
  const [rows, setRows] = useState<SalesOrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 });
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SalesOrderRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/customers", { credentials: "include" });
        if (res.ok) { const j = await res.json(); setCustomers(j.data || []); }
      } catch {}
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      if (customerFilter) p.set("customer_id", customerFilter);
      p.set("page", String(page)); p.set("limit", "50");
      const res = await fetch(`/api/sales-orders?${p}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Your session has expired. Please sign in again.");
        throw new Error("Unable to load sales orders.");
      }
      const j = await res.json();
      setRows(j.data || []);
      setPagination(j.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setTotalRows(j.total_orders || 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }, [search, statusFilter, customerFilter, page]);

  useEffect(() => { const t = setTimeout(fetchRows, 250); return () => clearTimeout(t); }, [fetchRows]);
  useEffect(() => { setPage(1); }, [search, statusFilter, customerFilter]);

  const handleDelete = async (r: SalesOrderRow) => {
    if (!window.confirm(`Delete sales order "${r.order_number}"?`)) return;
    try {
      const res = await fetch(`/api/sales-orders/${r.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Delete failed"); }
      fetchRows();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Failed to delete"); }
  };

  const hasFilters = !!search || !!statusFilter || !!customerFilter;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Orders</h1>
          <p className="mt-0.5 text-sm text-gray-500">Confirm customer orders and track delivery.</p>
        </div>
        <div className="text-xs text-gray-500">{totalRows.toLocaleString()} total orders</div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input type="text" placeholder="Search by order# or customer..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none sm:max-w-xs focus:border-[#17D65D]" />
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D] sm:max-w-[180px]">
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D]">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setCustomerFilter(""); setPage(1); }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline">Clear</button>
          )}
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]">
          + New order
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Order date</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Delivery date</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-6 animate-pulse rounded bg-gray-100" /></td></tr>
              )) : error ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-600">{error}</p>
                  <button onClick={fetchRows} className="mt-3 text-sm font-medium text-[#0fa846] underline">Try again</button>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {hasFilters ? "No sales orders match your filters." : "No sales orders yet. Create one to get started."}
                  </p>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3.5"><span className="font-mono text-sm font-medium text-gray-900">{r.order_number}</span></td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{r.customer_name}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(r.order_date)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(r.delivery_date)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600 lg:table-cell">{r.item_count}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">{formatCurrency(Number(r.grand_total))}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status] || STATUS_STYLE.draft}`}>
                      {prettyStatus(r.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <button onClick={() => { setEditing(r); setShowModal(true); }} className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]">Edit</button>
                    <span className="mx-2 text-gray-300">·</span>
                    <button onClick={() => handleDelete(r)} className="text-sm font-medium text-gray-700 hover:text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && rows.length > 0 && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
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
        <SalesOrderModal order={editing} customers={customers}
          onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchRows(); }} />
      )}
    </div>
  );
}

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
  return { key: Math.random().toString(36).slice(2), product_id: "", description: "", quantity: "1", unit_price: "0", tax_rate: "0", discount_percent: "0" };
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

function SalesOrderModal({
  order, customers, onClose, onSaved,
}: {
  order: SalesOrderRow | null;
  customers: CustomerLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!order;
  const [customerId, setCustomerId] = useState(order?.customer_id ? String(order.customer_id) : "");
  const [orderDate, setOrderDate] = useState<string>(order?.order_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState<string>(order?.delivery_date?.slice(0, 10) || "");
  const [status, setStatus] = useState<string>(order?.status || "draft");
  const [notes, setNotes] = useState(order?.notes || "");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit || !order) return;
    (async () => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/sales-orders/${order.id}`, { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        if (!j.data) return;
        setTerms(j.data.terms || "");
        const items = (j.data.items || []) as Array<{
          product_id: number | null; description: string; quantity: number;
          unit_price: number; tax_rate: number; discount_percent: number;
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
      } finally { setLoadingDetail(false); }
    })();
  }, [isEdit, order]);

  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l);
    acc.subtotal += c.subtotal; acc.discount += c.discount; acc.tax += c.tax; acc.total += c.total;
    return acc;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });

  const addLine = () => setLines((p) => [...p, newLine()]);
  const removeLine = (key: string) => setLines((p) => (p.length > 1 ? p.filter((l) => l.key !== key) : p));
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError("");
    if (!customerId) { setError("Please choose a customer."); return; }
    if (lines.some((l) => !l.description.trim())) { setError("Every line needs a description."); return; }
    setSaving(true);
    try {
      const payload = {
        customer_id: Number(customerId),
        order_date: orderDate,
        delivery_date: deliveryDate || null,
        status,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product_id ? Number(l.product_id) : null,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          tax_rate: Number(l.tax_rate) || 0,
          discount_percent: Number(l.discount_percent) || 0,
        })),
      };
      const url = isEdit ? `/api/sales-orders/${order!.id}` : "/api/sales-orders";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to save."); }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Edit ${order?.order_number}` : "New sales order"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit ? "Update header and line items." : "Choose a customer and add items."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Customer <span className="text-red-500">*</span></label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls} required>
                  <option value="">Select customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Order date <span className="text-red-500">*</span></label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Delivery date</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Terms & conditions</label>
                <textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Line items</h3>
                <button type="button" onClick={addLine} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Add line</button>
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
                              <input type="text" value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })}
                                placeholder="Item description" className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.unit_price} onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" value={l.tax_rate} onChange={(e) => updateLine(l.key, { tax_rate: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.001" min="0" max="100" value={l.discount_percent} onChange={(e) => updateLine(l.key, { discount_percent: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-[#17D65D]" />
                            </td>
                            <td className="px-2 py-1.5 text-right text-sm font-medium text-gray-900">{formatCurrency(c.total)}</td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeLine(l.key)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-xs rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
                <div className="flex justify-between py-1"><span className="text-gray-600">Subtotal</span><span className="font-medium text-gray-900">{formatCurrency(totals.subtotal)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-600">Discount</span><span className="font-medium text-gray-900">-{formatCurrency(totals.discount)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-600">Tax</span><span className="font-medium text-gray-900">{formatCurrency(totals.tax)}</span></div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold"><span>Grand total</span><span>{formatCurrency(totals.total)}</span></div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
