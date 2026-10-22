"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import {
  BUDGET_LABELS,
  LOST_REASONS,
  formatUseCases,
  leadSourceLabel,
  lostReasonText,
  professionText,
} from "@/lib/leadOptions";
import {
  PRIORITY_OPTIONS,
  PRIORITY_STYLES,
  STATUS_OPTIONS,
  STATUS_STYLES,
  fmtFollowUp,
  formatCurrency,
  inputCls,
  isOverdue,
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
  profession: string | null;
  profession_other: string | null;
  budget_range: string | null;
  use_cases: string | null;
  use_case_custom: string | null;
  requirement_note: string | null;
  follow_up_local: string | null;
  follow_up_note: string | null;
  follow_up_done: number;
  lost_reason: string | null;
  lost_reason_other: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_phone2: string | null;
  delivery_house: string | null;
  delivery_street: string | null;
  delivery_area: string | null;
  delivery_landmark: string | null;
  delivery_city: string | null;
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

function preset(days: number, hour = 11): string {
  const d = new Date(Date.now() + days * 86400000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
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

  // status change that needs extra input (follow_up / lost)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [fuTime, setFuTime] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostOther, setLostOther] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);

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

  const save = async (body: Record<string, unknown>) => {
    if (!lead) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Update failed");
      setLead(j.data);
      return true;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Update failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onStatusChange = (value: string) => {
    if (!lead) return;
    if (value === "follow_up") {
      setPendingStatus(value);
      setFuTime(lead.follow_up_local || preset(1));
      setFuNote(lead.follow_up_note || "");
    } else if (value === "lost") {
      setPendingStatus(value);
      setLostReason(lead.lost_reason || "");
      setLostOther(lead.lost_reason_other || "");
    } else {
      setPendingStatus(null);
      save({ status: value });
    }
  };

  const confirmPending = async () => {
    if (pendingStatus === "follow_up") {
      if (!fuTime) return window.alert("Please set the follow-up date & time");
      if (await save({ status: "follow_up", follow_up_at: fuTime, follow_up_note: fuNote || null }))
        setPendingStatus(null);
    } else if (pendingStatus === "lost") {
      if (!lostReason) return window.alert("Please select a lost reason");
      if (lostReason === "other" && !lostOther.trim()) return window.alert("Please write the reason");
      if (
        await save({
          status: "lost",
          lost_reason: lostReason,
          lost_reason_other: lostReason === "other" ? lostOther : null,
        })
      )
        setPendingStatus(null);
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
  const mainNumber = lead ? lead.whatsapp || lead.phone : null;
  const hasDelivery =
    lead &&
    [lead.delivery_name, lead.delivery_phone, lead.delivery_phone2, lead.delivery_house, lead.delivery_street, lead.delivery_area, lead.delivery_landmark, lead.delivery_city].some(Boolean);
  const hasOld =
    lead &&
    [lead.email, lead.company_name, lead.designation, lead.alternate_phone, lead.address, lead.expected_close_date].some(Boolean) ||
    (lead && Number(lead.estimated_value) > 0);

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
                        {[professionText(lead.profession, lead.profession_other), lead.city].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/leads/${lead.id}/edit`} className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]">
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
                  {/* LEFT */}
                  <div className="space-y-5 lg:col-span-2">
                    <Card title="Lead Info">
                      <Info label="WhatsApp">
                        {lead.whatsapp ? (
                          <a href={`https://wa.me/${waNumber(lead.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="text-[#0f9d48] hover:underline">
                            {lead.whatsapp}
                          </a>
                        ) : "-"}
                      </Info>
                      {lead.phone && lead.phone !== lead.whatsapp && (
                        <Info label="Phone">
                          <a href={`tel:${lead.phone}`} className="text-[#0f9d48] hover:underline">{lead.phone}</a>
                        </Info>
                      )}
                      <Info label="City">{lead.city || "-"}</Info>
                      <Info label="Source">{leadSourceLabel(lead.source) || "-"}</Info>
                      <Info label="Profession">{professionText(lead.profession, lead.profession_other) || "-"}</Info>
                      <Info label="Budget Range">{lead.budget_range ? BUDGET_LABELS[lead.budget_range] || lead.budget_range : "-"}</Info>
                      <Info label="Workload / Use Case" wide>
                        {formatUseCases(lead.use_cases, lead.use_case_custom) || "-"}
                      </Info>
                      <Info label="Requirement Note" wide>{lead.requirement_note || "-"}</Info>
                    </Card>

                    <Card title="Description Note">
                      <p className="col-span-full whitespace-pre-wrap text-sm text-gray-800">
                        {lead.description || <span className="text-gray-400">No notes</span>}
                      </p>
                    </Card>

                    <Card title="🚚 Address for Delivery">
                      {hasDelivery ? (
                        <>
                          <Info label="Name">{lead.delivery_name || "-"}</Info>
                          <Info label="Phone No">{lead.delivery_phone || "-"}</Info>
                          <Info label="2nd Phone No">{lead.delivery_phone2 || "-"}</Info>
                          <Info label="House No">{lead.delivery_house || "-"}</Info>
                          <Info label="Street / Road">{lead.delivery_street || "-"}</Info>
                          <Info label="Sector / Block / Area">{lead.delivery_area || "-"}</Info>
                          <Info label="Nearest Landmark">{lead.delivery_landmark || "-"}</Info>
                          <Info label="City">{lead.delivery_city || "-"}</Info>
                        </>
                      ) : (
                        <p className="col-span-full text-sm text-gray-400">
                          No delivery address yet —{" "}
                          <Link href={`/leads/${lead.id}/edit`} className="font-semibold text-[#0f9d48] hover:underline">add it</Link>
                        </p>
                      )}
                    </Card>

                    {hasOld && (
                      <Card title="Other Details">
                        {lead.company_name && <Info label="Company">{lead.company_name}</Info>}
                        {lead.designation && <Info label="Designation">{lead.designation}</Info>}
                        {lead.email && <Info label="Email">{lead.email}</Info>}
                        {lead.alternate_phone && <Info label="Alternate Phone">{lead.alternate_phone}</Info>}
                        {Number(lead.estimated_value) > 0 && <Info label="Estimated Value">{formatCurrency(Number(lead.estimated_value))}</Info>}
                        {lead.expected_close_date && <Info label="Expected Close">{fmtDate(lead.expected_close_date)}</Info>}
                        {lead.address && <Info label="Address" wide>{lead.address}</Info>}
                      </Card>
                    )}
                  </div>

                  {/* RIGHT */}
                  <div className="space-y-5">
                    {/* Status */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick Update</h2>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {st && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.bg} ${st.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        )}
                        {pr && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pr.bg} ${pr.text}`}>{pr.label}</span>}
                      </div>
                      {lead.status === "lost" && lead.lost_reason && (
                        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                          Lost reason: <b>{lostReasonText(lead.lost_reason, lead.lost_reason_other)}</b>
                        </p>
                      )}
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Status</label>
                      <select
                        value={pendingStatus || lead.status}
                        disabled={saving}
                        onChange={(e) => onStatusChange(e.target.value)}
                        className={`${inputCls} mb-3`}
                      >
                        {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>

                      {pendingStatus === "follow_up" && (
                        <div className="mb-3 space-y-2 rounded-xl bg-blue-50 p-3">
                          <p className="text-xs font-bold text-blue-900">📅 When to follow up?</p>
                          <input type="datetime-local" value={fuTime} onChange={(e) => setFuTime(e.target.value)} className={inputCls} />
                          <input value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
                          <PendingButtons saving={saving} onSave={confirmPending} onCancel={() => setPendingStatus(null)} />
                        </div>
                      )}
                      {pendingStatus === "lost" && (
                        <div className="mb-3 space-y-2 rounded-xl bg-red-50 p-3">
                          <p className="text-xs font-bold text-red-900">Why was it lost?</p>
                          <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={inputCls}>
                            <option value="">Select reason</option>
                            {LOST_REASONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          {lostReason === "other" && (
                            <input value={lostOther} onChange={(e) => setLostOther(e.target.value)} placeholder="Write the reason" className={inputCls} />
                          )}
                          <PendingButtons saving={saving} onSave={confirmPending} onCancel={() => setPendingStatus(null)} />
                        </div>
                      )}

                      <label className="mb-1 block text-xs font-semibold text-gray-700">Priority</label>
                      <select value={lead.priority} disabled={saving} onChange={(e) => save({ priority: e.target.value })} className={inputCls}>
                        {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {saving && <p className="mt-2 text-xs text-gray-500">Saving...</p>}
                    </div>

                    {/* Follow up */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="mb-3 text-sm font-semibold text-gray-900">📅 Follow Up</h2>
                      {lead.follow_up_local ? (
                        <>
                          <p className={`text-sm font-bold ${lead.follow_up_done ? "text-green-700" : isOverdue(lead.follow_up_local) ? "text-red-600" : "text-indigo-700"}`}>
                            {fmtFollowUp(lead.follow_up_local)}
                            {!!lead.follow_up_done && " · done"}
                            {!lead.follow_up_done && isOverdue(lead.follow_up_local) && " · overdue"}
                          </p>
                          {lead.follow_up_note && <p className="mt-1 text-sm text-gray-700">“{lead.follow_up_note}”</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!lead.follow_up_done ? (
                              <button disabled={saving} onClick={() => save({ follow_up_done: 1 })} className="rounded-lg bg-[#17D65D] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#15c455] disabled:opacity-50">
                                ✓ Mark Done
                              </button>
                            ) : (
                              <button disabled={saving} onClick={() => save({ follow_up_done: 0 })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                Undo
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setShowReschedule((v) => !v);
                                setFuTime(preset(1));
                                setFuNote(lead.follow_up_note || "");
                              }}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Reschedule
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setShowReschedule((v) => !v);
                            setFuTime(preset(1));
                            setFuNote("");
                          }}
                          className="w-full rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          + Set Follow Up (date & time)
                        </button>
                      )}
                      {showReschedule && (
                        <div className="mt-3 space-y-2 rounded-xl bg-blue-50 p-3">
                          <input type="datetime-local" value={fuTime} onChange={(e) => setFuTime(e.target.value)} className={inputCls} />
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              ["Tomorrow", preset(1)],
                              ["In 3 days", preset(3)],
                              ["Next week", preset(7)],
                            ].map(([l, v]) => (
                              <button key={l} type="button" onClick={() => setFuTime(v)} className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                                {l}
                              </button>
                            ))}
                          </div>
                          <input value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
                          <PendingButtons
                            saving={saving}
                            onSave={async () => {
                              if (!fuTime) return;
                              if (await save({ follow_up_at: fuTime, follow_up_note: fuNote || null })) setShowReschedule(false);
                            }}
                            onCancel={() => setShowReschedule(false)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Contact */}
                    {mainNumber && (
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-semibold text-gray-900">Contact Now</h2>
                        <div className="flex flex-col gap-2">
                          <a href={`https://wa.me/${waNumber(mainNumber)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90">
                            WhatsApp
                          </a>
                          <a href={`tel:${mainNumber}`} className="rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            Call {mainNumber}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Assign + meta */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="mb-3 text-sm font-semibold text-gray-900">👤 Assign</h2>
                      <Info label="Assigned To">{lead.assigned_name || "Unassigned"}</Info>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Info label="Created">{fmtDate(lead.created_at, true)}</Info>
                        <Info label="Updated">{fmtDate(lead.updated_at, true)}</Info>
                      </div>
                    </div>
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

function PendingButtons({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button disabled={saving} onClick={onSave} className="rounded-lg bg-[#17D65D] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#15c455] disabled:opacity-50">
        {saving ? "Saving..." : "Save"}
      </button>
      <button onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
        Cancel
      </button>
    </div>
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

function Info({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-0.5 break-words text-sm text-gray-900">{children}</div>
    </div>
  );
}
