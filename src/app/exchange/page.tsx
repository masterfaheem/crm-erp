"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   EXCHANGE / RETURN  (/exchange?invoice=<id>)
   Customer brings back a unit from an old bill and takes another
   (or just returns it). One EXC- bill records it: returned unit
   comes into stock, given unit goes out, only the price difference
   is paid / refunded / kept as credit. Warranty is recorded.
============================================================ */
type SrcItem = { id: number; product_id: number | null; description: string; sku: string | null; quantity: number; returned: number; returnable: number; paid_unit_price: number };
type Source = {
  invoice: { id: number; invoice_number: string; invoice_date: string; status: string; grand_total: number; customer_id: number; customer_name: string; customer_phone: string | null; customer_code: string };
  items: SrcItem[];
  warranty: { start: string; until: string; days_since_start: number; within: boolean };
  exchanges: { exchange_number: string; d: string }[];
};
type Ret = { on: boolean; quantity: number; credit_price: string; serial: string; condition: string };
type Give = { key: string; product_id: number | null; name: string; sku: string; stock: number | null; quantity: number; unit_price: string; serial: string };
type Product = { id: number; name: string; sku: string; sale_price: number; current_stock: number; product_type: string; status: string };

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";
const rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "wallet", label: "JazzCash / Easypaisa" },
  { value: "card", label: "Card (POS machine)" },
];
const fmtDay = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00`);
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
};
const newRef = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `exc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export default function ExchangePage() {
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
    window.addEventListener("erp:sidebar-collapse", read);
    return () => window.removeEventListener("erp:sidebar-collapse", read);
  }, []);
  return (
    <>
      <Navbar />
      <main className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <div className="mx-auto max-w-5xl p-4 sm:p-6">
          <ExchangeContent />
        </div>
      </main>
    </>
  );
}

function ExchangeContent() {
  const [src, setSrc] = useState<Source | null>(null);
  const [loadError, setLoadError] = useState("");
  const [ret, setRet] = useState<Record<number, Ret>>({});
  const [give, setGive] = useState<Give[]>([]);
  const [reason, setReason] = useState("");
  const [warrantyClaim, setWarrantyClaim] = useState(true);
  const [warrantyStart, setWarrantyStart] = useState<"original" | "fresh">("original");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [refundMode, setRefundMode] = useState<"refund" | "credit">("refund");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundRef, setRefundRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ exchange_number: string; invoice_id: number; difference: number; settlement: string; warranty_until: string } | null>(null);
  const ref = useRef("");

  const load = useCallback(async (key: string) => {
    setLoadError("");
    setSrc(null);
    setDone(null);
    try {
      const r = await fetch(`/api/exchanges?invoice=${encodeURIComponent(key)}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Bill not found");
      const s: Source = j.data;
      setSrc(s);
      const init: Record<number, Ret> = {};
      for (const it of s.items) init[it.id] = { on: false, quantity: Math.min(1, it.returnable), credit_price: String(it.paid_unit_price), serial: "", condition: "" };
      setRet(init);
      setGive([]);
      setWarrantyClaim(s.warranty.within);
      setWarrantyStart("original");
      ref.current = "";
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Bill not found");
    }
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invoice");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) load(id);
  }, [load]);

  const returnedValue = useMemo(
    () => (src ? src.items.reduce((a, it) => (ret[it.id]?.on ? a + (Number(ret[it.id].credit_price) || 0) * ret[it.id].quantity : a), 0) : 0),
    [src, ret]
  );
  const givenValue = useMemo(() => give.reduce((a, g) => a + (Number(g.unit_price) || 0) * g.quantity, 0), [give]);
  const diff = Math.round((givenValue - returnedValue) * 100) / 100;

  useEffect(() => {
    ref.current = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayAmount(diff > 0 ? String(diff) : "");
  }, [diff]);

  const submit = async () => {
    if (!src) return;
    setError("");
    const returned = src.items
      .filter((it) => ret[it.id]?.on)
      .map((it) => ({ item_id: it.id, quantity: ret[it.id].quantity, credit_price: Number(ret[it.id].credit_price) || 0, serial: ret[it.id].serial, condition: ret[it.id].condition }));
    if (!returned.length) return setError("Tick the unit the customer is returning.");
    if (reason.trim().length < 3) return setError("Write the reason for the exchange.");
    if (diff > 0 && (Number(payAmount) || 0) > diff) return setError("Received amount is more than the difference.");
    if (diff > 0 && (Number(payAmount) || 0) < diff &&
      !window.confirm(`Received ${rs(Number(payAmount) || 0)} of ${rs(diff)}. The rest (${rs(diff - (Number(payAmount) || 0))}) goes to the customer's khata. Continue?`)) return;
    setSaving(true);
    if (!ref.current) ref.current = newRef();
    try {
      const r = await fetch("/api/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          client_ref: ref.current,
          original_invoice_id: src.invoice.id,
          returned,
          given: give.map((g) => ({ product_id: g.product_id, description: g.name, quantity: g.quantity, unit_price: Number(g.unit_price) || 0, serial: g.serial })),
          reason,
          warranty_claim: warrantyClaim,
          warranty_start: warrantyStart,
          payment: { amount: diff > 0 ? Number(payAmount) || 0 : 0, method: payMethod, reference: payRef },
          refund_mode: refundMode,
          refund_method: refundMethod,
          refund_reference: refundRef,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save the exchange");
      setDone({ ...j.data, difference: Number(j.data.difference) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the exchange");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Exchange / Return</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Customer returns a unit from an old bill and takes another (or just returns it). Stock, khata and profit adjust by the real difference only.
        </p>
      </div>

      <BillFinder onPick={(id) => load(String(id))} />
      {loadError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      {done && (
        <div className="rounded-lg border border-[#17D65D]/40 bg-[#17D65D]/10 p-5">
          <div className="text-base font-semibold text-gray-900">Exchange saved — {done.exchange_number}</div>
          <p className="mt-1 text-sm text-gray-700">
            {done.difference > 0
              ? `Customer pays ${rs(done.difference)}${done.settlement === "paid" ? " (received)" : " (balance in khata)"}.`
              : done.difference < 0
              ? `${rs(-done.difference)} ${done.settlement === "refunded" ? "refunded to the customer" : "kept as customer credit"}.`
              : "Even exchange — no money changed hands."}{" "}
            New unit warranty till {fmtDay(done.warranty_until)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/print/invoice/${done.invoice_id}`} target="_blank" rel="noopener noreferrer" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
              🧾 Exchange invoice / PDF / WhatsApp
            </a>
            <button type="button" onClick={() => src && load(String(src.invoice.id))} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">
              Back to this bill
            </button>
          </div>
        </div>
      )}

      {src && !done && (
        <>
          {/* BILL */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm font-semibold text-gray-900">{src.invoice.invoice_number}</div>
                <div className="text-sm text-gray-700">
                  {src.invoice.customer_name} · {src.invoice.customer_phone || "-"} <span className="text-xs text-gray-400">{src.invoice.customer_code}</span>
                </div>
                <div className="text-xs text-gray-500">Sold {fmtDay(src.invoice.invoice_date)} · Total {rs(src.invoice.grand_total)}</div>
              </div>
              <div className={`rounded-md border px-3 py-2 text-xs ${src.warranty.within ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <div className="font-semibold">{src.warranty.within ? "In warranty" : "Warranty period over"}</div>
                <div>{src.warranty.days_since_start} days since {fmtDay(src.warranty.start)} · valid till {fmtDay(src.warranty.until)}</div>
              </div>
            </div>
            {src.invoice.status === "cancelled" && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">This bill is cancelled — it can&apos;t be exchanged.</p>}
            {src.exchanges.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">Earlier exchanges on this bill: {src.exchanges.map((e) => `${e.exchange_number} (${e.d})`).join(", ")}</p>
            )}
          </div>

          {/* RETURNED */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">1. Unit(s) the customer is returning</h2>
            <div className="space-y-2">
              {src.items.map((it) => {
                const r = ret[it.id];
                if (!r) return null;
                const set = (p: Partial<Ret>) => setRet({ ...ret, [it.id]: { ...r, ...p } });
                return (
                  <div key={it.id} className={`rounded-md border p-3 ${r.on ? "border-blue-300 bg-blue-50/50" : "border-gray-200"}`}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" checked={r.on} disabled={it.returnable <= 0} onChange={(e) => set({ on: e.target.checked })} className="mt-1" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{it.description}</div>
                        <div className="text-xs text-gray-500">
                          Sold {it.quantity} · paid {rs(it.paid_unit_price)} each
                          {it.returned > 0 ? ` · ${it.returned} already returned` : ""}
                          {it.returnable <= 0 ? " · nothing left to return" : ""}
                        </div>
                      </div>
                    </label>
                    {r.on && (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <label className="mb-0.5 block text-[11px] text-gray-600">Qty</label>
                          <input type="number" min={1} max={it.returnable} value={r.quantity}
                            onChange={(e) => set({ quantity: Math.max(1, Math.min(it.returnable, Number(e.target.value) || 1)) })} className={inputCls} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] text-gray-600">Return value (each)</label>
                          <input type="number" min={0} value={r.credit_price} onChange={(e) => set({ credit_price: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] text-gray-600">Serial no.</label>
                          <input value={r.serial} onChange={(e) => set({ serial: e.target.value })} placeholder="S/N" className={inputCls} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] text-gray-600">Condition / fault</label>
                          <input value={r.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="e.g. keyboard fault" className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* GIVEN */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">2. Unit(s) given to the customer <span className="font-normal text-gray-400">(leave empty for a plain return)</span></h2>
            <ProductPicker
              onPick={(p) =>
                setGive([...give, { key: Math.random().toString(36).slice(2), product_id: p.id, name: p.name, sku: p.sku, stock: Number(p.current_stock), quantity: 1, unit_price: String(p.sale_price || 0), serial: "" }])
              }
            />
            <div className="mt-2 space-y-2">
              {give.map((g, i) => {
                const set = (p: Partial<Give>) => setGive(give.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={g.key} className="grid grid-cols-2 items-end gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-5">
                    <div className="col-span-2">
                      <div className="text-sm font-medium text-gray-900">{g.name}</div>
                      <div className="text-xs text-gray-500">{g.sku}{g.stock !== null ? ` · stock ${g.stock}` : ""}</div>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-gray-600">Price</label>
                      <input type="number" min={0} value={g.unit_price} onChange={(e) => set({ unit_price: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-gray-600">Serial no.</label>
                      <input value={g.serial} onChange={(e) => set({ serial: e.target.value })} placeholder="S/N" className={inputCls} />
                    </div>
                    <button type="button" onClick={() => setGive(give.filter((_, j) => j !== i))} className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DETAILS + MONEY */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-800">3. Reason &amp; warranty</h2>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason * (e.g. display issue, upgrade to i7)" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                {([[true, "Warranty claim"], [false, "Customer exchange / upgrade"]] as const).map(([v, l]) => (
                  <button key={l} type="button" onClick={() => setWarrantyClaim(v)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium ${warrantyClaim === v ? "border-[#17D65D] bg-[#17D65D]/10" : "border-gray-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-gray-700">Warranty of the new unit</div>
                <select value={warrantyStart} onChange={(e) => setWarrantyStart(e.target.value as "original" | "fresh")} className={inputCls}>
                  <option value="original">Continue old warranty (till {fmtDay(src.warranty.until)})</option>
                  <option value="fresh">Fresh warranty from today</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-800">4. Money</h2>
              <div className="space-y-1 rounded-md bg-gray-50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Returned value</span><span>− {rs(returnedValue)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">New unit(s)</span><span>{rs(givenValue)}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                  <span>{diff > 0 ? "Customer pays" : diff < 0 ? "We return" : "Difference"}</span>
                  <span className={diff < 0 ? "text-red-600" : ""}>{rs(Math.abs(diff))}</span>
                </div>
              </div>
              {diff > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Received now" className={inputCls} />
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference (optional)" className={`${inputCls} col-span-2`} />
                </div>
              )}
              {diff < 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {([["refund", "Refund now"], ["credit", "Keep as credit"]] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setRefundMode(v)}
                        className={`rounded-md border px-3 py-2 text-xs font-medium ${refundMode === v ? "border-[#17D65D] bg-[#17D65D]/10" : "border-gray-200"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {refundMode === "refund" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} className={inputCls}>
                        {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} placeholder="Reference (optional)" className={inputCls} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={submit} disabled={saving || src.invoice.status === "cancelled"}
              className="rounded-md bg-[#17D65D] px-5 py-2.5 text-sm font-semibold text-black shadow-sm hover:bg-[#15c455] disabled:opacity-50">
              {saving ? "Saving…" : "Complete exchange"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- find the old bill ---------------- */
function BillFinder({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: number; invoice_number: string; customer_name: string; invoice_date: string; grand_total: number; status: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/invoices?search=${encodeURIComponent(t)}&limit=10`, { credentials: "include" });
        if (r.ok) setRows((await r.json()).data || []);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="relative rounded-lg border border-gray-200 bg-white p-4">
      <label className="mb-1 block text-xs font-medium text-gray-700">Find the old bill — bill number or customer name</label>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="e.g. INV-2026-0123 or Ali" className={inputCls} />
      {open && rows.length > 0 && (
        <ul className="absolute left-4 right-4 top-full z-20 mt-1 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { setOpen(false); setQ(r.invoice_number); onPick(r.id); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span><span className="font-mono font-semibold">{r.invoice_number}</span> · {r.customer_name}</span>
                <span className="text-xs text-gray-500">{String(r.invoice_date).slice(0, 10)} · {rs(Number(r.grand_total))}{r.status === "cancelled" ? " · cancelled" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- pick a product to give ---------------- */
function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Product[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/products?search=${encodeURIComponent(t)}&status=active&limit=15`, { credentials: "include" });
        if (r.ok) setRows((await r.json()).data || []);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model / SKU to give…" className={inputCls} />
      {rows.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {rows.map((p) => {
            const out = p.product_type === "product" && Number(p.current_stock) <= 0;
            return (
              <li key={p.id}>
                <button type="button" disabled={out} onClick={() => { onPick(p); setQ(""); setRows([]); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                  <span>{p.name} <span className="text-xs text-gray-400">{p.sku}</span></span>
                  <span className="text-xs text-gray-500">{rs(Number(p.sale_price))} · {out ? "out of stock" : `stock ${Number(p.current_stock)}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
