"use client";

import { useEffect, useState } from "react";

type Move = {
  id: number;
  qty: number;
  move_type: string;
  ref_type: string | null;
  ref_id: number | null;
  ref_number: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
};

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  purchase: { label: "Purchase", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  sale: { label: "Sale", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  adjustment: { label: "Adjustment", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const REASONS = ["Count correction", "Damaged", "Returned by customer", "Used for repair / parts", "Opening stock fix"];

function fmtQty(n: number) {
  return (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });
}
function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StockModal({
  productId,
  productName,
  initialTab,
  onClose,
  onChanged,
}: {
  productId: number;
  productName: string;
  initialTab: "adjust" | "history";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [current, setCurrent] = useState<number | null>(null);
  const [opening, setOpening] = useState(0);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/inventory/moves?product_id=${productId}`, { credentials: "include" })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Unable to load");
        if (!alive) return;
        setCurrent(Number(j.product?.current_stock) || 0);
        setOpening(Number(j.product?.opening_stock) || 0);
        setMoves(j.data || []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Unable to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [productId, version]);

  const q = Number(qty);
  const after =
    current === null || !Number.isFinite(q) || qty === ""
      ? null
      : mode === "set"
      ? q
      : mode === "remove"
      ? current - q
      : current + q;

  async function save() {
    setError(null);
    if (qty === "" || !Number.isFinite(q) || q < 0) return setError("Enter a valid quantity.");
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/moves", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          mode,
          qty: q,
          note: [reason, note.trim()].filter(Boolean).join(" — "),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setQty("");
      setNote("");
      setVersion((v) => v + 1);
      onChanged();
      setTab("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900">{productName}</div>
            <div className="mt-0.5 text-xs text-gray-500">
              On hand: <span className="font-semibold text-gray-900">{current === null ? "…" : fmtQty(current)}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-5 pt-2">
          {(["adjust", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t ? "border-[#17D65D] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t === "adjust" ? "Adjust stock" : "History"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          {tab === "adjust" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["add", "+ Add"],
                  ["remove", "− Remove"],
                  ["set", "= Set count"],
                ] as const).map(([m, l]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      mode === m ? "border-[#17D65D] bg-[#17D65D]/10 text-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {mode === "set" ? "Actual quantity counted" : "Quantity"}
                </label>
                <input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#17D65D] focus:outline-none focus:ring-2 focus:ring-[#17D65D]/20"
                  placeholder="0"
                />
                {after !== null && current !== null && (
                  <div className="mt-1.5 text-xs text-gray-500">
                    {fmtQty(current)} → <span className={`font-semibold ${after < 0 ? "text-red-600" : "text-gray-900"}`}>{fmtQty(after)}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#17D65D] focus:outline-none"
                >
                  {REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Note (optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#17D65D] focus:outline-none"
                  placeholder="e.g. screen cracked, serial no…"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                Purchases add stock and POS bills remove it automatically — use this only for corrections.
              </p>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="space-y-2">
              {moves.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No stock movements yet.</div>}
              {moves.map((m) => {
                const t = TYPE_LABEL[m.move_type] || TYPE_LABEL.adjustment;
                return (
                  <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${t.cls}`}>{t.label}</span>
                        {m.ref_number && <span className="font-mono text-xs text-gray-600">{m.ref_number}</span>}
                      </div>
                      {m.note && <div className="mt-1 truncate text-xs text-gray-600">{m.note}</div>}
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {fmtDate(m.created_at)}
                        {m.created_by_name ? ` · ${m.created_by_name}` : ""}
                      </div>
                    </div>
                    <div className={`shrink-0 text-sm font-semibold ${m.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.qty > 0 ? "+" : ""}
                      {fmtQty(m.qty)}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span>Opening stock</span>
                <span className="font-semibold text-gray-700">{fmtQty(opening)}</span>
              </div>
            </div>
          )}
        </div>

        {tab === "adjust" && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#17D65D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13b94f] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save adjustment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
