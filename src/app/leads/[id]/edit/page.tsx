"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { LEAD_SOURCES, LEAD_SOURCE_GROUPS } from "@/lib/leadOptions";
import {
  CitySelect,
  Field,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  inputCls,
} from "../../leadUi";

interface UserOption {
  id: number;
  name: string;
}

const EMPTY = {
  first_name: "",
  last_name: "",
  company_name: "",
  designation: "",
  phone: "",
  alternate_phone: "",
  whatsapp: "",
  email: "",
  source: "",
  city: "",
  assigned_to: "",
  status: "new",
  priority: "medium",
  estimated_value: "",
  expected_close_date: "",
  address: "",
  description: "",
};
type Form = typeof EMPTY;

function toDateInput(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function EditLeadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [form, setForm] = useState<Form>(EMPTY);
  const [leadNumber, setLeadNumber] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [lRes, uRes] = await Promise.all([
          fetch(`/api/leads/${id}`, { credentials: "include" }),
          fetch("/api/users", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (uRes.ok) {
          const j = await uRes.json();
          setUsers(j.data || []);
        }
        if (lRes.status === 404) throw new Error("Lead not found");
        if (!lRes.ok) throw new Error(`Failed to load lead (${lRes.status})`);
        const l = (await lRes.json()).data;
        setLeadNumber(l.lead_number);
        setForm({
          first_name: l.first_name || "",
          last_name: l.last_name || "",
          company_name: l.company_name || "",
          designation: l.designation || "",
          phone: l.phone || "",
          alternate_phone: l.alternate_phone || "",
          whatsapp: l.whatsapp || "",
          email: l.email || "",
          source: l.source || "",
          city: l.city || "",
          assigned_to: l.assigned_to ? String(l.assigned_to) : "",
          status: l.status || "new",
          priority: l.priority || "medium",
          estimated_value:
            l.estimated_value !== null && Number(l.estimated_value) !== 0
              ? String(Number(l.estimated_value))
              : "",
          expected_close_date: toDateInput(l.expected_close_date),
          address: l.address || "",
          description: l.description || "",
        });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.first_name.trim()) {
      setError("First name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          source: form.source || null,
          city: form.city || null,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
          estimated_value: form.estimated_value ? Number(form.estimated_value) : 0,
          expected_close_date: form.expected_close_date || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Failed to save (${res.status})`);
      }
      router.push(`/leads/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-5">
            <Link href={`/leads/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900">
              ← Back to Lead
            </Link>

            {loading ? (
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <p className="text-sm text-red-600">{loadError}</p>
                <Link href="/leads" className="mt-3 inline-block rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black">
                  Back to Leads
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500">{leadNumber}</p>
                  <h1 className="text-xl font-bold text-gray-900">Edit Lead</h1>
                </div>

                <div className="p-5">
                  {error && (
                    <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="First Name" required>
                      <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required className={inputCls} />
                    </Field>
                    <Field label="Last Name">
                      <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Company">
                      <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Designation">
                      <input value={form.designation} onChange={(e) => set("designation", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Phone">
                      <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="WhatsApp">
                      <input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Alternate Phone">
                      <input value={form.alternate_phone} onChange={(e) => set("alternate_phone", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Email">
                      <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Source">
                      <select value={form.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>
                        <option value="">Select source</option>
                        {LEAD_SOURCE_GROUPS.map((g) => (
                          <optgroup key={g} label={g}>
                            {LEAD_SOURCES.filter((s) => s.group === g).map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                    <Field label="City">
                      <CitySelect value={form.city} onChange={(v) => set("city", v)} />
                    </Field>
                    <Field label="Assigned To">
                      <select value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} className={inputCls}>
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                        {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Priority">
                      <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                        {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Estimated Value (Rs)">
                      <input type="number" min="0" value={form.estimated_value} onChange={(e) => set("estimated_value", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Expected Close Date">
                      <input type="date" value={form.expected_close_date} onChange={(e) => set("expected_close_date", e.target.value)} className={inputCls} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address">
                        <textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Description / Notes">
                        <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                  <Link href={`/leads/${id}`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455] disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
