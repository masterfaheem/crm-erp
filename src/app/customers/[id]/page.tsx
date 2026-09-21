"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface CustomerDetail {
  id: number;
  customer_code: string;
  customer_type: string;
  name: string;
  company_name: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  whatsapp: string | null;
  website: string | null;
  tax_number: string | null;
  registration_number: string | null;
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
  status: string;
  notes: string | null;
  created_at: string;
  branch_name: string | null;
  assigned_name: string | null;
  contacts: ContactItem[];
  groups: GroupItem[];
}

interface ContactItem {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: number;
  status: string;
}

interface GroupItem {
  id: number;
  name: string;
  color: string;
  discount_percent: number;
}

/* ============================================================
   HELPERS
============================================================ */
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
export default function CustomerDetailPage() {
  return (
    <>
      <Navbar />
      <CustomerDetailMain />
    </>
  );
}

function CustomerDetailMain() {
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
        <CustomerDetailContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function CustomerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (res.status === 404) {
          throw new Error("Customer not found.");
        }
        throw new Error("Unable to load customer.");
      }

      const json = await res.json();
      setCustomer(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const handleDelete = async () => {
    if (!customer) return;
    if (
      !window.confirm(
        `Delete customer "${customer.name}"? This action cannot be undone.`
      )
    )
      return;

    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Delete failed");
      }
      router.push("/customers");
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete customer"
      );
    }
  };

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-48 animate-pulse rounded-lg bg-gray-100 md:col-span-2" />
          <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error || !customer) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <h2 className="text-base font-semibold text-red-900">
          {error || "Customer not found"}
        </h2>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link
            href="/customers"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Back to customers
          </Link>
          <button
            onClick={fetchCustomer}
            className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#15c455]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const balanceNum = Number(customer.current_balance);
  const limitNum = Number(customer.credit_limit);
  const usagePct =
    limitNum > 0 ? Math.min(100, (balanceNum / limitNum) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ============ BREADCRUMB ============ */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href="/customers"
          className="transition hover:text-gray-700"
        >
          Customers
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900">{customer.name}</span>
      </div>

      {/* ============ HEADER CARD ============ */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#17D65D]/10 text-lg font-semibold text-[#0fa846]">
              {initials(customer.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">
                  {customer.name}
                </h1>
                <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {TYPE_LABEL[customer.customer_type] ||
                    customer.customer_type}
                </span>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_STYLE[customer.status] || STATUS_STYLE.inactive
                  }`}
                >
                  {customer.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {customer.customer_code}
                {customer.company_name ? ` · ${customer.company_name}` : ""}
              </p>
              {customer.tax_number && (
                <p className="mt-0.5 text-xs text-gray-400">
                  NTN: {customer.tax_number}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/customers/${customer.id}/edit`}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* ============ KPI STRIP ============ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Current Balance"
          value={formatCurrency(balanceNum, customer.currency_code)}
          valueClass={
            balanceNum > 0 ? "text-red-600" : "text-gray-900"
          }
          hint={
            customer.balance_type === "credit"
              ? "We owe customer"
              : "Customer owes us"
          }
        />
        <KpiCard
          label="Credit Limit"
          value={formatCurrency(limitNum, customer.currency_code)}
          hint={
            limitNum > 0
              ? `${usagePct.toFixed(0)}% used`
              : "No limit set"
          }
        />
        <KpiCard
          label="Credit Days"
          value={`${customer.credit_days} days`}
          hint={
            customer.credit_days > 0
              ? "Payment terms"
              : "Due on receipt"
          }
        />
        <KpiCard
          label="Contacts"
          value={String(customer.contacts?.length || 0)}
          hint={`${customer.groups?.length || 0} group${
            (customer.groups?.length || 0) === 1 ? "" : "s"
          }`}
        />
      </div>

      {/* ============ MAIN GRID ============ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contact Information */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Contact Information
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <InfoRow label="Email" value={customer.email} />
              <InfoRow label="Phone" value={customer.phone} />
              <InfoRow
                label="Alternate phone"
                value={customer.alternate_phone}
              />
              <InfoRow label="WhatsApp" value={customer.whatsapp} />
              <InfoRow label="Website" value={customer.website} />
              <InfoRow
                label="Registration no."
                value={customer.registration_number}
              />
            </div>
          </div>

          {/* Addresses */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Addresses
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Billing
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                  {customer.billing_address || "—"}
                  {customer.city && (
                    <span className="block">
                      {customer.city}
                      {customer.state ? `, ${customer.state}` : ""}
                    </span>
                  )}
                  {customer.country && (
                    <span className="block">
                      {customer.country}
                      {customer.postal_code
                        ? ` — ${customer.postal_code}`
                        : ""}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Shipping
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                  {customer.shipping_address ||
                    customer.billing_address ||
                    "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Contacts table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Contacts
              </h2>
              <Link
                href="/contacts"
                className="text-xs font-medium text-[#0fa846] hover:underline"
              >
                Manage contacts
              </Link>
            </div>
            {customer.contacts?.length ? (
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Name
                    </th>
                    <th className="hidden px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell">
                      Contact
                    </th>
                    <th className="hidden px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customer.contacts.map((ct) => (
                    <tr key={ct.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {ct.name}
                          </span>
                          {ct.is_primary === 1 && (
                            <span className="inline-flex items-center rounded-md border border-[#17D65D]/30 bg-[#17D65D]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0fa846]">
                              Primary
                            </span>
                          )}
                        </div>
                        {(ct.designation || ct.department) && (
                          <div className="text-xs text-gray-500">
                            {[ct.designation, ct.department]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-5 py-3 sm:table-cell">
                        {ct.email && (
                          <div className="text-sm text-gray-700">
                            {ct.email}
                          </div>
                        )}
                        {ct.phone && (
                          <div className="text-xs text-gray-500">
                            {ct.phone}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-5 py-3 md:table-cell">
                        <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
                          {ct.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-500">
                  No contacts yet for this customer.
                </p>
                <Link
                  href="/contacts"
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#15c455]"
                >
                  Add a contact
                </Link>
              </div>
            )}
          </div>

          {/* Notes */}
          {customer.notes && (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
              </div>
              <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-gray-700">
                {customer.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Financial Summary */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Financial
              </h2>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Opening balance
                </p>
                <p className="mt-0.5 text-sm text-gray-800">
                  {formatCurrency(
                    Number(customer.opening_balance),
                    customer.currency_code
                  )}{" "}
                  <span className="text-xs text-gray-400">
                    ({customer.balance_type})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Current balance
                </p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    balanceNum > 0 ? "text-red-600" : "text-gray-800"
                  }`}
                >
                  {formatCurrency(balanceNum, customer.currency_code)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Credit limit
                </p>
                <p className="mt-0.5 text-sm text-gray-800">
                  {formatCurrency(limitNum, customer.currency_code)}
                </p>
                {limitNum > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full transition-all ${
                        usagePct >= 80
                          ? "bg-red-500"
                          : usagePct >= 50
                          ? "bg-amber-500"
                          : "bg-[#17D65D]"
                      }`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Tax settings
                </p>
                <p className="mt-1 text-sm text-gray-800">
                  {customer.tax_exempt
                    ? "Tax exempt"
                    : `Default tax: ${Number(
                        customer.default_tax_rate
                      ).toFixed(2)}%`}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Currency
                </p>
                <p className="mt-0.5 text-sm text-gray-800">
                  {customer.currency_code}
                </p>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Details</h2>
            </div>
            <div className="space-y-3 p-5">
              <InfoRow label="Branch" value={customer.branch_name} />
              <InfoRow
                label="Assigned to"
                value={customer.assigned_name}
              />
              <InfoRow
                label="Created"
                value={formatDate(customer.created_at)}
              />
            </div>
          </div>

          {/* Groups */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Groups</h2>
              <Link
                href="/customers/groups"
                className="text-xs font-medium text-[#0fa846] hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="p-5">
              {customer.groups?.length ? (
                <ul className="space-y-2">
                  {customer.groups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-2.5 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <span
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: g.color || "#17D65D" }}
                      />
                      <span className="flex-1 text-sm text-gray-800">
                        {g.name}
                      </span>
                      {Number(g.discount_percent) > 0 && (
                        <span className="text-xs font-medium text-[#0fa846]">
                          {Number(g.discount_percent).toFixed(2)}% off
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">
                  Not in any group yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SMALL COMPONENTS
============================================================ */
function KpiCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${
          valueClass || "text-gray-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm text-gray-800">
        {value || "—"}
      </p>
    </div>
  );
}