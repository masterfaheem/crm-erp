"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BRAND, DEFAULT_ITEM_WARRANTY, WARRANTY_TERMS, waNumber } from "@/lib/invoiceBrand";

/* ============================================================
   PRINTABLE INVOICE  (/print/invoice/:id)
   A4, branded. "Print / Save PDF" uses the browser's PDF printer.
   Built only from the saved bill.
============================================================ */
type Item = {
  description: string; sku: string | null; quantity: number; unit_price: number;
  line_subtotal: number; line_discount: number; line_tax: number; line_total: number;
};
type Payment = { payment_number: string; payment_date: string; amount: number; method_label: string; reference: string | null };
type Inv = {
  id: number; invoice_number: string; invoice_date: string; created_at: string; status: string;
  subtotal: number; tax_total: number; discount_total: number; shipping_total: number; grand_total: number;
  paid_amount: number; balance: number; notes: string | null; order_number: string | null;
  customer_code: string | null; customer_name: string | null; customer_phone: string | null;
  customer_whatsapp: string | null; customer_address: string | null; customer_city: string | null;
  salesperson: string | null; channel: "online" | "walk_in";
  items: Item[]; payments: Payment[];
  delivery: Record<string, string | null> | null;
  meta: { delivery_mode: string | null; delivered_on: string | null; cancelled_on: string | null; cancel_reason: string | null; cancel_settlement: string | null } | null;
  exchange: {
    exchange_number: string; original_number: string; original_sale_day: string; days_after_sale: number;
    within_warranty: number; warranty_claim: number; warranty_start_day: string; warranty_until_day: string;
    reason: string | null; difference: string | number;
  } | null;
  exchanged_later: { exchange_number: string; date: string; exchange_invoice_id: number }[];
  refunds: { refund_number: string; refund_date: string; amount: number; method: string }[];
};

const fmtDay = (ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? String(ymd) : d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
};
const REFUND_METHOD: Record<string, string> = { cash: "Cash", bank_transfer: "Bank Transfer", wallet: "JazzCash / Easypaisa", card: "Card" };

const rs = (n: unknown) =>
  "Rs " + (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "PAID", cls: "bg-[#17D65D]/15 text-[#0b8a3a] border-[#17D65D]/40" },
  partially_paid: { label: "PARTIALLY PAID", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  unpaid: { label: "UNPAID", cls: "bg-red-50 text-red-700 border-red-300" },
  cancelled: { label: "CANCELLED", cls: "bg-gray-100 text-gray-600 border-gray-300" },
  draft: { label: "DRAFT", cls: "bg-gray-100 text-gray-600 border-gray-300" },
};

function fmtDateTime(created: string, date: string) {
  const d = new Date(created || date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Inv | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/invoices/${id}/print`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Could not load invoice");
        setInv(j.data);
        document.title = `${j.data.invoice_number} - Techno X Laptops`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load invoice");
      }
    })();
  }, [id]);

  if (error) return <div className="p-10 text-center text-sm text-red-600">{error}</div>;
  if (!inv) return <div className="p-10 text-center text-sm text-gray-500">Loading invoice…</div>;

  const st = STATUS[inv.status] || { label: inv.status.toUpperCase(), cls: "bg-gray-100 text-gray-700 border-gray-300" };
  const waTo = waNumber(inv.customer_whatsapp) || waNumber(inv.customer_phone);
  const methods =
    Array.from(new Set([
      ...inv.payments.map((p) => p.method_label),
      ...(inv.refunds || []).map((r) => `Refunded (${REFUND_METHOD[r.method] || r.method})`),
    ])).join(" + ") ||
    (Number(inv.grand_total) < 0 ? "Kept as credit" : Number(inv.grand_total) === 0 ? "No difference" : "Not paid yet");
  const d = inv.delivery;
  const isExchange = !!inv.exchange || inv.invoice_number.startsWith("EXC-");
  const isCancelled = inv.status === "cancelled";
  const deliveryText = d
    ? ["Courier delivery", d.courier, d.tracking_no ? `Tracking ${d.tracking_no}` : null].filter(Boolean).join(" · ")
    : "Handed over at store";
  const lineWarranty = (it: Item) =>
    Number(it.quantity) < 0 ? "Returned" : inv.exchange ? `Till ${fmtDay(inv.exchange.warranty_until_day)}` : DEFAULT_ITEM_WARRANTY;
  const deliveryAddress = d
    ? [d.delivery_house, d.delivery_street, d.delivery_area, d.delivery_landmark, d.delivery_city].filter(Boolean).join(", ")
    : [inv.customer_address, inv.customer_city].filter(Boolean).join(", ");

  const waMessage =
    `Assalam o Alaikum ${inv.customer_name || ""},\n` +
    `Thank you for choosing Techno X Laptops.\n\n` +
    `${isExchange ? "Exchange invoice" : "Invoice"}: ${inv.invoice_number}\n` +
    `Total: ${rs(inv.grand_total)}\n` +
    `Paid: ${rs(inv.paid_amount)}\n` +
    (Number(inv.balance) > 0 ? `Balance: ${rs(inv.balance)}\n` : "") +
    `\nYour invoice PDF is attached. Please keep it for warranty claims (${DEFAULT_ITEM_WARRANTY} laptop warranty).\n` +
    `${BRAND.websiteLabel} | ${BRAND.phones.join(" / ")}`;

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 10mm; } @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* ACTIONS */}
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-3">
        <button onClick={() => history.back()} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ← Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
            🖨️ Print / Save PDF
          </button>
          {waTo ? (
            <a
              href={`https://wa.me/${waTo}?text=${encodeURIComponent(waMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
            >
              Share on WhatsApp
            </a>
          ) : (
            <span className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-500">No valid WhatsApp number on this customer</span>
          )}
        </div>
        <p className="w-full text-right text-[11px] text-gray-500">
          To send the PDF: click Print / Save PDF → choose “Save as PDF”, then Share on WhatsApp and attach the saved file.
        </p>
      </div>

      {/* INVOICE SHEET */}
      <div className="mx-auto max-w-[210mm] bg-white px-8 py-7 text-[12px] leading-snug text-gray-800 shadow print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b-4 border-[#17D65D] pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo} alt="Techno X Laptops" className="h-16 w-auto" />
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-600">
              <div>📞 {BRAND.phones.join("  |  ")}</div>
              <div>🌐 {BRAND.websiteLabel}{BRAND.address ? `  ·  📍 ${BRAND.address}` : ""}</div>
              {BRAND.social.length > 0 && (
                <div className="flex items-center gap-1 pt-0.5">
                  {BRAND.social.map((s) => (
                    <span
                      key={s.label}
                      title={s.label}
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[8px] font-bold leading-none text-white"
                      style={{ backgroundColor: s.color }}
                    >
                      {s.short}
                    </span>
                  ))}
                  <span className="ml-1 font-medium text-gray-700">{BRAND.socialName}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-wide text-gray-900">{isExchange ? "EXCHANGE INVOICE" : "INVOICE"}</div>
            <div className="mt-1 font-mono text-sm font-semibold">{inv.invoice_number}</div>
            <div className="text-[11px] text-gray-500">{fmtDateTime(inv.created_at, inv.invoice_date)}</div>
            <span className={`mt-2 inline-block rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider ${st.cls}`}>{st.label}</span>
          </div>
        </div>

        {/* CANCELLED */}
        {isCancelled && (
          <div className="mt-4 rounded-md border-2 border-red-300 bg-red-50 p-3 text-red-800">
            <div className="text-sm font-bold">THIS BILL IS CANCELLED</div>
            {inv.meta?.cancelled_on && <div className="text-[11px]">On {inv.meta.cancelled_on}{inv.meta.cancel_reason ? ` — ${inv.meta.cancel_reason}` : ""}</div>}
          </div>
        )}

        {/* EXCHANGE DETAILS */}
        {inv.exchange && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">Exchange details</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <div>Original bill: <b>{inv.exchange.original_number}</b> ({fmtDay(inv.exchange.original_sale_day)})</div>
              <div>Exchanged after: <b>{inv.exchange.days_after_sale} days</b> {Number(inv.exchange.within_warranty) ? "(within warranty)" : "(after warranty period)"}</div>
              <div>Type: <b>{Number(inv.exchange.warranty_claim) ? "Warranty claim" : "Customer exchange / upgrade"}</b></div>
              <div>New unit warranty: <b>{fmtDay(inv.exchange.warranty_start_day)} → {fmtDay(inv.exchange.warranty_until_day)}</b></div>
              {inv.exchange.reason && <div className="col-span-2">Reason: {inv.exchange.reason}</div>}
            </div>
          </div>
        )}
        {inv.exchanged_later.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Exchanged later: {inv.exchanged_later.map((e) => e.exchange_number).join(", ")} — see the exchange invoice for the unit now with the customer.
          </div>
        )}

        {/* PARTIES */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Bill To</div>
            <div className="text-sm font-semibold text-gray-900">{inv.customer_name}</div>
            {inv.customer_phone && <div>Phone: {inv.customer_phone}</div>}
            {inv.customer_whatsapp && inv.customer_whatsapp !== inv.customer_phone && <div>WhatsApp: {inv.customer_whatsapp}</div>}
            {deliveryAddress && <div className="text-gray-600">{deliveryAddress}</div>}
            {inv.customer_code && <div className="text-[10px] text-gray-400">Customer {inv.customer_code}</div>}
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sale Details</div>
            <table className="w-full">
              <tbody>
                <tr><td className="pr-2 text-gray-500">Salesperson</td><td className="font-medium">{inv.salesperson || "-"}</td></tr>
                <tr><td className="pr-2 text-gray-500">Payment</td><td className="font-medium">{methods}</td></tr>
                <tr><td className="pr-2 text-gray-500">Delivery</td><td className="font-medium">{deliveryText}{!d && inv.meta?.delivered_on ? ` (${inv.meta.delivered_on})` : ""}</td></tr>
                {inv.order_number && <tr><td className="pr-2 text-gray-500">Order #</td><td className="font-medium">{inv.order_number}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* ITEMS */}
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-gray-900 text-left text-[11px] uppercase tracking-wider text-white">
              <th className="px-2 py-2 w-6">#</th>
              <th className="px-2 py-2">Product Description</th>
              <th className="px-2 py-2">Warranty</th>
              <th className="px-2 py-2 text-center">Qty</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-200 align-top" style={{ breakInside: "avoid" }}>
                <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-medium text-gray-900 whitespace-pre-line">{it.description}</div>
                  {it.sku && <div className="text-[10px] text-gray-400">SKU {it.sku}</div>}
                </td>
                <td className="px-2 py-2">{lineWarranty(it)}</td>
                <td className="px-2 py-2 text-center">{Number(it.quantity)}</td>
                <td className="px-2 py-2 text-right">{rs(it.unit_price)}</td>
                <td className="px-2 py-2 text-right font-medium">{rs(it.line_subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* TOTALS + PAYMENTS */}
        <div className="mt-4 grid grid-cols-2 gap-4" style={{ breakInside: "avoid" }}>
          <div>
            {(inv.payments.length > 0 || inv.refunds.length > 0) && (
              <div className="rounded-md border border-gray-200 p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Payments Received</div>
                {inv.payments.map((p) => (
                  <div key={p.payment_number} className="flex justify-between">
                    <span>{p.payment_date} · {p.method_label}</span>
                    <span className="font-medium">{rs(p.amount)}</span>
                  </div>
                ))}
                {inv.refunds.map((r) => (
                  <div key={r.refund_number} className="flex justify-between text-red-700">
                    <span>{r.refund_date} · Refunded ({REFUND_METHOD[r.method] || r.method})</span>
                    <span className="font-medium">− {rs(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {inv.notes && <div className="mt-2 text-[11px] text-gray-500 whitespace-pre-line">Note: {inv.notes}</div>}
          </div>
          <table className="w-full self-start">
            <tbody>
              <tr><td className="py-0.5 text-gray-500">Subtotal</td><td className="text-right">{rs(inv.subtotal)}</td></tr>
              {Number(inv.discount_total) > 0 && <tr><td className="py-0.5 text-gray-500">Discount</td><td className="text-right">− {rs(inv.discount_total)}</td></tr>}
              {Number(inv.tax_total) > 0 && <tr><td className="py-0.5 text-gray-500">Tax</td><td className="text-right">{rs(inv.tax_total)}</td></tr>}
              {Number(inv.shipping_total) > 0 && <tr><td className="py-0.5 text-gray-500">Delivery charges</td><td className="text-right">{rs(inv.shipping_total)}</td></tr>}
              <tr className="border-t-2 border-gray-900 text-base font-bold text-gray-900">
                <td className="py-1.5">{Number(inv.grand_total) < 0 ? "Credit to customer" : isExchange ? "Difference to pay" : "Grand Total"}</td>
                <td className="text-right">{rs(Math.abs(Number(inv.grand_total)))}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500">{Number(inv.paid_amount) < 0 ? "Refunded" : "Amount Paid"}</td>
                <td className="text-right font-medium text-[#0b8a3a]">{rs(Math.abs(Number(inv.paid_amount)))}</td>
              </tr>
              {Number(inv.grand_total) < 0 && inv.refunds.length === 0 && (
                <tr><td colSpan={2} className="py-0.5 text-[11px] text-gray-500">Kept as credit in the customer&apos;s account (usable on next purchase).</td></tr>
              )}
              <tr className="font-semibold"><td className="py-0.5">Balance</td><td className={`text-right ${Number(inv.balance) > 0 ? "text-red-600" : ""}`}>{rs(inv.balance)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* WARRANTY */}
        <div className="mt-5 rounded-md border border-[#17D65D]/40 bg-[#17D65D]/5 p-3" style={{ breakInside: "avoid" }}>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-800">Warranty Terms &amp; Conditions</div>
          <ol className="grid grid-cols-2 gap-x-5 gap-y-1 text-[10.5px] text-gray-700">
            {WARRANTY_TERMS.map((t, i) => (
              <li key={t.title}><span className="font-semibold">{i + 1}. {t.title}:</span> {t.text}</li>
            ))}
          </ol>
        </div>

        {/* FOOTER */}
        <div className="mt-5 flex items-end justify-between border-t border-gray-200 pt-3" style={{ breakInside: "avoid" }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Sold By</div>
            <div className="font-semibold">{inv.salesperson || "-"}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-gray-900">{BRAND.thankYou}</div>
            <div className="text-[10.5px] text-gray-500">{BRAND.name} · {BRAND.phones.join(" / ")} · {BRAND.websiteLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
