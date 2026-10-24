"use client";

import { useCallback, useEffect, useState } from "react";
import AccShell, { SyncNote, inputCls, rs, type SyncInfo } from "../AccShell";

type Acc = { id: number; code: string; name: string; type: string; system_key: string | null; is_active: number; balance: number };
const TYPES = [
  ["asset", "Assets — what the business owns"],
  ["liability", "Liabilities — what the business owes"],
  ["equity", "Owner's equity"],
  ["income", "Income"],
  ["expense", "Expenses"],
] as const;

export default function AccountsPage() {
  const [rows, setRows] = useState<Acc[]>([]);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ code: "", name: "", type: "expense" });
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/accounting/accounts", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load");
      setRows(j.data || []);
      setSync(j.sync);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const add = async () => {
    setError("");
    const r = await fetch("/api/accounting/accounts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not add");
    setF({ code: "", name: "", type: f.type });
    load();
  };
  const update = async (a: Acc, body: Record<string, unknown>) => {
    const r = await fetch(`/api/accounting/accounts/${a.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return window.alert(j.error || "Could not save");
    load();
  };

  return (
    <AccShell title="Chart of Accounts" subtitle="System accounts are filled automatically from bills, payments and purchases. Add your own expense heads here.">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4">
        <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Code e.g. 6070" className={`${inputCls} w-32`} />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Account name e.g. Tea & Refreshment" className={`${inputCls} min-w-[240px] flex-1`} />
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" onClick={add} className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-black hover:bg-[#15c455]">Add account</button>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {TYPES.map(([type, label]) => {
        const list = rows.filter((a) => a.type === type);
        if (!list.length) return null;
        return (
          <div key={type} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">{label}</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {list.map((a) => (
                  <tr key={a.id} className={a.is_active ? "" : "opacity-50"}>
                    <td className="w-20 px-4 py-2 font-mono text-xs text-gray-500">{a.code}</td>
                    <td className="px-4 py-2">
                      <a href={`/accounting/ledger?account_id=${a.id}&from=`} className="hover:underline">{a.name}</a>
                      {a.system_key && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">auto</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{rs(a.balance)}</td>
                    <td className="w-44 px-4 py-2 text-right text-xs">
                      <button type="button" onClick={() => { const n = window.prompt("New name", a.name); if (n) update(a, { name: n }); }} className="text-gray-600 hover:text-gray-900">Rename</button>
                      {!a.system_key && (
                        <button type="button" onClick={() => update(a, { is_active: !a.is_active })} className="ml-3 text-gray-600 hover:text-red-600">
                          {a.is_active ? "Switch off" : "Switch on"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <SyncNote sync={sync} />
    </AccShell>
  );
}
