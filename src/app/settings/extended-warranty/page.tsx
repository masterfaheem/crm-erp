"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import {
  DEFAULT_WARRANTY_RULES,
  WARRANTY_PLANS,
  warrantyPrice,
  type WarrantyRuleType,
  type WarrantyRules,
} from "@/lib/extWarranty";

/* ============================================================
   /settings/extended-warranty — price of each extended warranty plan
   % of the bill, or a fixed amount. Used by POS and won-lead orders.
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";
const rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

export default function ExtendedWarrantySettingsPage() {
  const [rules, setRules] = useState<WarrantyRules>(DEFAULT_WARRANTY_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [example, setExample] = useState(80000);

  useEffect(() => {
    fetch("/api/settings/extended-warranty", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setRules(j.data))
      .catch(() => setMsg({ ok: false, text: "Could not load the current prices" }))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings/extended-warranty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(rules),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Save failed");
      setRules(j.data);
      setMsg({ ok: true, text: "Saved — POS and lead orders use the new prices now." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">🛡️ Extended Warranty</h1>
            <p className="mt-1 text-sm text-gray-500">
              Set the price of each plan. It is added to the bill as its own line when the customer takes it — in POS
              and when sales converts a won lead to an order.
            </p>
          </div>

          {loading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-white" />
          ) : (
            <div className="space-y-4">
              {WARRANTY_PLANS.map((p) => {
                const r = rules[p.key];
                const set = (patch: Partial<typeof r>) => setRules({ ...rules, [p.key]: { ...r, ...patch } });
                return (
                  <div key={p.key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-gray-900">{p.label} extended warranty</h2>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                        Offer this plan
                      </label>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Price type</label>
                        <select
                          value={r.type}
                          onChange={(e) => set({ type: e.target.value as WarrantyRuleType })}
                          className={inputCls}
                        >
                          <option value="percent">% of bill</option>
                          <option value="fixed">Fixed amount (Rs)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          {r.type === "percent" ? "Percent of bill (%)" : "Amount (Rs)"}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={r.type === "percent" ? 100 : undefined}
                          step={r.type === "percent" ? "0.5" : "100"}
                          value={r.value}
                          onChange={(e) => set({ value: Number(e.target.value) || 0 })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      Example: on a {rs(example)} bill this plan costs{" "}
                      <b className="text-gray-900">{rs(warrantyPrice({ ...r, enabled: true }, example))}</b>
                    </p>
                  </div>
                );
              })}

              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  Example bill (Rs)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={example}
                    onChange={(e) => setExample(Number(e.target.value) || 0)}
                    className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-[#17D65D] px-5 py-2 text-sm font-bold text-black hover:bg-[#15c455] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save prices"}
                </button>
              </div>
              {msg && (
                <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {msg.text}
                </p>
              )}
              <p className="text-xs text-gray-500">
                % is worked out on the products total of the bill (after item discounts, before shipping). The bill
                shows the plan and its &quot;valid till&quot; date in the warranty section.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
