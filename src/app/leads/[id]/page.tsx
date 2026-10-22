"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { leadSourceLabel } from "@/lib/leadOptions";
import {
  PRIORITY_OPTIONS,
  PRIORITY_STYLES,
  STATUS_OPTIONS,
  STATUS_STYLES,
  formatCurrency,
} from "../leadUi";

interface LeadDetail {
  id: number;
  lead_number: string;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  whatsapp: string | null;
  source: string | null;
  city: string | null;
  assigned_to: number | null;
  assigned_name: string | null;
  status: string;
  priority: string;
  estimated_value: number;
  expected_close_date: string | null;
  address: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function fmtDate(v: string | null, withTime = false): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/* 03001234567 / +92 300 1234567 -> 923001234567 for wa.me */
function waNumber(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

export default function LeadViewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { credentials: "include" });
      if (res.status === 404) throw new Error("Lead not found");
      if (res.status === 401) throw new Error("Session expired. Please log in again.");
      if (!res.ok) throw new Error(`Failed to load lead (${res.status})`);
      const j = await res.json();
      setLead(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) load();
  }, [id, load]);

  /* quick update (status / priority) */
  const quickUpdate = async (field: "status" | "priority", value: string) => {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setLead(j.data);
    } catch {
      window.alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    const name = `${lead.first_name} ${lead.last_name || ""}`.trim();
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      router.push("/leads");
    } catch {
      window.alert("Failed to delete lead");
      setDeleting(false);
    }
  };

  const fullName = lead ? `${lead.first_name} ${lead.last_name || ""}`.trim() : "";
  const st = lead ? STATUS_STYLES[lead.status] || STATUS_STYLES.new : null;
  const pr = lead ? PRIORITY_STYLES[lead.priority] || PRIORITY_STYLES.medium : null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-5">
            <Link href="/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900">
              ← Back to Leads
            </Link>

            {loading ? (
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ) : error || !lead ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <p className="text-sm text-red-600">{error || "Lead not found"}</p>
                <Link href="/leads" className="mt-3 inline-block rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black">
                  Back to Leads
                </Link>
              </div>
            ) : (
              <>
                {/* HEADER */}
                <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#17D65D]/15 text-xl font-bold text-gray-900">
                      {lead.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500">{lead.lead_number}</p>
                      <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
                      <p className="text-sm text-gray-500">
                        {[lead.designation, lead.company_name].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/leads/${lead.id}/edit`}
                      className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]"
                    >
                      Edit Lead
                    </Link>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  {/* LEFT: details */}
                  <div className="space-y-5 lg:col-span-2">
                    <Card title="Contact">
                      <Info label="Phone">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="text-[#0f9d48] hover:underline">{lead.phone}</a>
                        ) : "-"}
                      </Info>
                      <Info label="WhatsApp">
                        {lead.whatsapp ? (
                          <a href={`https://wa.me/${waNumber(lead.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="text-[#0f9d48] hover:underline">
                            {lead.whatsapp}
                          </a>
                        ) : "-"}
                      </Info>
                      <Info label="Alternate Phone">{lead.alternate_phone || "-"}</Info>
                      <Info label="Email">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="text-[#0f9d48] hover:underline">{lead.email}</a>
                        ) : "-"}
                      </Info>
                      <Info label="City">{lead.city || "-"}</Info>
                      <Info label="Address">{lead.address || "-"}</Info>
                    </Card>

                    <Card title="Lead Details">
                      <Info label="Source">{leadSourceLabel(lead.source) || "-"}</Info>
                      <Info label="Assigned To">{lead.assigned_name || "Unassigned"}</Info>
                      <Info label="Estimated Value">{formatCurrency(Number(lead.estimated_value))}</Info>
                      <Info label="Expected Close">{fmtDate(lead.expected_close_date)}</Info>
                      <Info label="Created">{fmtDate(lead.created_at, true)}</Info>
                      <Info label="Last Updated">{fmtDate(lead.updated_at, true)}</Info>
                    </Card>

                    <Card title="Notes">
                      <p className="col-span-full whitespace-pre-wrap text-sm text-gray-800">
                        {lead.description || <span className="text-gray-400">No notes</span>}
                      </p>
                    </Card>
                  </div>

                  {/* RIGHT: quick actions */}
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick Update</h2>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {st && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.bg} ${st.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        )}
                        {pr && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pr.bg} ${pr.text}`}>
                            {pr.label}
                          </span>
                        )}
                      </div>
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Status</label>
                      <select
                        value={lead.status}
                        disabled={saving}
                        onChange={(e) => quickUpdate("status", e.target.value)}
                        className="mb-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                      >
                        {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Priority</label>
                      <select
                        value={lead.priority}
                        disabled={saving}
                        onChange={(e) => quickUpdate("priority", e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                      >
                        {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {saving && <p className="mt-2 text-xs text-gray-500">Saving...</p>}
                    </div>

                    {(lead.whatsapp || lead.phone) && (
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-semibold text-gray-900">Contact Now</h2>
                        <div className="flex flex-col gap-2">
                          {(lead.whatsapp || lead.phone) && (
                            <a
                              href={`https://wa.me/${waNumber(lead.whatsapp || lead.phone || "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-[#25D366] px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90"
                            >
                              WhatsApp
                            </a>
                          )}
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Call {lead.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-0.5 break-words text-sm text-gray-900">{children}</div>
    </div>
  );
}
