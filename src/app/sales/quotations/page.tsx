"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import { formatCurrency, formatDate, prettyStatus } from "@/lib/format";

interface CustomerLite { id: number; name: string; }

interface QuotationRow {
  id: number;
  quote_number: string;
  customer_id: number;
  customer_name: string;
  quote_date: string;
  valid_until: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted" | "cancelled";
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
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  rejected: "border-red-200 bg-red-50 text-red-600",
  expired: "border-amber-200 bg-amber-50 text-amber-700",
  converted: "border-indigo-200 bg-indigo-50 text-indigo-700",
  cancelled: "border-red-200 bg-red-50 text-red-600",
};

export default function QuotationsPage() {
  return (<><Navbar /><QuotationsMain /></>);
}

function QuotationsMain() {
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><QuotationsContent /></div>
    </main>
  );
}

function QuotationsContent() {
  const [rows, setRows] = useState<QuotationRow[]>([]);
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
  const [editing, setEditing] = useState<QuotationRow | null>(null);

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
      const res = await fetch(`/api/quotations?${p}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Your session has expired. Please sign in again.");
        throw new Error("Unable to load quotations.");
      }
      const j = await res.json();
      setRows(j.data || []);
      setPagination(j.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setTotalRows(j.total_quotations || 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }, [search, statusFilter, customerFilter, page]);

  useEffect(() => { const t = setTimeout(fetchRows, 250); return () => clearTimeout(t); }, [fetchRows]);
  useEffect(() => { setPage(1); }, [search, statusFilter, customerFilter]);

  const handleDelete = async (r: QuotationRow) => {
    if (!window.confirm(`Delete quotation "${r.quote_number}"?`)) return;
    try {
      const res = await fetch(`/api/quotations/${r.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Delete failed"); }
      fetchRows();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Failed to delete"); }
  };

  const hasFilters = !!search || !!statusFilter || !!customerFilter;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Quotations</h1>
          <p className="mt-0.5 text-sm text-gray-500">Create and track customer quotations.</p>
        </div>
        <div className="text-xs text-gray-500">{totalRows.toLocaleString()} total quotations</div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <input type="text" placeholder="Search by quote# or customer..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20" />
          </div>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D] sm:max-w-[180px]">
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D]">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="converted">Converted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setCustomerFilter(""); setPage(1); }}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline">Clear</button>
          )}
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] active:scale-[0.98]">
          + New quotation
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Quote #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Date</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Valid until</th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-6 animate-pulse rounded bg-gray-100" /></td></tr>
                ))
              ) : error ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-600">{error}</p>
                  <button onClick={fetchRows} className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline">Try again</button>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {hasFilters ? "No quotations match your filters." : "No quotations yet. Create one to get started."}
                  </p>
                </td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3.5"><span className="font-mono text-sm font-medium text-gray-900">{r.quote_number}</span></td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{r.customer_name}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(r.quote_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:table-cell">{formatDate(r.valid_until)}</td>
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
                ))
              )}
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
        <QuotationModal quotation={editing} customers={customers}
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

function QuotationModal({
  quotation, customers, onClose, onSaved,
}: {
  quotation: QuotationRow | null;
  customers: CustomerLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!quotation;
  const [customerId, setCustomerId] = useState(quotation?.customer_id ? String(quotation.customer_id) : "");
  const [quoteDate, setQuoteDate] = useState<string>(quotation?.quote_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState<string>(quotation?.valid_until?.slice(0, 
