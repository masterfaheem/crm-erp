"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   PENDING DISPATCH  (Operations team)
   Orders handed over from won leads:
   pending -> (bill in POS) invoiced -> shipped -> delivered
============================================================ */
interface OrderItem {
  product_id: number | null;
  description: string;
  product_name: string | null;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}
interface Order {
  id: number;
  status: string;
  sales_order_id: number;
  order_number: string;
  order_date: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  lead_id: number;
  lead_number: string;
  invoice_id: number | null;
  invoice_number: string | null;
  total_amount: number;
  advance_amount: number;
  advance_method: string | null;
  advance_reference: string | null;
  cod_amount: number;
  specs_note: string | null;
  delivery_name: string;
  delivery_phone: string;
  delivery_phone2: string | null;
  delivery_house: string | null;
  delivery_street: string | null;
  delivery_area: string | null;
  delivery_landmark: string | null;
  delivery_city: string;
  dispatch_day: string | null;
  dispatch_notes: string | null;
  courier: string | null;
  tracking_no: string | null;
  created_by_name: string | null;
  created_at: string;
  items: OrderItem[];
}

const TABS = [
  { key: "pending", label: "To Bill", tone: "text-amber-600" },
  { key: "invoiced", label: "Billed · Ready to Ship", tone: "text-blue-600" },
  { key: "shipped", label: "Shipped", tone: "text-indigo-600" },
  { key: "delivered", label: "Delivered", tone: "text-green-600" },
  { key: "cancelled", label: "Cancelled", tone: "text-gray-500" },
  { key: "all", label: "All", tone: "text-gray-900" },
];
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  invoiced: "bg-blue-100 text-blue-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "To Bill",
  invoiced: "Billed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  cash: "Cash",
  card: "Card",
  none: "—",
};
const COURIERS = ["TCS", "Leopards", "M&P", "Trax", "PostEx", "Call Courier", "BlueEx", "Rider (own)", "Other"];

const rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

function addressOf(o: Order) {
  return [o.delivery_house, o.delivery_street, o.delivery_area, o.delivery_landmark && (/^near\b/i.test(o.delivery_landmark) ? o.delivery_landmark : `Near ${o.delivery_landmark}`), o.delivery_city]
    .filter(Boolean)
    .join(", ");
}
function itemName(it: OrderItem) {
  return it.product_name || it.description || "Item";
}
function courierText(o: Order) {
  return [
    `Order: ${o.order_number}`,
    `Name: ${o.delivery_name}`,
    `Phone: ${o.delivery_phone}${o.delivery_phone2 ? " / " + o.delivery_phone2 : ""}`,
    `Address: ${addressOf(o)}`,
    `Item: ${o.items.map((it) => `${itemName(it)} x${Number(it.quantity)}`).join(", ")}`,
    `COD: ${rs(o.cod_amount)}`,
  ].join("\n");
}

export default function DispatchPage() {
  return (
    <Suspense fallback={null}>
      <Dispatch />
    </Suspense>
  );
}

function Dispatch() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get("status") || "pending");
  const [search, setSearch] = useState(params.get("search") || "");
  const [rows, setRows] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [shipFor, setShipFor] = useState<number | null>(null);
  const [courier, setCourier] = useState("TCS");
  const [tracking, setTracking] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(async (t: string, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: t });
      if (q.trim()) qs.set("search", q.trim());
      const r = await fetch(`/api/dispatch?${qs}`, { credentials: "include" });
      if (r.status === 401) throw new Error("Session expired. Please log in again.");
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const j = await r.json();
      setRows(j.data || []);
      setCounts(j.counts || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(tab, search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [tab, search, load]);

  const switchTab = (t: string) => {
    setTab(t);
    router.replace(`/dispatch?status=${t}`);
  };

  const update = async (o: Order, body: Record<string, unknown>) => {
    setBusy(o.id);
    try {
      const r = await fetch(`/api/dispatch/${o.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Update failed");
      setShipFor(null);
      await load(tab, search);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (o: Order) => {
    try {
      await navigator.clipboard.writeText(courierText(o));
      setCopied(o.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("Copy:", courierText(o));
    }
  };

  const print = (o: Order) => {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.order_number)}</title>
      <style>body{font-family:Arial,sans-serif;padding:16px;font-size:13px}h1{font-size:18px;margin:0 0 4px}
      .box{border:2px solid #000;padding:10px;margin-top:10px}.big{font-size:16px;font-weight:bold}
      table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:3px 0;border-bottom:1px dashed #999}</style></head><body>
      <h1>TechnoX — ${esc(o.order_number)}</h1><div>${esc(new Date().toLocaleDateString("en-PK"))}</div>
      <div class="box"><div class="big">${esc(o.delivery_name)}</div>
      <div>${esc(o.delivery_phone)}${o.delivery_phone2 ? " / " + esc(o.delivery_phone2) : ""}</div>
      <div>${esc(addressOf(o))}</div></div>
      <table>${o.items.map((it) => `<tr><td>${esc(itemName(it))}</td><td align="right">x${Number(it.quantity)}</td></tr>`).join("")}</table>
      ${o.specs_note ? `<p>Specs: ${esc(o.specs_note)}</p>` : ""}
      <div class="box big">COD: ${esc(rs(o.cod_amount))}</div>
      ${o.courier ? `<p>Courier: ${esc(o.courier)} ${esc(o.tracking_no || "")}</p>` : ""}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">📦 Pending Dispatch</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Online orders from the sales team → bill in POS → ship → deliver
                </p>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, name, phone, city, tracking…"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20 sm:w-80"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {TABS.map((t) => {
                const n =
                  t.key === "all"
                    ? Object.values(counts).reduce((a, b) => a + b, 0)
                    : counts[t.key] || 0;
                return (
                  <button
                    key={t.key}
                    onClick={() => switchTab(t.key)}
                    className={`shrink-0 rounded-xl border bg-white px-4 py-2.5 text-left shadow-sm transition ${
                      tab === t.key ? "border-[#17D65D] ring-2 ring-[#17D65D]/20" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t.label}</span>
                    <span className={`text-xl font-bold ${t.tone}`}>{n}</span>
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />
                ))}
              </div>
            ) : error ? (
              <p className="rounded-2xl bg-white p-10 text-center text-sm text-red-600">{error}</p>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
                <p className="text-3xl">📭</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">No orders here</p>
                <p className="mt-1 text-xs text-gray-500">Orders appear when the sales team clicks “Convert to Order” on a won lead.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {rows.map((o) => (
                  <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-gray-900">{o.order_number}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[o.status] || ""}`}>
                            {STATUS_LABEL[o.status] || o.status}
                          </span>
                          {o.invoice_number && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">🧾 {o.invoice_number}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          <Link href={`/customers/${o.customer_id}`} className="hover:underline">{o.customer_code} · {o.customer_name}</Link>
                          {" · "}
                          <Link href={`/leads/${o.lead_id}`} className="hover:underline">{o.lead_number}</Link>
                          {o.created_by_name && ` · by ${o.created_by_name}`}
                        </p>
                      </div>
                      {o.dispatch_day && (
                        <span className="text-xs font-semibold text-gray-600">Dispatch: {o.dispatch_day}</span>
                      )}
                    </div>

                    {/* items */}
                    <ul className="mt-3 divide-y divide-gray-100 rounded-xl bg-gray-50 px-3">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex items-center justify-between py-2 text-sm">
                          <span className="font-medium text-gray-900">
                            💻 {itemName(it)}
                            {!it.product_id && <span className="ml-1 text-[10px] font-semibold text-amber-600">(custom)</span>}
                            <span className="ml-1 text-gray-500">× {Number(it.quantity)}</span>
                          </span>
                          <span className="text-gray-700">{rs(it.line_total)}</span>
                        </li>
                      ))}
                    </ul>
                    {o.specs_note && <p className="mt-2 text-xs text-gray-700"><b>Specs:</b> {o.specs_note}</p>}

                    {/* money */}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-gray-50 py-1.5">
                        <p className="text-[10px] font-semibold uppercase text-gray-500">Total</p>
                        <p className="text-sm font-bold">{rs(o.total_amount)}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 py-1.5">
                        <p className="text-[10px] font-semibold uppercase text-gray-500">Advance</p>
                        <p className="text-sm font-bold text-green-700">{rs(o.advance_amount)}</p>
                        {Number(o.advance_amount) > 0 && (
                          <p className="text-[10px] text-gray-500">
                            {METHOD_LABEL[o.advance_method || ""] || o.advance_method}
                            {o.advance_reference ? ` · ${o.advance_reference}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg bg-red-50 py-1.5">
                        <p className="text-[10px] font-semibold uppercase text-gray-500">COD</p>
                        <p className="text-sm font-bold text-red-600">{rs(o.cod_amount)}</p>
                      </div>
                    </div>

                    {/* address */}
                    <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm">
                      <p className="font-bold text-gray-900">🚚 {o.delivery_name}</p>
                      <p className="text-gray-700">
                        <a href={`tel:${o.delivery_phone}`} className="hover:underline">{o.delivery_phone}</a>
                        {o.delivery_phone2 && <> · <a href={`tel:${o.delivery_phone2}`} className="hover:underline">{o.delivery_phone2}</a></>}
                      </p>
                      <p className="text-gray-700">{addressOf(o)}</p>
                      {o.dispatch_notes && <p className="mt-1 text-xs text-amber-700">📝 {o.dispatch_notes}</p>}
                      {o.courier && (
                        <p className="mt-1 text-xs text-indigo-700">
                          🚛 {o.courier} {o.tracking_no && `· ${o.tracking_no}`}
                        </p>
                      )}
                    </div>

                    {/* actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {o.status === "pending" && (
                        <Link href={`/pos?order=${o.sales_order_id}`} className="rounded-lg bg-[#17D65D] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#15c455]">
                          🧾 Bill in POS
                        </Link>
                      )}
                      {o.status === "invoiced" && (
                        <button
                          disabled={busy === o.id}
                          onClick={() => {
                            setShipFor(shipFor === o.id ? null : o.id);
                            setCourier(o.courier || "TCS");
                            setTracking(o.tracking_no || "");
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          🚛 Mark Shipped
                        </button>
                      )}
                      {o.status === "shipped" && (
                        <button disabled={busy === o.id} onClick={() => update(o, { status: "delivered" })} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
                          ✓ Delivered
                        </button>
                      )}
                      <button onClick={() => copy(o)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        {copied === o.id ? "✓ Copied" : "📋 Copy for courier"}
                      </button>
                      <button onClick={() => print(o)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        🖨️ Print slip
                      </button>
                      {o.status === "pending" && (
                        <button
                          disabled={busy === o.id}
                          onClick={() => window.confirm(`Cancel order ${o.order_number}?`) && update(o, { status: "cancelled" })}
                          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {shipFor === o.id && (
                      <div className="mt-3 flex flex-col gap-2 rounded-xl bg-indigo-50 p-3 sm:flex-row sm:items-center">
                        <select value={courier} onChange={(e) => setCourier(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                          {COURIERS.map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking / CN number" className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                        <button
                          disabled={busy === o.id}
                          onClick={() => update(o, { status: "shipped", courier, tracking_no: tracking })}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
