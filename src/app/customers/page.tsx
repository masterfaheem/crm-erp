"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface CustomerRow {
  id: number;
  customer_code: string;
  customer_type: string;
  name: string;
  company_name: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  tax_number: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  credit_limit: number;
  credit_days: number;
  opening_balance: number;
  balance_type: string;
  current_balance: number;
  currency_code: string;
  tax_exempt: number;
  default_tax_rate: number;
  status: "active" | "inactive" | "blocked";
  notes: string | null;
  created_at: string;
  branch_name: string | null;
  assigned_name: string | null;
  contact_count: number;
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
  active: "border-[#17D65D]/30 bg-[#17D65D]/10 text-[#0fa846]",
  inactive: "border-gray-200 bg-gray-50 text-gray-600",
  blocked: "border-red-200 bg-red-50 text-red-600",
};

const TYPE_LABEL: Record<string, string> = {
  individual: "Individual",
  business: "Business",
  government: "Government",
  reseller: "Reseller",
};

function formatCurrency(n: number, currency = "PKR"): string {
  if (currency === "PKR") {
    return "Rs " + (n || 0).toLocaleString("en-PK", {
      maximumFractionDigits: 2,
    });
  }
  return (
    currency +
    " " +
    (n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })
  );
}

function initials(name: string): string {
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
export default function CustomersPage() {
  return (
    <>
      <Navbar />
      <CustomersMain />
    </>
  );
}

function CustomersMain() {
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
        <CustomersContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function CustomersContent() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
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
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(
    null
  );

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("customer_type", typeFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/customers?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load customers.");
      }

      const json = await res.json();
      setCustomers(json.data || []);
      setPagination(
        json.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, 250);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter]);

  const handleDelete = async (c: CustomerRow) => {
    if (
      !window.confirm(
        `Delete customer "${c.name}"? All their contacts and group memberships will be removed too.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/customers/${c.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      fetchCustomers();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete customer"
      );
    }
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setShowModal(true);
  };
  const openEdit = (c: CustomerRow) => {
    setEditingCustomer(c);
    setShowModal(true);
  };

  const hasFilters = !!search || !!statusFilter || !!typeFilter;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage every customer account in your business.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {pagination.total.toLocaleString()} total customers
        </div>
      </div>

      {/* ============ TOOLBAR ============ */}
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
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All types</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
            <option value="government">Government</option>
            <option value="reseller">Reseller</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs font-medium text-[#0fa846] underline hover:no-underline"
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={openCreate}
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
          New customer
        </button>
      </div>

      {/* ============ TABLE ============ */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Customer
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                  Contact
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">
                  Location
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 xl:table-cell">
                  Balance
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
                      onClick={fetchCustomers}
                      className="mt-3 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "No customers match your filters."
                        : "No customers yet. Create one to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#17D65D]/10 text-xs font-semibold text-[#0fa846]">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">
                              {c.name}
                            </span>
                            <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                              {TYPE_LABEL[c.customer_type] ||
                                c.customer_type}
                            </span>
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {c.customer_code}
                            {c.company_name ? ` · ${c.company_name}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                      {c.email && (
                        <div className="text-sm text-gray-700">{c.email}</div>
                      )}
                      {c.phone && (
                        <div className="text-xs text-gray-500">{c.phone}</div>
                      )}
                      {!c.email && !c.phone && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 lg:table-cell">
                      {[c.city, c.state, c.country]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell">
                      <div
                        className={`text-sm font-medium ${
                          Number(c.current_balance) > 0
                            ? "text-red-600"
                            : "text-gray-700"
                        }`}
                      >
                        {formatCurrency(
                          Number(c.current_balance),
                          c.currency_code
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        Limit:{" "}
                        {formatCurrency(
                          Number(c.credit_limit),
                          c.currency_code
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLE[c.status] || STATUS_STYLE.inactive
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <Link
                        href={`/customers/${c.id}`}
                        className="text-sm font-medium text-gray-700 hover:text-gray-900"
                      >
                        View
                      </Link>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => openEdit(c)}
                        className="text-sm font-medium text-[#0fa846] hover:text-[#0c8a3a]"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">·</span>
                      <button
                        onClick={() => handleDelete(c)}
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

        {/* ---- Pagination ---- */}
        {!loading &&
          !error &&
          customers.length > 0 &&
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

      {/* ============ MODAL ============ */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchCustomers();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   CUSTOMER MODAL
============================================================ */
function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!customer;

  const [tab, setTab] = useState<"basic" | "financial">("basic");

  /* ---- Basic ---- */
  const [customerType, setCustomerType] = useState(
    customer?.customer_type || "individual"
  );
  const [name, setName] = useState(customer?.name || "");
  const [companyName, setCompanyName] = useState(customer?.company_name || "");
  const [designation, setDesignation] = useState(customer?.designation || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp || "");
  const [taxNumber, setTaxNumber] = useState(customer?.tax_number || "");

  /* ---- Addresses ---- */
  const [billingAddress, setBillingAddress] = useState(
    customer?.billing_address || ""
  );
  const [shippingAddress, setShippingAddress] = useState(
    customer?.shipping_address || ""
  );
  const [city, setCity] = useState(customer?.city || "");
  const [state, setState] = useState(customer?.state || "");
  const [country, setCountry] = useState(customer?.country || "Pakistan");
  const [postalCode, setPostalCode] = useState(customer?.postal_code || "");

  /* ---- Financial ---- */
  const [creditLimit, setCreditLimit] = useState(
    customer?.credit_limit != null ? String(customer.credit_limit) : "0"
  );
  const [creditDays, setCreditDays] = useState(
    customer?.credit_days != null ? String(customer.credit_days) : "0"
  );
  const [openingBalance, setOpeningBalance] = useState(
    customer?.opening_balance != null ? String(customer.opening_balance) : "0"
  );
  const [balanceType, setBalanceType] = useState(
    customer?.balance_type || "debit"
  );
  const [currencyCode, setCurrencyCode] = useState(
    customer?.currency_code || "PKR"
  );
  const [taxExempt, setTaxExempt] = useState(customer?.tax_exempt === 1);
  const [defaultTaxRate, setDefaultTaxRate] = useState(
    customer?.default_tax_rate != null
      ? String(customer.default_tax_rate)
      : "0"
  );

  const [status, setStatus] = useState<string>(customer?.status || "active");
  const [notes, setNotes] = useState(customer?.notes || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Customer name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_type: customerType,
        name: name.trim(),
        company_name: companyName.trim() || null,
        designation: designation.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        tax_number: taxNumber.trim() || null,
        billing_address: billingAddress.trim() || null,
        shipping_address: shippingAddress.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || "Pakistan",
        postal_code: postalCode.trim() || null,
        credit_limit: Number(creditLimit) || 0,
        credit_days: Number(creditDays) || 0,
        opening_balance: Number(openingBalance) || 0,
        balance_type: balanceType,
        currency_code: currencyCode,
        tax_exempt: taxExempt,
        default_tax_rate: Number(defaultTaxRate) || 0,
        status,
        notes: notes.trim() || null,
      };

      const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error || "Failed to save customer."
        );
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Edit customer` : "Create customer"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit
                ? `Update details for ${customer?.name}`
                : "Add a new customer to your workspace."}
            </p>
          </div>
          <button
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setTab("basic")}
            className={`px-6 py-2.5 text-sm font-medium transition ${
              tab === "basic"
                ? "border-b-2 border-[#17D65D] text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Basic
          </button>
          <button
            type="button"
            onClick={() => setTab("financial")}
            className={`px-6 py-2.5 text-sm font-medium transition ${
              tab === "financial"
                ? "border-b-2 border-[#17D65D] text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Financial
          </button>
        </div>

        {/* Body */}
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

            {tab === "basic" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Customer type
                  </label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="individual">Individual</option>
                    <option value="business">Business</option>
                    <option value="government">Government</option>
                    <option value="reseller">Reseller</option>
                  </select>
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
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Bilal Ahmed"
                    className={inputCls}
                  />
                </div>

                {customerType === "business" ||
                customerType === "government" ||
                customerType === "reseller" ? (
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">
                      Company name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Techno Traders (Pvt) Ltd."
                      className={inputCls}
                    />
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. CEO"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Tax number (NTN)
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+92 300 0000000"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Billing address
                  </label>
                  <textarea
                    rows={2}
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="Street, area, etc."
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Shipping address
                  </label>
                  <textarea
                    rows={2}
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Leave blank to use billing address"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lahore"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    State / Province
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Punjab"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Pakistan"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Postal code
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="54000"
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional internal notes"
                    className={inputCls}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Credit limit
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Credit days
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Opening balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className={inputCls}
                  />
                  {isEdit && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Editing this won't change the current balance.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Balance type
                  </label>
                  <select
                    value={balanceType}
                    onChange={(e) => setBalanceType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="debit">Debit (customer owes us)</option>
                    <option value="credit">Credit (we owe customer)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Currency
                  </label>
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="PKR">PKR — Pakistani Rupee</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="AED">AED — UAE Dirham</option>
                    <option value="SAR">SAR — Saudi Riyal</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Default tax rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={defaultTaxRate}
                    onChange={(e) => setDefaultTaxRate(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={taxExempt}
                      onChange={(e) => setTaxExempt(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                    />
                    <div>
                      <span className="block text-sm font-medium text-gray-800">
                        Tax exempt
                      </span>
                      <span className="block text-xs text-gray-500">
                        Invoices for this customer won't apply tax.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}
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
              {saving
                ? "Saving..."
                : isEdit
                ? "Save changes"
                : "Create customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}