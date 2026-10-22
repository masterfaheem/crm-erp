"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import {
  EMPTY_LEAD_FORM,
  LeadFormFields,
  formToPayload,
  leadToForm,
  validateLeadForm,
  type LeadFormState,
} from "../../LeadForm";

interface UserOption {
  id: number;
  name: string;
}

export default function EditLeadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [form, setForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
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
        setForm(leadToForm(l));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validateLeadForm(form);
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formToPayload(form)),
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
                  <LeadFormFields key={leadNumber} form={form} setForm={setForm} users={users} />
                  {error && (
                    <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                  )}
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
