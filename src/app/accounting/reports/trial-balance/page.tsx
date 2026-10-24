"use client";

import { useEffect, useState } from "react";
import AccShell, { RangePicker, SyncNote, rs, todayPKT, type SyncInfo } from "../../AccShell";

type TL = { id: number; code: string; name: string; type: string; debit: number; credit: number; dr: number; cr: number };

export default function TrialBalancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayPKT());
  const [data, setData] = useState<{ lines: TL[]; total_dr: number; total_cr: number } | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/accounting/reports?type=tb&from=${from}&to=${to}`, { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setData(j.data);
        setSync(j.sync);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
      }
    })();
  }, [from, to]);
  return (
    <AccShell title="Trial Balance" subtitle="Every account's debit and credit — the two totals must match"
      right={<RangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Account</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.code}</td>
                  <td className="px-4 py-2"><a href={`/accounting/ledger?account_id=${l.id}&from=${from}&to=${to}`} className="hover:underline">{l.name}</a></td>
                  <td className="px-4 py-2 text-xs capitalize text-gray-500">{l.type}</td>
                  <td className="px-4 py-2 text-right">{l.dr ? rs(l.dr) : ""}</td>
                  <td className="px-4 py-2 text-right">{l.cr ? rs(l.cr) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`font-semibold ${data.total_dr === data.total_cr ? "bg-[#17D65D]/10" : "bg-red-50 text-red-700"}`}>
                <td className="px-4 py-2" colSpan={3}>Total {data.total_dr === data.total_cr ? "✓ matches" : "— does not match"}</td>
                <td className="px-4 py-2 text-right">{rs(data.total_dr)}</td>
                <td className="px-4 py-2 text-right">{rs(data.total_cr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <SyncNote sync={sync} />
    </AccShell>
  );
}
