"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import { formatCurrency, formatDate, prettyStatus } from "@/lib/format";

interface CustomerLite { id: number; name: string; }

interface PaymentRow {
  id: number;
  payment_number: string;
  customer_id: number;
  customer_name: string;
  invoice_id: number | null;
  invoice_number: string | null;
  payment_date: string;
  amount: number;
  method: "cash" | "bank_transfer" | "cheque" | "card" | "online" | "other";
  reference: string | null;
  bank_name: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  status: "pending" | "cleared" | "bounced" | "cancelled";
  notes: string | null;
  created_at: string;
}

interface Pagination { page: number; limit: number; total: number; total_pages: number; }

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const STATUS_STYLE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  cleared: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  bounced: "border-red-200 bg-red-50 text-red-600",
  cancelled: "border-gray-200 bg-gray-50 text-gray-600",
};

export default function CustomerPaymentsPage() {
  return (<><Navbar /><PaymentsMain /></>);
}

function PaymentsMain() {
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><PaymentsContent /></div>
    </main>
  );
}

function PaymentsContent() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 });
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);

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
      if (methodFilter) p.set("method", methodFilter);
      if (customerFilter) p.set("customer_id", customerFilter);
      p.set("page", String(page)); p.set("limit", "50");
      const res = await fetch(`/api/customer-payments?${p}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Your session has expired. Please sign in again.");
        throw new Error("Unable to load payments.");
      }
      const j = await res.json();
      setRows(j.data || []);
      setPagination(j.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setTotalRows(j.total_payments || 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }, [search, statusFilter, methodFilter, customerFilter, page]);

  useEffect(() => { const t = setTimeout(fetchRows, 250); return () => clearTimeout(t); }, [fetchRows]);
  useEffect(() => { setPage(1); }, [search, statusFilter, methodFilter, customerFilter]);

  const handleDelete = async (r: PaymentRow) => {
    if (!window.confirm(`Delete payment "${r.payment_number}"?`)) return;
    try {
      const res = await fetch(`/api/customer-payments/${r.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Delete failed"); }
      fetchRows();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Failed to delete"); }
  };

  const hasFilters = !!search || !!statusFilter || !!methodFilter || !!customerFilter;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customer Payments</h1>
          <p className="mt-0.5 text-sm text-gray-500">Record and track customer payments.</p>
        </div>
        <div className="text-xs text-gray-500">{totalRows.toLocaleString()} total payments</div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input type="text" placeholder="Search by payment# / reference..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none sm:max-w-xs focus:border-[#17D65D]" />
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D] sm:max-w-[180px]">
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D]">
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D]">
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
            <option value="bounced">Bounced</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setMethodFilter(""); setCustomerFilter(""); setPage(1); }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline">Clear</button>
          )}
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]">
          + Record payment
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Payment #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Invoice</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Amount</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Method</th>
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
                    {hasFilters ? "No payments match your filters." : "No payments yet. Record one to get started."}
                  </p>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3.5"><span className="font-mono text-sm font-medium text-gray-900">{r.payment_number}</span></td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{r.customer_name}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{r.invoice_number || "—"}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(r.payment_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900">{formatCurrency(Number(r.amount))}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 lg:table-cell capitalize">{prettyStatus(r.method)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status] || STATUS_STYLE.pending}`}>
                      {r.status}
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
        <PaymentModal payment={editing} customers={customers}
          onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchRows(); }} />
      )}
    </div>
  );
}

function PaymentModal({
  payment, customers, onClose, onSaved,
}: {
  payment: PaymentRow | null;
  customers: CustomerLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!payment;
  const [customerId, setCustomerId] = useState(payment?.customer_id ? String(payment.customer_id) : "");
  const [paymentDate, setPaymentDate] = useState<string>(payment?.payment_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(payment?.amount ?? 0));
  const [method, setMethod] = useState(payment?.method || "cash");
  const [reference, setReference] = useState(payment?.reference || "");
  const [bankName, setBankName] = useState(payment?.bank_name || "");
  const [chequeNumber, setChequeNumber] = useState(payment?.cheque_number || "");
  const [chequeDate, setChequeDate] = useState(payment?.cheque_date?.slice(0, 10) || "");
  const [status, setStatus] = useState(payment?.status || "cleared");
  const [notes, setNotes] = useState(payment?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError("");
    if (!customerId) { setError("Please choose a customer."); return; }
    if (!amount || Number(amount) <= 0) { setError("Amount must be greater than zero."); return; }
    setSaving(true);
    try {
      const payload = {
        customer_id: Number(customerId),
        payment_date: paymentDate,
        amount: Number(amount) || 0,
        method,
        reference: reference.trim() || null,
        bank_name: bankName.trim() || null,
        cheque_number: chequeNumber.trim() || null,
        cheque_date: chequeDate || null,
        status,
        notes: notes.trim() || null,
      };
      const url = isEdit ? `/api/customer-payments/${payment!.id}` : "/api/customer-payments";
      const methodHttp = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method: methodHttp, headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to save."); }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Edit ${payment?.payment_number}` : "Record payment"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit ? "Update payment details." : "Record a customer payment."}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Customer <span className="text-red-500">*</span></label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls} required>
                  <option value="">Select customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Payment date <span className="text-red-500">*</span></label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Amount <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={inputCls}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="bounced">Bounced</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Reference</label>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>

              {(method === "cheque" || method === "bank_transfer") && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">Bank name</label>
                    <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
                  </div>
                  {method === "cheque" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-700">Cheque #</label>
                        <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-700">Cheque date</label>
                        <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputCls} />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Notes</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3.5">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
