"use client";

import { useEffect, useState } from "react";
import AccShell, { SyncNote, inputCls, rs, todayPKT, type SyncInfo } from "../../AccShell";

type L = { id: number | null; code: string; name: string; amount: number };
type BS = {
  as_of: string; assets: L[]; liabilities: L[]; equity: L[]; total_assets: number; total_liabilities: number; total_equity: number;
  balanced: boolean; inventory_book: number; stock_value_at_cost: number | null;
};

function Section({ title, rows, total, asOf }: { title: string; rows: L[]; total: number; asOf: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">{title}</div>
      {rows.length === 0 && <div className="py-2 text-sm text-gray-400">Nothing</div>}
      {rows.map((r, i) => (
        <div key={`${r.code}-${i}`} className="flex justify-between border-b border-gray-100 py-2 text-sm text-gray-700">
          {r.id ? <a href={`/accounting/ledger?account_id=${r.id}&to=${asOf}`} className="hover:underline">{r.name}</a> : <span>{r.name}</span>}
          <span>{rs(r.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-sm font-semibold text-gray-900"><span>Total {title.toLowerCase()}</span><span>{rs(total)}</span></div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayPKT());
  const [data, setData] = useState<BS | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/accounting/reports?type=bs&as_of=${asOf}`, { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setData(j.data);
        setSync(j.sync);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
      }
    })();
  }, [asOf]);
  return (
    <AccShell title="Balance Sheet" subtitle="What the business owns and owes on a date"
      right={<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayPKT())} className={inputCls} />}>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <div className={`rounded-md px-4 py-2 text-sm ${data.balanced ? "bg-[#17D65D]/10 text-gray-800" : "bg-red-50 text-red-700"}`}>
            {data.balanced ? "✓ Balanced" : "Not balanced"}: Assets {rs(data.total_assets)} = Liabilities {rs(data.total_liabilities)} + Equity {rs(data.total_equity)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Assets" rows={data.assets} total={data.total_assets} asOf={asOf} />
            <div className="space-y-4">
              <Section title="Liabilities" rows={data.liabilities} total={data.total_liabilities} asOf={asOf} />
              <Section title="Equity" rows={data.equity} total={data.total_equity} asOf={asOf} />
            </div>
          </div>
          {data.stock_value_at_cost !== null && (
            <p className="text-xs text-gray-500">
              Inventory in the books: {rs(data.inventory_book)} · Stock on hand × purchase price today: {rs(data.stock_value_at_cost)}.
              A gap means purchase prices changed, stock was added without a purchase bill, or some sold items had no cost.
            </p>
          )}
          <SyncNote sync={sync} />
        </>
      )}
    </AccShell>
  );
}
