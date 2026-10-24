"use client";

import { useEffect, useState } from "react";
import AccShell, { RangePicker, inputCls, rs, todayPKT } from "../AccShell";

type Acc = { id: number; code: string; name: string; type: string };
type Line = { entry_id: number; d: string; entry_number: string | null; source_type: string; source_id: number | null; source_ref: string | null; memo: string | null; debit: number; credit: number; description: string | null; party_name: string | null; balance: number };

const SOURCE_LINK = (l: Line) =>
  ["invoice", "invoice_cancel"].includes(l.source_type) && l.source_id ? `/print/invoice/${l.source_id}` : null;

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [from, setFrom] = useState(`${todayPKT().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayPKT());
  const [data, setData] = useState<{ opening: number; closing: number; lines: Line[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sp.get("account_id")) setAccountId(Number(sp.get("account_id")));
    if (sp.has("from")) setFrom(sp.get("from") || "");
    if (sp.get("to")) setTo(sp.get("to") || todayPKT());
    fetch("/api/accounting/accounts", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setAccounts(j.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      try {
        const r = await fetch(`/api/accounting/ledger?account_id=${accountId}&from=${from}&to=${to}`, { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setData(j.data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
      }
    })();
  }, [accountId, from, to]);

  return (
    <AccShell title="Account Ledger" subtitle="Every entry in one account with running balance"
      right={<RangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}>
      <select value={accountId || ""} onChange={(e) => setAccountId(Number(e.target.value))} className={`${inputCls} w-full max-w-md`}>
        <option value="">Choose an account…</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
      </select>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && accountId > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-gray-50/60 text-gray-600"><td className="px-3 py-2" colSpan={5}>Opening balance</td><td className="px-3 py-2 text-right font-medium">{rs(data.opening)}</td></tr>
              {data.lines.map((l, i) => {
                const href = SOURCE_LINK(l);
                return (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">{l.d}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{l.source_ref}</a> : l.entry_number || l.source_ref}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">{[l.memo, l.party_name, l.description].filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-2 text-right">{l.debit ? rs(l.debit) : ""}</td>
                    <td className="px-3 py-2 text-right">{l.credit ? rs(l.credit) : ""}</td>
                    <td className="px-3 py-2 text-right font-medium">{rs(l.balance)}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold"><td className="px-3 py-2" colSpan={5}>Closing balance</td><td className="px-3 py-2 text-right">{rs(data.closing)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </AccShell>
  );
}
