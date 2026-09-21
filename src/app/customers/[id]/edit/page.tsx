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
  currency_code: string;
  tax_exempt: number;
  default_tax_rate: number;
  status: string;
  notes: string | null;
  assigned_to: number | null;
}

interface UserOption {
  id: number;
  name: string;
}

/* ============================================================
   HELPERS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const labelCls = "mb-1.5 block text-xs font-medium text-gray-700";
const sectionTitleCls =
  "text-xs font-semibold uppercase tracking-wider text-gray-500";

/* ============================================================
   PAGE
============================================================ */
export default function EditCustomerPage() {
  return (
    <>
      <Navbar />
      <EditCustomerMain />
    </>
  );
}

function EditCustomerMain() {
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
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <EditCustomerContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function EditCustomerContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<UserOption[]>([]);

  /* ---- Form state ---- */
  const [customerCode, setCustomerCode] = useState("");
  const [customerType, setCustomerType] = useState("individual");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Pakistan");
  const [postalCode, setPostalCode] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditDays, setCreditDays] = useState("0");
  const [currencyCode, setCurrencyCode] = useState("PKR");
  const [taxExempt, setTaxExempt] = useState(false);
  const [defaultTaxRate, setDefaultTaxRate] = useState("0");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");

  /* ---- Load customer ---- */
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Unable to load customer.");
      }
      const c: CustomerDetail = await res.json();
      setCustomerCode(c.customer_code || "");
      setCustomerType(c.customer_type || "individual");
      setName(c.name || "");
      setCompanyName(c.company_name || "");
      setDesignation(c.designation || "");
      setEmail(c.email || "");
      setPhone(c.phone || "");
      setWhatsapp(c.whatsapp || "");
      setWebsite(c.website || "");
      setTaxNumber(c.tax_number || "");
      setRegistrationNumber(c.registration_number || "");
      setBillingAddress(c.billing_address || "");
      setShippingAddress(c.shipping_address || "");
      setCity(c.city || "");
      setState(c.state || "");
      setCountry(c.country || "Pakistan");
      setPostalCode(c.postal_code || "");
      setCreditLimit(c.credit_limit != null ? String(c.credit_limit) : "0");
      setCreditDays(c.credit_days != null ? String(c.credit_days) : "0");
      setCurrencyCode(c.currency_code || "PKR");
      setTaxExempt(c.tax_exempt === 1);
      setDefaultTaxRate(
        c.default_tax_rate != null ? String(c.default_tax_rate) : "0"
      );
      setAssignedTo(c.assigned_to ? String(c.assigned_to) : "");
      setStatus(c.status || "active");
      setNotes(c.notes || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- Load users ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setUsers(json.data || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
        website: website.trim() || null,
        tax_number: taxNumber.trim() || null,
        registration_number: registrationNumber.trim() || null,
        billing_address: billingAddress.trim() || null,
        shipping_address: shippingAddress.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || "Pakistan",
        postal_code: postalCode.trim() || null,
        credit_limit: Number(creditLimit) || 0,
        credit_days: Number(creditDays) || 0,
        currency_code: currencyCode,
        tax_exempt: taxExempt,
        default_tax_rate: Number(defaultTaxRate) || 0,
        assigned_to: assignedTo ? Number(assignedTo) : null,
        status,
        notes: notes.trim() || null,
      };
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
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
      router.push(`/customers/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-96 animate-pulse rounded-lg bg-gray-100 lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  /* ---- Not found ---- */
  if (notFound) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <h2 className="text-base font-semibold text-red-900">
          Customer not found
        </h2>
        <Link
          href="/customers"
          className="mt-4 inline-block rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============ BREADCRUMB + HEADER ============ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/customers" className="transition hover:text-gray-700">
              Customers
            </Link>
            <span className="text-gray-300">/</span>
            <Link
              href={`/customers/${id}`}
              className="truncate transition hover:text-gray-700"
            >
              {name || customerCode || "Customer"}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900">Edit</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            Edit customer
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Update the customer information below, then save your changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${id}`}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="edit-customer-form"
            disabled={saving}
            className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* ============ FORM ============ */}
      <form
        id="edit-customer-form"
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        {/* ---- Left column (main form) ---- */}
        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Identity */}
          <Section title="Basic information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Customer code</label>
                <input
                  type="text"
                  value={customerCode}
                  disabled
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-500"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Auto-generated, cannot be changed.
                </p>
              </div>
              <div>
                <label className={labelCls}>Customer type</label>
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

              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Display name <span className="text-red-500">*</span>
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

              {customerType !== "individual" && (
                <div className="sm:col-span-2">
                  <label className={labelCls}>Company name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Techno Traders (Pvt) Ltd."
                    className={inputCls}
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className={labelCls}>Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. CEO"
                  className={inputCls}
                />
              </div>
            </div>
          </Section>

          {/* Contact */}
          <Section title="Contact details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 0000000"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>WhatsApp</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Tax number (NTN)</label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Registration no.</label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </div>
            </div>
          </Section>

          {/* Addresses */}
          <Section title="Addresses">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Billing address</label>
                <textarea
                  rows={2}
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  placeholder="Street, area, etc."
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Shipping address</label>
                <textarea
                  rows={2}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Leave blank to use billing address"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>State / Province</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Postal code</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </Section>
        </div>

        {/* ---- Right column (side panel) ---- */}
        <div className="space-y-4">
          {/* Status */}
          <Section title="Status & assignment">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Status</label>
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
              <div>
                <label className={labelCls}>Assigned to</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          {/* Financial */}
          <Section title="Financial settings">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Credit limit</label>
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
                <label className={labelCls}>Credit days</label>
                <input
                  type="number"
                  min="0"
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className={inputCls}
                >
                  <option value="PKR">PKR</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="SAR">SAR</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Default tax rate (%)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={defaultTaxRate}
                  onChange={(e) => setDefaultTaxRate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={taxExempt}
                  onChange={(e) => setTaxExempt(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-[#17D65D] focus:ring-[#17D65D]"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-800">
                    Tax exempt
                  </span>
                  <span className="block text-xs text-gray-500">
                    Skip tax on this customer&apos;s invoices.
                  </span>
                </div>
              </label>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Internal notes">
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — visible only to your team."
              className={inputCls}
            />
          </Section>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   SECTION WRAPPER
============================================================ */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className={sectionTitleCls}>{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}