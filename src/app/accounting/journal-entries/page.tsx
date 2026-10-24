"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/app/components/useAccess";
import AccShell, { RangePicker, inputCls, rs, todayPKT } from "../AccShell";

type Acc = { id: number; code: string; name: string; type: string; system_key: string | null; is_active: number };
type JLine = { debit: number; credit: number; description: string | null; code: string; account_name: string; party_name: string | null };
type Entry = { id: number; entry_number: string | null; entry_date: string; source_type: string; source_id: number | null; source_ref: string | null; memo: string | null; is_auto: number; reversed_by: number | null; created_by_name: string | null; lines: JLine[] };

const SOURCE_LABEL: Record<string, string> = {
  invoice: "Sale bill", invoice_cancel: "Bill cancelled", customer_payment: "Payment in", refund: "Refund",
  purchase_bill: "Purchase", supplier_payment: "Supplier payment", stock_adjustment: "Stock adj.",
  opening_stock: "Opening", customer_opening: "Opening", supplier_opening: "Opening",
  manual: "Manual", expense: "Expense", reversal: "Reversal",
};

export default function JournalPage() {
  const { can } = useAccess();
  const manage = can("accounting.manage");
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [rows, setRows] = useState<Entry[]>([]);
  const [from, setFrom] = useState(`${todayPKT().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayPKT());
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"" | "expense" | "manual">("");

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ from, to, page: String(page) });
      if (source) p.set("source", source);
      if (search.trim()) p.set("search", search.trim());
      const r = await fetch(`/api/accounting/journal?${p}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load");
      setRows(j.data || []);
      setPages(j.pagination?.total_pages || 1);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [from, to, page, source, search]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    fetch("/api/accounting/accounts", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setAccounts((j.data || []).filter((a: Acc) => a.is_active)))
      .catch(() => {});
  }, []);

  const reverse = async (e: Entry) => {
    if (!window.confirm(`Reverse ${e.entry_number}? An opposite entry will be added (nothing is deleted).`)) return;
    const r = await fetch(`/api/accounting/journal/${e.id}/reverse`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return window.alert(j.error || "Could not reverse");
    load();
  };

  return (
    <AccShell title="Journal & Expenses" subtitle="Bills, payments and purchases post here automatically. Add shop expenses and other entries yourself."
      right={manage ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode(mode === "expense" ? "" : "expense")} className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]">+ Expense</button>
          <button type="button" onClick={() => setMode(mode === "manual" ? "" : "manual")} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">+ Journal entry</button>
        </div>
      ) : null}>
      {mode === "expense" && <ExpenseForm accounts={accounts} onDone={() => { setMode(""); load(); }} />}
      {mode === "manual" && <ManualForm accounts={accounts} onDone={() => { setMode(""); load(); }} />}

      <div className="flex flex-wrap items-center gap-2">
        <RangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className={`${inputCls} py-1.5 text-xs`}>
          <option value="">All entries</option>
          <option value="manual">Manual & expenses</option>
          <option value="invoice">Sale bills</option>
          <option value="invoice_cancel">Cancelled bills</option>
          <option value="customer_payment">Payments in</option>
          <option value="refund">Refunds</option>
          <option value="purchase_bill">Purchases</option>
          <option value="supplier_payment">Supplier payments</option>
          <option value="stock_adjustment">Stock adjustments</option>
        </select>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search ref / memo" className={`${inputCls} py-1.5 text-xs`} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">No entries in this period</div>}
        {rows.map((e) => (
          <div key={e.id} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-gray-500">{e.entry_date}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">{SOURCE_LABEL[e.source_type] || e.source_type}</span>
                {["invoice", "invoice_cancel"].includes(e.source_type) && e.source_id ? (
                  <a href={`/print/invoice/${e.source_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-700 hover:underline">{e.source_ref}</a>
                ) : (
                  <span className="font-mono text-xs text-gray-700">{e.entry_number || e.source_ref}</span>
                )}
                <span className="text-gray-700">{e.memo}</span>
                {e.reversed_by && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">reversed</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {!e.is_auto && e.created_by_name && <span>by {e.created_by_name}</span>}
                {manage && !e.is_auto && !e.reversed_by && e.source_type !== "reversal" && (
                  <button type="button" onClick={() => reverse(e)} className="text-gray-600 hover:text-red-600">Reverse</button>
                )}
              </div>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className={`px-4 py-1 ${l.credit ? "pl-10" : ""}`}>{l.code} · {l.account_name}{l.party_name ? ` — ${l.party_name}` : ""}{l.description ? <span className="text-gray-400"> · {l.description}</span> : null}</td>
                    <td className="w-32 px-4 py-1 text-right">{l.debit ? rs(l.debit) : ""}</td>
                    <td className="w-32 px-4 py-1 text-right">{l.credit ? rs(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span>{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}
    </AccShell>
  );
}

function ExpenseForm({ accounts, onDone }: { accounts: Acc[]; onDone: () => void }) {
  const exp = accounts.filter((a) => a.type === "expense" && a.system_key !== "cogs");
  const money = accounts.filter((a) => ["cash", "bank", "wallet"].includes(String(a.system_key)) || (a.type === "asset" && !a.system_key));
  const [f, setF] = useState({ account_id: "", paid_from: "", amount: "", date: todayPKT(), memo: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const r = await fetch("/api/accounting/journal", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "expense", ...f, account_id: Number(f.account_id), paid_from: Number(f.paid_from) || "cash", amount: Number(f.amount) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };
  return (
    <div className="rounded-lg border border-[#17D65D]/40 bg-white p-4">
      <div className="mb-2 text-sm font-semibold text-gray-900">Record a shop expense</div>
      <div className="grid gap-2 sm:grid-cols-5">
        <select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })} className={inputCls}>
          <option value="">Expense type…</option>
          {exp.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={f.paid_from} onChange={(e) => setF({ ...f, paid_from: e.target.value })} className={inputCls}>
          <option value="">Paid from: Cash</option>
          {money.map((a) => <option key={a.id} value={a.id}>Paid from: {a.name}</option>)}
        </select>
        <input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" className={inputCls} />
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
        <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="What for? e.g. October rent" className={inputCls} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={saving} onClick={save} className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : "Save expense"}</button>
      </div>
    </div>
  );
}

function ManualForm({ accounts, onDone }: { accounts: Acc[]; onDone: () => void }) {
  type L = { account_id: string; debit: string; credit: string; description: string };
  const blank = (): L => ({ account_id: "", debit: "", credit: "", description: "" });
  const [date, setDate] = useState(todayPKT());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<L[]>([blank(), blank()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dr = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  const ok = dr > 0 && Math.abs(dr - cr) < 0.005;
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const r = await fetch("/api/accounting/journal", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "manual", date, memo, lines: lines.map((l) => ({ account_id: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };
  return (
    <div className="rounded-lg border border-gray-300 bg-white p-4">
      <div className="mb-1 text-sm font-semibold text-gray-900">Journal entry</div>
      <p className="mb-3 text-xs text-gray-500">For owner capital, drawings, loans, opening balances or corrections. Debit total must equal credit total.</p>
      <div className="mb-2 grid gap-2 sm:grid-cols-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Description e.g. Owner added capital" className={`${inputCls} sm:col-span-3`} />
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const set = (p: Partial<L>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className="grid gap-2 sm:grid-cols-6">
              <select value={l.account_id} onChange={(e) => set({ account_id: e.target.value })} className={`${inputCls} sm:col-span-2`}>
                <option value="">Account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
              <input type="number" min={0} value={l.debit} onChange={(e) => set({ debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="Debit" className={inputCls} />
              <input type="number" min={0} value={l.credit} onChange={(e) => set({ credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="Credit" className={inputCls} />
              <input value={l.description} onChange={(e) => set({ description: e.target.value })} placeholder="Note" className={inputCls} />
              <button type="button" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-md border border-gray-300 text-xs text-gray-600 disabled:opacity-30">Remove</button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setLines([...lines, blank()])} className="text-xs font-medium text-gray-700 hover:underline">+ Add line</button>
        <span className={`text-xs font-medium ${ok ? "text-green-700" : "text-red-600"}`}>Debit {rs(dr)} · Credit {rs(cr)} {ok ? "✓" : "— must be equal"}</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={saving || !ok} onClick={save} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save entry"}</button>
      </div>
    </div>
  );
}
