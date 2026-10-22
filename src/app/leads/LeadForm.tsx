"use client";

import { useState } from "react";
import {
  BUDGET_RANGES,
  LEAD_SOURCES,
  LEAD_SOURCE_GROUPS,
  LOST_REASONS,
  PROFESSIONS,
  USE_CASES,
} from "@/lib/leadOptions";
import {
  CitySelect,
  Field,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  inputCls,
} from "./leadUi";

/* ============================================================
   SHARED LEAD FORM (Create modal + Edit page)
============================================================ */
export const EMPTY_LEAD_FORM = {
  name: "",
  whatsapp: "",
  city: "",
  source: "",
  profession: "",
  profession_other: "",
  budget_range: "",
  use_cases: [] as string[],
  use_case_custom: "",
  requirement_note: "",
  status: "new",
  priority: "medium",
  follow_up_at: "",
  follow_up_note: "",
  lost_reason: "",
  lost_reason_other: "",
  description: "",
  delivery_name: "",
  delivery_phone: "",
  delivery_phone2: "",
  delivery_house: "",
  delivery_street: "",
  delivery_area: "",
  delivery_landmark: "",
  delivery_city: "",
  assigned_to: "",
};
export type LeadFormState = typeof EMPTY_LEAD_FORM;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function leadToForm(l: any): LeadFormState {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    name: [l.first_name, l.last_name].filter(Boolean).join(" "),
    whatsapp: s(l.whatsapp) || s(l.phone),
    city: s(l.city),
    source: s(l.source),
    profession: s(l.profession),
    profession_other: s(l.profession_other),
    budget_range: s(l.budget_range),
    use_cases: s(l.use_cases).split(",").filter(Boolean),
    use_case_custom: s(l.use_case_custom),
    requirement_note: s(l.requirement_note),
    status: s(l.status) || "new",
    priority: s(l.priority) || "medium",
    follow_up_at: s(l.follow_up_local),
    follow_up_note: s(l.follow_up_note),
    lost_reason: s(l.lost_reason),
    lost_reason_other: s(l.lost_reason_other),
    description: s(l.description),
    delivery_name: s(l.delivery_name),
    delivery_phone: s(l.delivery_phone),
    delivery_phone2: s(l.delivery_phone2),
    delivery_house: s(l.delivery_house),
    delivery_street: s(l.delivery_street),
    delivery_area: s(l.delivery_area),
    delivery_landmark: s(l.delivery_landmark),
    delivery_city: s(l.delivery_city),
    assigned_to: l.assigned_to ? String(l.assigned_to) : "",
  };
}

export function validateLeadForm(f: LeadFormState): string | null {
  if (!f.name.trim()) return "Name is required";
  if (f.status === "follow_up" && !f.follow_up_at)
    return "Please set the follow-up date & time";
  if (f.status === "lost" && !f.lost_reason) return "Please select a lost reason";
  if (f.status === "lost" && f.lost_reason === "other" && !f.lost_reason_other.trim())
    return "Please write the lost reason";
  if (f.profession === "other" && !f.profession_other.trim())
    return "Please write the profession";
  if (f.use_cases.includes("custom") && !f.use_case_custom.trim())
    return "Please write the custom use case";
  return null;
}

export function formToPayload(f: LeadFormState) {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: f.name.trim(),
    whatsapp: n(f.whatsapp),
    city: n(f.city),
    source: n(f.source),
    profession: n(f.profession),
    profession_other: f.profession === "other" ? n(f.profession_other) : null,
    budget_range: n(f.budget_range),
    use_cases: f.use_cases,
    use_case_custom: f.use_cases.includes("custom") ? n(f.use_case_custom) : null,
    requirement_note: n(f.requirement_note),
    status: f.status,
    priority: f.priority,
    follow_up_at: f.follow_up_at || null,
    follow_up_note: f.follow_up_at ? n(f.follow_up_note) : null,
    lost_reason: f.status === "lost" ? n(f.lost_reason) : null,
    lost_reason_other:
      f.status === "lost" && f.lost_reason === "other" ? n(f.lost_reason_other) : null,
    description: n(f.description),
    delivery_name: n(f.delivery_name),
    delivery_phone: n(f.delivery_phone),
    delivery_phone2: n(f.delivery_phone2),
    delivery_house: n(f.delivery_house),
    delivery_street: n(f.delivery_street),
    delivery_area: n(f.delivery_area),
    delivery_landmark: n(f.delivery_landmark),
    delivery_city: n(f.delivery_city),
    assigned_to: f.assigned_to ? Number(f.assigned_to) : null,
  };
}

/* "2026-10-25T14:30" for <input type=datetime-local>, N days ahead at 11:00 */
function presetDate(days: number, hour = 11): string {
  const d = new Date(Date.now() + days * 86400000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-4 sm:col-span-2">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      {right}
    </div>
  );
}

export function LeadFormFields({
  form,
  setForm,
  users,
}: {
  form: LeadFormState;
  setForm: React.Dispatch<React.SetStateAction<LeadFormState>>;
  users: { id: number; name: string }[];
}) {
  const [showFollowUp, setShowFollowUp] = useState(!!form.follow_up_at);
  const set = <K extends keyof LeadFormState>(k: K, v: LeadFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleUseCase = (v: string) =>
    setForm((f) => ({
      ...f,
      use_cases: f.use_cases.includes(v)
        ? f.use_cases.filter((x) => x !== v)
        : [...f.use_cases, v],
    }));

  const followUpVisible = form.status === "follow_up" || showFollowUp || !!form.follow_up_at;

  const copyFromLead = () =>
    setForm((f) => ({
      ...f,
      delivery_name: f.delivery_name || f.name,
      delivery_phone: f.delivery_phone || f.whatsapp,
      delivery_city: f.delivery_city || f.city,
    }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* -------- BASIC -------- */}
      <Field label="Name" required>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} required className={inputCls} placeholder="Customer name" />
      </Field>
      <Field label="WhatsApp">
        <input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={inputCls} placeholder="03XX XXXXXXX" inputMode="tel" />
      </Field>
      <Field label="City">
        <CitySelect value={form.city} onChange={(v) => set("city", v)} />
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

      <Field label="Profession">
        <select value={form.profession} onChange={(e) => set("profession", e.target.value)} className={inputCls}>
          <option value="">Select profession</option>
          {PROFESSIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {form.profession === "other" && (
          <input value={form.profession_other} onChange={(e) => set("profession_other", e.target.value)} placeholder="Write profession" className={`${inputCls} mt-2`} />
        )}
      </Field>
      <Field label="Budget Range (Rs)">
        <select value={form.budget_range} onChange={(e) => set("budget_range", e.target.value)} className={inputCls}>
          <option value="">Select budget</option>
          {BUDGET_RANGES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      {/* use cases: div (not label) so chip clicks work */}
      <div className="sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold text-gray-700">
          Workload / Use Case <span className="font-normal text-gray-400">(select all that apply)</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {USE_CASES.map((o) => {
            const on = form.use_cases.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleUseCase(o.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  on
                    ? "border-[#17D65D] bg-[#17D65D]/15 text-gray-900"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {on ? "✓ " : ""}
                {o.label}
              </button>
            );
          })}
        </div>
        {form.use_cases.includes("custom") && (
          <input value={form.use_case_custom} onChange={(e) => set("use_case_custom", e.target.value)} placeholder="Write custom use case" className={`${inputCls} mt-2`} />
        )}
      </div>

      <div className="sm:col-span-2">
        <Field label="Requirement Note">
          <input value={form.requirement_note} onChange={(e) => set("requirement_note", e.target.value)} placeholder="e.g. 16GB RAM, touch screen, i7 11th gen" maxLength={500} className={inputCls} />
        </Field>
      </div>

      {/* -------- STATUS -------- */}
      <Field label="Status">
        <select
          value={form.status}
          onChange={(e) => {
            set("status", e.target.value);
            if (e.target.value === "follow_up") setShowFollowUp(true);
          }}
          className={inputCls}
        >
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

      {/* Follow up */}
      {followUpVisible ? (
        <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900">
              📅 Follow Up {form.status === "follow_up" && <span className="text-red-500">*</span>}
            </span>
            {form.status !== "follow_up" && (
              <button
                type="button"
                onClick={() => {
                  setShowFollowUp(false);
                  setForm((f) => ({ ...f, follow_up_at: "", follow_up_note: "" }));
                }}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <input type="datetime-local" value={form.follow_up_at} onChange={(e) => set("follow_up_at", e.target.value)} className={inputCls} />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  ["Today 5pm", presetDate(0, 17)],
                  ["Tomorrow", presetDate(1)],
                  ["In 3 days", presetDate(3)],
                  ["Next week", presetDate(7)],
                ].map(([label, v]) => (
                  <button key={label} type="button" onClick={() => set("follow_up_at", v)} className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-50">
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input value={form.follow_up_note} onChange={(e) => set("follow_up_note", e.target.value)} placeholder="What to follow up? (optional)" maxLength={255} className={inputCls} />
          </div>
        </div>
      ) : (
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setShowFollowUp(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
          >
            📅 + Set Follow Up (date & time)
          </button>
        </div>
      )}

      {/* Lost reason */}
      {form.status === "lost" && (
        <div className="sm:col-span-2 rounded-xl border border-red-100 bg-red-50/50 p-3">
          <span className="mb-2 block text-xs font-bold text-red-900">
            Lost Reason <span className="text-red-500">*</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {LOST_REASONS.map((o) => {
              const on = form.lost_reason === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set("lost_reason", o.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "border-red-400 bg-red-100 text-red-900" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {form.lost_reason === "other" && (
            <input value={form.lost_reason_other} onChange={(e) => set("lost_reason_other", e.target.value)} placeholder="Write the reason" className={`${inputCls} mt-2`} />
          )}
        </div>
      )}

      <div className="sm:col-span-2">
        <Field label="Description Note">
          <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls} placeholder="Any other details / conversation summary" />
        </Field>
      </div>

      {/* -------- DELIVERY ADDRESS -------- */}
      <Section
        title="🚚 Address for Delivery"
        right={
          <button type="button" onClick={copyFromLead} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            Same as lead
          </button>
        }
      />
      <Field label="Name">
        <input value={form.delivery_name} onChange={(e) => set("delivery_name", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Phone No">
        <input value={form.delivery_phone} onChange={(e) => set("delivery_phone", e.target.value)} className={inputCls} inputMode="tel" />
      </Field>
      <Field label="2nd Phone No">
        <input value={form.delivery_phone2} onChange={(e) => set("delivery_phone2", e.target.value)} className={inputCls} inputMode="tel" />
      </Field>
      <Field label="House No">
        <input value={form.delivery_house} onChange={(e) => set("delivery_house", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Street No / Road Name">
        <input value={form.delivery_street} onChange={(e) => set("delivery_street", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Sector / Block / Area">
        <input value={form.delivery_area} onChange={(e) => set("delivery_area", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Nearest Landmark">
        <input value={form.delivery_landmark} onChange={(e) => set("delivery_landmark", e.target.value)} className={inputCls} />
      </Field>
      <Field label="City">
        <CitySelect value={form.delivery_city} onChange={(v) => set("delivery_city", v)} />
      </Field>

      {/* -------- ASSIGN -------- */}
      <Section title="👤 Assign" />
      <Field label="Assigned To">
        <select value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} className={inputCls}>
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
