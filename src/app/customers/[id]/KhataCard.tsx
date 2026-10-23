"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Entry = {
  date: string;
  type: "bill" | "payment";
  ref_id: number;
  number: string;
  description: string;
  method?: string;
  debit: number;
  credit: number;
  balance: number;
};
type Summary = { opening: number; total_bills: number; total_paid: number; balance: number };

const METHOD: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  online: "JazzCash / Easypaisa",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

const rs = (n: number) =>
  "Rs " + Math.abs(Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

function balText(n: number) {
  if (n > 0) return { text: `${rs(n)} due`, cls: "text-red-600" };
  if (n < 0) return { text: `${rs(n)} advance`, cls: "text-[#0fa846]" };
  return { text: "Clear", cls: "text-gray-500" };
}

export default function KhataCard({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/customers/${customerId}/ledger`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 403) {
          // no "See khata / balance" permission
          if (alive) setHidden(true);
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Unable to load khata");
        if (!alive) return;
        setRows(j.data || []);
        setSum(j.summary || null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Unable to load khata"));
    return () => {
      alive = false;
    };
  }, [customerId]);

  const shown = showAll ? rows : rows.slice(0, 10);
  if (hidden) return null;
  const bal = sum ? balText(sum.balance) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">📒 Khata (Account Statement)</h2>
        <Link
          href={`/sales/customer-payments?customer_id=${customerId}&new=1`}
          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-[#17D65D]"
        >
          + Receive payment
        </Link>
      </div>

      {sum && (
        <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-4">
          {[
            ["Opening", balText(sum.opening).text, "text-gray-800"],
            ["Total bills", rs(sum.total_bills), "text-gray-900"],
            ["Total paid", rs(sum.total_paid), "text-[#0fa846]"],
            ["Balance", bal!.text, bal!.cls],
          ].map(([l, v, c]) => (
            <div key={l} className="bg-white px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{l}</div>
              <div className={`mt-0.5 text-sm font-bold ${c}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <p className="p-5 text-sm text-red-600">{error}</p>
      ) : !sum ? (
        <p className="p-5 text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">No bills or payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Details</th>
                <th className="px-4 py-2 text-right font-medium">Bill</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((e) => {
                const b = balText(e.balance);
                return (
                  <tr key={`${e.type}-${e.ref_id}`} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">{e.date}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            e.type === "bill"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {e.type === "bill" ? "Bill" : METHOD[e.method || ""] || "Payment"}
                        </span>
                        <span className="font-mono text-xs text-gray-700">{e.number}</span>
                      </div>
                      {e.type === "payment" && e.description && (
                        <div className="mt-0.5 max-w-xs truncate text-[11px] text-gray-500">{e.description}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-900">{e.debit ? rs(e.debit) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-[#0fa846]">{e.credit ? rs(e.credit) : ""}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold ${b.cls}`}>{b.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full border-t border-gray-100 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {showAll ? "Show less" : `Show all ${rows.length} entries`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
