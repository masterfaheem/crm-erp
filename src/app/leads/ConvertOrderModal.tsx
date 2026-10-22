"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CitySelect, Field, inputCls } from "./leadUi";

/* ============================================================
   CONVERT WON LEAD -> CUSTOMER + SALES ORDER (to Operations)
============================================================ */
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "card", label: "Card (POS machine)" },
];

export interface ConvertLead {
  id: number;
  lead_number: string;
  first_name: string;
  last_name: string | null;
  whatsapp: string | null;
  phone: string | null;
  city: string | null;
  requirement_note: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_phone2: string | null;
  delivery_house: string | null;
  delivery_street: string | null;
  delivery_area: string | null;
  delivery_landmark: string | null;
  delivery_city: string | null;
}

interface ProductHit {
  id: number;
  name: string;
  sku: string;
  sale_price: number;
}

interface Item {
  key: string;
  mode: "product" | "custom";
  product_id: number | null;
  product_label: string;
  description: string;
  quantity: string;
  unit_price: string;
}

const newItem = (): Item => ({
  key: Math.random().toString(36).slice(2),
  mode: "product",
  product_id: null,
  product_label: "",
  description: "",
  quantity: "1",
  unit_price: "",
});

const rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

export default function ConvertOrderModal({
  lead,
  onClose,
  onDone,
}: {
  lead: ConvertLead;
  onClose: () => void;
  onDone: (r: { order_number: string; customer_code: string; customer_created: boolean }) => void;
}) {
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const [d, setD] = useState({
    delivery_name: lead.delivery_name || leadName,
    delivery_phone: lead.delivery_phone || lead.whatsapp || lead.phone || "",
    delivery_phone2: lead.delivery_phone2 || "",
    delivery_house: lead.delivery_house || "",
    delivery_street: lead.delivery_street || "",
    delivery_area: lead.delivery_area || "",
    delivery_landmark: lead.delivery_landmark || "",
    delivery_city: lead.delivery_city || lead.city || "",
  });
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [specs, setSpecs] = useState(lead.requirement_note || "");
  // prepaid business: payment defaults to the full order total until edited
  const [advance, setAdvance] = useState<string | null>(null);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() =>
    new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10)
  );
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [preview, setPreview] = useState<{
    existing_customer: { customer_code: string; name: string } | null;
    existing_order: { order_number: string } | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/leads/${lead.id}/convert`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPreview(j.data))
      .catch(() => {});
  }, [lead.id]);

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [items]
  );
  const adv = advance === null ? total : Number(advance) || 0;
  const cod = Math.max(0, total - adv);

  const setItem = (key: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const submit = async () => {
    setError(null);
    const miss: string[] = [];
    if (!d.delivery_name.trim()) miss.push("Name");
    if (!d.delivery_phone.trim()) miss.push("Phone");
    if (!d.delivery_house.trim() && !d.delivery_street.trim() && !d.delivery_area.trim())
      miss.push("House / Street / Area");
    if (!d.delivery_city) miss.push("City");
    if (miss.length) return setError(`Delivery address incomplete: ${miss.join(", ")}`);
    const clean = items.filter((it) => Number(it.quantity) > 0);
    if (!clean.length) return setError("Add at least one model / product");
    for (const it of clean) {
      if (it.mode === "product" && !it.product_id) return setError("Select a product from inventory (or switch to Custom)");
      if (it.mode === "custom" && !it.description.trim()) return setError("Write the model name for the custom item");
      if (!(Number(it.unit_price) > 0)) return setError("Enter the price for every item");
    }
    if (adv > total) return setError("Payment cannot be more than the total");
    if (adv > 0 && !method) return setError("Select how the payment was received");
    if (
      cod > 0 &&
      !window.confirm(
        `Only ${rs(adv)} received of ${rs(total)}.\n${rs(cod)} will stay on the customer's khata as credit (balance due). Continue?`
      )
    )
      return;

    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...d,
          items: clean.map((it) => ({
            product_id: it.mode === "product" ? it.product_id : null,
            description: it.mode === "custom" ? it.description.trim() : it.product_label,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
          })),
          specs_note: specs.trim() || null,
          advance_amount: adv,
          advance_method: adv > 0 ? method : "none",
          advance_reference: reference.trim() || null,
          dispatch_date: dispatchDate || null,
          dispatch_notes: dispatchNotes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      onDone(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  const setF = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">✅ Convert to Order</h2>
            <p className="text-xs text-gray-500">
              {lead.lead_number} · {leadName} → Customer + Sales Order → Operations
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">✕</button>
        </div>

        <div className="space-y-5 p-5">
          {/* customer preview */}
          {preview?.existing_order ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This lead is already converted — order <b>{preview.existing_order.order_number}</b>.
            </div>
          ) : preview?.existing_customer ? (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
              🔗 Existing customer found: <b>{preview.existing_customer.customer_code} — {preview.existing_customer.name}</b>.
              The order will be added to this customer (no duplicate).
            </div>
          ) : preview ? (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
              ✨ A new customer will be created for <b>{leadName}</b>.
            </div>
          ) : null}

          {/* items */}
          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">💻 Model / Product</h3>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.key} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
                      {(["product", "custom"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setItem(it.key, { mode: m })}
                          className={`rounded-md px-3 py-1 ${it.mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                        >
                          {m === "product" ? "From inventory" : "Custom model"}
                        </button>
                      ))}
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((a) => a.filter((x) => x.key !== it.key))} className="text-xs font-semibold text-red-600">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                    <div className="sm:col-span-4">
                      {it.mode === "product" ? (
                        <ProductPicker
                          label={it.product_label}
                          onPick={(p) =>
                            setItem(it.key, {
                              product_id: p.id,
                              product_label: p.name,
                              unit_price: it.unit_price || String(Number(p.sale_price) || ""),
                            })
                          }
                        />
                      ) : (
                        <input
                          value={it.description}
                          onChange={(e) => setItem(it.key, { description: e.target.value })}
                          placeholder={`Model ${idx + 1}, e.g. Dell Latitude 7490 i7 8th 16/512`}
                          className={inputCls}
                        />
                      )}
                    </div>
                    <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} placeholder="Qty" className={inputCls} />
                    <input type="number" min="0" value={it.unit_price} onChange={(e) => setItem(it.key, { unit_price: e.target.value })} placeholder="Price" className={inputCls} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setItems((a) => [...a, newItem()])} className="text-xs font-semibold text-[#0f9d48]">
                + Add another item
              </button>
            </div>
            <div className="mt-3">
              <Field label="Specs / Requirement Note">
                <input value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="RAM, SSD, charger, bag, warranty…" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* payment */}
          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">💰 Payment</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Payment received (Rs)">
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={advance === null ? (total ? String(total) : "") : advance}
                    onChange={(e) => setAdvance(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                  {advance !== null && adv !== total && (
                    <button
                      type="button"
                      onClick={() => setAdvance(null)}
                      className="shrink-0 rounded-lg border border-gray-200 px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Full
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Received via">
                <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={!adv} className={inputCls}>
                  <option value="">{adv ? "Select" : "—"}</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Transaction ID / Ref">
                <input value={reference} onChange={(e) => setReference(e.target.value)} disabled={!adv} className={inputCls} />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Total</p>
                <p className="text-base font-bold text-gray-900">{rs(total)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Paid</p>
                <p className="text-base font-bold text-green-700">{rs(adv)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">{cod > 0 ? "Credit (balance due)" : "Status"}</p>
                <p className={`text-base font-bold ${cod > 0 ? "text-red-600" : "text-green-700"}`}>{cod > 0 ? rs(cod) : "✓ Fully paid"}</p>
              </div>
            </div>
          </div>

          {/* delivery */}
          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">🚚 Delivery Address</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name" required><input value={d.delivery_name} onChange={(e) => setF("delivery_name", e.target.value)} className={inputCls} /></Field>
              <Field label="Phone No" required><input value={d.delivery_phone} onChange={(e) => setF("delivery_phone", e.target.value)} className={inputCls} /></Field>
              <Field label="2nd Phone No"><input value={d.delivery_phone2} onChange={(e) => setF("delivery_phone2", e.target.value)} className={inputCls} /></Field>
              <Field label="House No"><input value={d.delivery_house} onChange={(e) => setF("delivery_house", e.target.value)} className={inputCls} /></Field>
              <Field label="Street No / Road"><input value={d.delivery_street} onChange={(e) => setF("delivery_street", e.target.value)} className={inputCls} /></Field>
              <Field label="Sector / Block / Area"><input value={d.delivery_area} onChange={(e) => setF("delivery_area", e.target.value)} className={inputCls} /></Field>
              <Field label="Nearest Landmark"><input value={d.delivery_landmark} onChange={(e) => setF("delivery_landmark", e.target.value)} className={inputCls} /></Field>
              <Field label="City" required><CitySelect value={d.delivery_city} onChange={(v) => setF("delivery_city", v)} /></Field>
            </div>
          </div>

          {/* dispatch */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Dispatch date">
              <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note for operations team">
                <input value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)} placeholder="e.g. call before delivery, gift pack…" className={inputCls} />
              </Field>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !!preview?.existing_order}
            className="rounded-lg bg-[#17D65D] px-5 py-2 text-sm font-bold text-black hover:bg-[#15c455] disabled:opacity-50"
          >
            {saving ? "Sending..." : "Create Customer & Send to Operations"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* inventory product search */
function ProductPicker({ label, onPick }: { label: string; onPick: (p: ProductHit) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: "15", status: "active" });
        if (q.trim()) qs.set("search", q.trim());
        const r = await fetch(`/api/products?${qs}`, { credentials: "include" });
        const j = r.ok ? await r.json() : { data: [] };
        setHits(j.data || []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? q : label}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search product by name / SKU…"
        className={inputCls}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No product found — use “Custom model”</li>
          ) : (
            hits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span>
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-gray-400">{p.sku}</span>
                  </span>
                  <span className="text-xs text-gray-600">{rs(p.sale_price)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
