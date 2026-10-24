"use client";

import { useEffect, useState } from "react";
import AccShell, { RangePicker, SyncNote, rs, todayPKT, type SyncInfo } from "../../AccShell";

type Line = { id: number; code: string; name: string; amount: number };
type PL = {
  from: string | null; to: string; sales: number; delivery_income: number; returns: number; discounts: number; net_revenue: number;
  cogs: number; gross_profit: number; gross_margin: number | null; expenses: Line[]; total_expenses: number;
  other_income: Line[]; total_other_income: number; net_profit: number; net_margin: number | null;
  accounts: Record<string, number>; cost_quality: { estimated: number; missing: number };
};

function Row({ label, value, strong, href, indent, muted }: { label: string; value: number; strong?: boolean; href?: string; indent?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between border-b border-gray-100 py-2 text-sm ${strong ? "font-semibold text-gray-900" : muted ? "text-gray-500" : "text-gray-700"} ${indent ? "pl-4" : ""}`}>
      {href ? <a href={href} className="hover:underline">{label}</a> : <span>{label}</span>}
      <span>{rs(value)}</span>
    </div>
  );
}

export default function ProfitLossPage() {
  const t = todayPKT();
  const [from, setFrom] = useState(`${t.slice(0, 7)}-01`);
  const [to, setTo] = useState(t);
  const [data, setData] = useState<PL | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/accounting/reports?type=pl&from=${from}&to=${to}`, { credentials: "include" });
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
  const link = (id?: number) => (id ? `/accounting/ledger?account_id=${id}&from=${from}&to=${to}` : undefined);
  return (
    <AccShell title="Profit & Loss" subtitle="Sales are counted when the bill is made. Cost of goods = cost saved on each bill." right={<RangePicker from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />}>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Net sales", data.net_revenue, ""],
              ["Gross profit", data.gross_profit, data.gross_margin !== null ? `${data.gross_margin}% margin` : ""],
              ["Expenses", data.total_expenses, ""],
              ["Net profit", data.net_profit, data.net_margin !== null ? `${data.net_margin}% of sales` : ""],
            ].map(([l, v, s]) => (
              <div key={String(l)} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{l}</div>
                <div className={`mt-1 text-xl font-bold ${Number(v) < 0 ? "text-red-600" : "text-gray-900"}`}>{rs(Number(v))}</div>
                {s && <div className="text-xs text-gray-500">{s}</div>}
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Revenue</div>
            <Row label="Sales" value={data.sales} href={link(data.accounts.sales)} indent />
            {!!data.delivery_income && <Row label="Delivery charges received" value={data.delivery_income} href={link(data.accounts.delivery_income)} indent />}
            {!!data.returns && <Row label="Less: returns & exchanges" value={-data.returns} href={link(data.accounts.sales_returns)} indent />}
            {!!data.discounts && <Row label="Less: discounts given" value={-data.discounts} href={link(data.accounts.discounts)} indent />}
            <Row label="Net sales" value={data.net_revenue} strong />
            <Row label="Less: cost of goods sold" value={-data.cogs} href={link(data.accounts.cogs)} indent />
            <Row label="Gross profit" value={data.gross_profit} strong />
            <div className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-gray-400">Expenses</div>
            {data.expenses.length === 0 && <div className="py-2 pl-4 text-sm text-gray-400">No expenses recorded in this period</div>}
            {data.expenses.map((e) => <Row key={e.id} label={e.name} value={-e.amount} href={link(e.id)} indent />)}
            <Row label="Total expenses" value={-data.total_expenses} strong />
            {data.other_income.length > 0 && (
              <>
                <div className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-gray-400">Other income</div>
                {data.other_income.map((e) => <Row key={e.id} label={e.name} value={e.amount} href={link(e.id)} indent />)}
              </>
            )}
            <div className={`mt-3 flex justify-between rounded-md px-3 py-3 text-base font-bold ${data.net_profit < 0 ? "bg-red-50 text-red-700" : "bg-[#17D65D]/10 text-gray-900"}`}>
              <span>{data.net_profit < 0 ? "Net loss" : "Net profit"}</span>
              <span>{rs(data.net_profit)}</span>
            </div>
          </div>
          {(data.cost_quality.estimated > 0 || data.cost_quality.missing > 0) && (
            <p className="text-xs text-gray-500">
              In this period: {data.cost_quality.estimated} sold line(s) used today&apos;s purchase price as cost (older bills), {data.cost_quality.missing} line(s) have no cost at all.
            </p>
          )}
          <SyncNote sync={sync} />
        </>
      )}
    </AccShell>
  );
}
