"use client";

import { useEffect, useState } from "react";

/* Exchanges & warranty record of a customer (hidden when there are none) */
type Item = { direction: "in" | "out"; description: string; quantity: number; unit_price: number; serial: string | null; item_condition: string | null };
type Ex = {
  id: number; exchange_number: string; exchange_invoice_id: number; original_number: string; original_sale_day: string;
  days_after_sale: number; within_warranty: number; warranty_claim: number; warranty_start_day: string; warranty_until_day: string;
  difference: number | string; settlement: string; reason: string | null; created_at: string; created_by_name: string | null; items: Item[];
};

const rs = (n: number) => "Rs " + Math.abs(Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
const day = (v: string) => {
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
};
const SETTLE: Record<string, string> = {
  even: "Even swap", paid: "Difference paid", partly_paid: "Partly paid (rest in khata)", credit_due: "Difference in khata",
  refunded: "Money refunded", credit: "Kept as credit",
};

export default function ExchangeHistory({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<Ex[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/exchanges?customer_id=${customerId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => alive && setRows(j.data || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customerId]);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Exchanges &amp; warranty record</h3>
        <p className="text-xs text-gray-500">Every unit returned / replaced for this customer</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((e) => {
          const d = Number(e.difference) || 0;
          return (
            <li key={e.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <a href={`/print/invoice/${e.exchange_invoice_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-semibold text-blue-700 hover:underline">
                    {e.exchange_number}
                  </a>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${Number(e.warranty_claim) ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                    {Number(e.warranty_claim) ? "Warranty claim" : "Exchange / upgrade"}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{day(e.created_at)}{e.created_by_name ? ` · ${e.created_by_name}` : ""}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                From {e.original_number} (sold {day(e.original_sale_day)}) — exchanged after <b>{e.days_after_sale} days</b>
                {Number(e.within_warranty) ? ", within warranty" : ", after warranty period"}.
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                {e.items.map((it, i) => (
                  <div key={i} className={it.direction === "in" ? "text-red-700" : "text-green-700"}>
                    {it.direction === "in" ? "↩ Returned" : "↪ Given"}: {it.description.replace(/^RETURNED \(from [^)]+\): /, "")}
                    {it.item_condition ? ` — ${it.item_condition}` : ""}
                  </div>
                ))}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {d === 0 ? "No difference" : d > 0 ? `Customer paid ${rs(d)}` : `${rs(d)} back to customer`} · {SETTLE[e.settlement] || e.settlement} · New warranty till{" "}
                <b>{day(e.warranty_until_day)}</b>
                {e.reason ? ` · ${e.reason}` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
