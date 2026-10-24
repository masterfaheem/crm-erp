"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { useAccess } from "@/app/components/useAccess";

/* ============================================================
   STOCK STATUS & REPORTS  (/inventory/reports)
   For the inventory manager: what is ready, not ready, damaged,
   returned, out at repair / with vendors; what sells fast, what is
   slow or dead, how old the stock is, and profit.
============================================================ */
type Status = { key: string; label: string; short: string; where: string; color: string };
type BoardRow = {
  id: number; sku: string; name: string; category_name: string | null; total: number; cost: number | null; value: number | null;
  ready: number; not_ready: number; returned: number; damaged: number; at_repair: number; at_vendor: number; mismatch: boolean;
} & Record<string, unknown>;
type OutRow = { product_id: number; name: string; sku: string; status: string; party: string; qty: number; first_sent: string; expected_back: string | null; days_out: number; overdue: boolean; value: number | null };

const rs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "Rs " + Math.round(Number(n)).toLocaleString("en-PK"));
const num = (n: number) => (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });
const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";
const todayPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

function downloadCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StockReportsPage() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true");
      } catch {
        /* ignore */
      }
    };
    read();
    window.addEventListener("erp:sidebar-collapse", read);
    return () => window.removeEventListener("erp:sidebar-collapse", read);
  }, []);
  return (
    <>
      <Navbar />
      <main className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <Reports />
        </div>
      </main>
    </>
  );
}

const TABS = [
  { key: "status", label: "Stock status" },
  { key: "out", label: "Out (repair / vendor)" },
  { key: "movement", label: "Fast / slow / dead" },
  { key: "aging", label: "Aged stock" },
  { key: "profit", label: "Profit" },
];

function Reports() {
  const { can, ready } = useAccess();
  const [tab, setTab] = useState("status");
  const [move, setMove] = useState<Partial<MoveInit> | null>(null);
  const [reload, setReload] = useState(0);
  const tabs = TABS.filter((t) => t.key !== "profit" || can("sales.profit"));
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Link href="/inventory" className="text-xs text-gray-500 hover:text-gray-700">
            ← Stock Levels
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Stock status &amp; reports</h1>
          <p className="mt-0.5 text-sm text-gray-500">What is ready, what is not, where it is, what sells and what is sitting.</p>
        </div>
        {ready && can("inventory.adjust") && (
          <button onClick={() => setMove({})} className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12b94f]">
            Change stock status
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-[#17D65D] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "status" && <StatusTab key={`s${reload}`} canMove={can("inventory.adjust")} onMove={(m) => setMove(m)} />}
      {tab === "out" && <OutTab key={`o${reload}`} canMove={can("inventory.adjust")} onMove={(m) => setMove(m)} />}
      {tab === "movement" && <MovementTab />}
      {tab === "aging" && <AgingTab />}
      {tab === "profit" && can("sales.profit") && <ProfitTab />}
      {move && (
        <MoveModal
          init={move}
          onClose={() => setMove(null)}
          onDone={() => {
            setMove(null);
            setReload((x) => x + 1);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- shared bits ---------------- */
function Card({ label, value, sub, color, active, onClick }: { label: string; value: string; sub?: string; color?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-3 text-left shadow-sm transition ${active ? "border-[#17D65D] ring-2 ring-[#17D65D]/20" : "border-gray-200 hover:border-gray-300"} ${onClick ? "" : "cursor-default"}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </button>
  );
}
function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) setError(j.error || "Couldn't load.");
        else {
          setError("");
          setData(j);
        }
      })
      .catch(() => alive && setError("Network problem."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, error, loading };
}
const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 ${right ? "text-right" : "text-left"}`}>{children}</th>
);
const Td = ({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>
);
function TableBox({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">{toolbar}</div>}
      <div className="max-h-[65vh] overflow-auto">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    </div>
  );
}
const Msg = ({ error, loading }: { error: string; loading: boolean }) =>
  error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : loading ? <div className="text-sm text-gray-500">Loading…</div> : null;

/* ---------------- 1. stock status ---------------- */
function StatusTab({ canMove, onMove }: { canMove: boolean; onMove: (m: Partial<MoveInit>) => void }) {
  const { data, error, loading } = useJson<{ data: BoardRow[]; kpi: Record<string, { qty: number; value: number | null; products: number }>; statuses: Status[]; show_cost: boolean }>("/api/inventory/status");
  const [only, setOnly] = useState("");
  const [q, setQ] = useState("");
  const statuses = data?.statuses || [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.data || []).filter(
      (r) => (!only || Number(r[only]) > 0) && (!s || r.name.toLowerCase().includes(s) || String(r.sku).toLowerCase().includes(s))
    );
  }, [data, only, q]);
  return (
    <div className="space-y-4">
      <Msg error={error} loading={loading && !data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statuses.map((s) => (
          <Card
            key={s.key}
            label={s.short}
            color={s.color}
            value={num(data?.kpi[s.key]?.qty || 0)}
            sub={`${data?.kpi[s.key]?.products || 0} products${data?.show_cost ? ` · ${rs(data?.kpi[s.key]?.value)}` : ""}`}
            active={only === s.key}
            onClick={() => setOnly(only === s.key ? "" : s.key)}
          />
        ))}
      </div>
      <TableBox
        toolbar={
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or code" className={`${inputCls} max-w-xs py-1.5`} />
            {only && (
              <button onClick={() => setOnly("")} className="text-xs text-gray-500 underline">
                showing only “{statuses.find((s) => s.key === only)?.short}” — show all
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500">{rows.length} products</span>
            <button
              onClick={() =>
                downloadCsv(`stock-status-${todayPKT()}.csv`, ["Code", "Product", "Category", "Total", ...statuses.map((s) => s.short), ...(data?.show_cost ? ["Cost", "Value"] : [])],
                  rows.map((r) => [r.sku, r.name, r.category_name, r.total, ...statuses.map((s) => Number(r[s.key])), ...(data?.show_cost ? [r.cost, r.value] : [])]))
              }
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Download CSV
            </button>
          </>
        }
      >
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <Th>Product</Th>
            <Th right>Total</Th>
            {statuses.map((s) => (
              <Th key={s.key} right>
                {s.short}
              </Th>
            ))}
            {data?.show_cost && <Th right>Value</Th>}
            {canMove && <Th> </Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className={r.mismatch ? "bg-red-50/60" : ""}>
              <Td>
                <div className="font-medium text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {r.sku}
                  {r.category_name ? ` · ${r.category_name}` : ""}
                  {r.mismatch && <span className="ml-1 font-medium text-red-600">· statuses add up to more than stock — fix with “Change status”</span>}
                </div>
              </Td>
              <Td right className="font-semibold">{num(r.total)}</Td>
              {statuses.map((s) => (
                <Td key={s.key} right className={Number(r[s.key]) ? (s.key === "ready" ? "font-semibold text-green-700" : "font-semibold text-gray-900") : "text-gray-300"}>
                  {Number(r[s.key]) ? num(Number(r[s.key])) : "–"}
                </Td>
              ))}
              {data?.show_cost && <Td right>{rs(r.value)}</Td>}
              {canMove && (
                <Td>
                  <button onClick={() => onMove({ product_id: r.id, product_name: r.name })} className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Change status
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableBox>
      <p className="text-xs text-gray-500">
        Ready = total stock minus everything in the other columns. Units sold at the POS come out of Ready. Exchange returns come in as “Returned” until someone checks them.
      </p>
    </div>
  );
}

/* ---------------- 2. out at repair / vendor ---------------- */
function OutTab({ canMove, onMove }: { canMove: boolean; onMove: (m: Partial<MoveInit>) => void }) {
  const { data, error, loading } = useJson<{ data: OutRow[] }>("/api/inventory/status?view=out");
  const rows = data?.data || [];
  const over = rows.filter((r) => r.overdue).length;
  return (
    <div className="space-y-4">
      <Msg error={error} loading={loading && !data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Units out" value={num(rows.reduce((s, r) => s + r.qty, 0))} />
        <Card label="At repair" value={num(rows.filter((r) => r.status === "at_repair").reduce((s, r) => s + r.qty, 0))} color="#0EA5E9" />
        <Card label="With vendors" value={num(rows.filter((r) => r.status === "at_vendor").reduce((s, r) => s + r.qty, 0))} color="#6366F1" />
        <Card label="Late (past expected date)" value={String(over)} color="#EF4444" />
      </div>
      <TableBox>
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <Th>Product</Th>
            <Th>Where</Th>
            <Th>With</Th>
            <Th right>Qty</Th>
            <Th>Sent on</Th>
            <Th right>Days out</Th>
            <Th>Expected back</Th>
            <Th right>Value</Th>
            {canMove && <Th> </Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && !loading && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                Nothing is out at repair or with a vendor.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.product_id}-${r.status}-${r.party}`} className={r.overdue ? "bg-red-50/60" : ""}>
              <Td>
                <div className="font-medium text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">{r.sku}</div>
              </Td>
              <Td>{r.status === "at_repair" ? "Repair" : "Vendor"}</Td>
              <Td className="font-medium">{r.party || "—"}</Td>
              <Td right className="font-semibold">{num(r.qty)}</Td>
              <Td>{r.first_sent}</Td>
              <Td right>{r.days_out}</Td>
              <Td className={r.overdue ? "font-semibold text-red-600" : ""}>{r.expected_back || "—"}{r.overdue ? " (late)" : ""}</Td>
              <Td right>{rs(r.value)}</Td>
              {canMove && (
                <Td>
                  <button
                    onClick={() => onMove({ product_id: r.product_id, product_name: r.name, from: r.status, to: "ready", party: r.party, qty: r.qty })}
                    className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Came back
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableBox>
    </div>
  );
}

/* ---------------- 3. fast / slow / dead ---------------- */
const CLASS: Record<string, { label: string; color: string; hint: string }> = {
  restock: { label: "Sold out — restock", color: "#DC2626", hint: "Sold in this period, none left" },
  fast: { label: "Fast", color: "#16A34A", hint: "Stock lasts 30 days or less" },
  normal: { label: "Normal", color: "#0EA5E9", hint: "Stock lasts 31–90 days" },
  slow: { label: "Slow", color: "#F59E0B", hint: "Stock lasts more than 90 days" },
  dead: { label: "Dead", color: "#6B7280", hint: "No sale in the whole period" },
  new: { label: "New (no history yet)", color: "#A855F7", hint: "In stock for less than the period, no sale yet" },
};
type MoveRow = { id: number; sku: string; name: string; category_name: string | null; stock: number; sold: number; bills: number; revenue: number; per_month: number; cover_days: number | null; last_sale: string | null; days_since_sale: number | null; in_stock_since: string; class: string; reorder: number; value: number | null };
function MovementTab() {
  const [days, setDays] = useState(90);
  const [cls, setCls] = useState("");
  const { data, error, loading } = useJson<{ data: MoveRow[]; summary: Record<string, { products: number; qty: number; value: number | null }>; show_cost: boolean; since: string }>(`/api/inventory/reports?type=movement&days=${days}`);
  const rows = (data?.data || []).filter((r) => !cls || r.class === cls);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">Period:</span>
        {[30, 60, 90, 180, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${days === d ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
            Last {d} days
          </button>
        ))}
      </div>
      <Msg error={error} loading={loading && !data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(CLASS).map(([k, c]) => (
          <Card
            key={k}
            label={c.label}
            color={c.color}
            value={String(data?.summary?.[k]?.products || 0)}
            sub={`${num(data?.summary?.[k]?.qty || 0)} units${data?.show_cost ? ` · ${rs(data?.summary?.[k]?.value)}` : ""}`}
            active={cls === k}
            onClick={() => setCls(cls === k ? "" : k)}
          />
        ))}
      </div>
      <TableBox
        toolbar={
          <>
            <span className="text-xs text-gray-500">
              Sales from {data?.since} to today. {cls ? CLASS[cls].hint + "." : "Click a card to filter."}
            </span>
            <button
              onClick={() =>
                downloadCsv(`stock-movement-${days}d-${todayPKT()}.csv`, ["Code", "Product", "Class", "Stock", `Sold (${days}d)`, "Per month", "Stock lasts (days)", "Last sale", "Suggested reorder", "Value"],
                  rows.map((r) => [r.sku, r.name, CLASS[r.class]?.label, r.stock, r.sold, r.per_month, r.cover_days, r.last_sale, r.reorder, r.value]))
              }
              className="ml-auto rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Download CSV
            </button>
          </>
        }
      >
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <Th>Product</Th>
            <Th>Class</Th>
            <Th right>Stock</Th>
            <Th right>Sold</Th>
            <Th right>Per month</Th>
            <Th right>Stock lasts</Th>
            <Th>Last sale</Th>
            <Th right>Reorder</Th>
            {data?.show_cost && <Th right>Value</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <div className="font-medium text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {r.sku}
                  {r.category_name ? ` · ${r.category_name}` : ""} · in stock since {r.in_stock_since}
                </div>
              </Td>
              <Td>
                <span className="whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: CLASS[r.class]?.color }}>
                  {CLASS[r.class]?.label}
                </span>
              </Td>
              <Td right className="font-semibold">{num(r.stock)}</Td>
              <Td right>{num(r.sold)}</Td>
              <Td right>{r.per_month ? num(r.per_month) : "–"}</Td>
              <Td right>{r.cover_days === null ? "–" : `${r.cover_days} days`}</Td>
              <Td>{r.last_sale ? `${r.last_sale} (${r.days_since_sale}d ago)` : "never"}</Td>
              <Td right className={r.reorder ? "font-semibold text-red-600" : "text-gray-300"}>{r.reorder || "–"}</Td>
              {data?.show_cost && <Td right>{rs(r.value)}</Td>}
            </tr>
          ))}
        </tbody>
      </TableBox>
      <p className="text-xs text-gray-500">
        “Stock lasts” = stock ÷ average daily sale in the period. Reorder = units to keep about 30 days of stock. Stock loaded with the opening import counts from the
        import date, so items show as “New” until the period has passed.
      </p>
    </div>
  );
}

/* ---------------- 4. aged stock ---------------- */
type AgeRow = { id: number; sku: string; name: string; category_name: string | null; stock: number; oldest_days: number; value: number | null } & Record<string, number | string | null>;
function AgingTab() {
  const { data, error, loading } = useJson<{ data: AgeRow[]; buckets: { key: string; label: string }[]; totals: Record<string, { qty: number; value: number | null }>; show_cost: boolean }>("/api/inventory/reports?type=aging");
  const bk = data?.buckets || [];
  return (
    <div className="space-y-4">
      <Msg error={error} loading={loading && !data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {bk.map((b, i) => (
          <Card key={b.key} label={b.label} color={["#16A34A", "#84CC16", "#F59E0B", "#F97316", "#EF4444", "#7F1D1D"][i]} value={`${num(data?.totals[b.key]?.qty || 0)} units`} sub={data?.show_cost ? rs(data?.totals[b.key]?.value) : undefined} />
        ))}
      </div>
      <TableBox
        toolbar={
          <>
            <span className="text-xs text-gray-500">Age of the units in stock now (oldest sold first). Oldest at the top.</span>
            <button
              onClick={() => downloadCsv(`aged-stock-${todayPKT()}.csv`, ["Code", "Product", "Stock", ...bk.map((b) => b.label), "Oldest (days)", "Value"], (data?.data || []).map((r) => [r.sku, r.name, r.stock, ...bk.map((b) => r[b.key]), r.oldest_days, r.value]))}
              className="ml-auto rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Download CSV
            </button>
          </>
        }
      >
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <Th>Product</Th>
            <Th right>Stock</Th>
            {bk.map((b) => (
              <Th key={b.key} right>
                {b.label}
              </Th>
            ))}
            <Th right>Oldest</Th>
            {data?.show_cost && <Th right>Value</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {(data?.data || []).map((r) => (
            <tr key={r.id}>
              <Td>
                <div className="font-medium text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">{r.sku}{r.category_name ? ` · ${r.category_name}` : ""}</div>
              </Td>
              <Td right className="font-semibold">{num(r.stock)}</Td>
              {bk.map((b) => (
                <Td key={b.key} right className={Number(r[b.key]) ? "" : "text-gray-300"}>
                  {Number(r[b.key]) ? num(Number(r[b.key])) : "–"}
                </Td>
              ))}
              <Td right className={r.oldest_days > 90 ? "font-semibold text-red-600" : ""}>{r.oldest_days} days</Td>
              {data?.show_cost && <Td right>{rs(r.value)}</Td>}
            </tr>
          ))}
        </tbody>
      </TableBox>
    </div>
  );
}

/* ---------------- 5. profit ---------------- */
type ProfitRow = { key: string; label: string; sub: string; qty: number; bills: number; revenue: number; cost: number; profit: number; margin: number | null; missing_cost: number };
function ProfitTab() {
  const t = todayPKT();
  const [from, setFrom] = useState(`${t.slice(0, 8)}01`);
  const [to, setTo] = useState(t);
  const [group, setGroup] = useState("product");
  const { data, error, loading } = useJson<{ data: ProfitRow[]; totals: { revenue: number; cost: number; profit: number; margin: number | null; bills: number }; missing_cost_lines: number }>(
    `/api/inventory/reports?type=profit&group=${group}&from=${from}&to=${to}`
  );
  const tot = data?.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1 py-1.5`} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1 py-1.5`} />
        </label>
        <div className="flex gap-1">
          {[
            ["product", "By product"],
            ["category", "By category"],
            ["invoice", "By bill"],
            ["day", "By day"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setGroup(k)} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${group === k ? "border-[#17D65D] bg-[#17D65D]/10 text-[#0fa846]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Msg error={error} loading={loading && !data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Bills" value={String(tot?.bills || 0)} />
        <Card label="Sales (after discount)" value={rs(tot?.revenue || 0)} />
        <Card label="Cost of goods" value={rs(tot?.cost || 0)} />
        <Card label="Gross profit" value={rs(tot?.profit || 0)} />
        <Card label="Margin" value={tot?.margin === null || tot?.margin === undefined ? "–" : `${tot.margin}%`} />
      </div>
      {!!data?.missing_cost_lines && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {data.missing_cost_lines} sold line(s) have no cost — their profit shows higher than real. Add the product cost.
        </div>
      )}
      <TableBox
        toolbar={
          <button
            onClick={() => downloadCsv(`profit-${group}-${from}-to-${to}.csv`, ["Name", "Detail", "Qty", "Bills", "Sales", "Cost", "Profit", "Margin %"], (data?.data || []).map((r) => [r.label, r.sub, r.qty, r.bills, r.revenue, r.cost, r.profit, r.margin]))}
            className="ml-auto rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Download CSV
          </button>
        }
      >
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <Th>{group === "invoice" ? "Bill" : group === "day" ? "Day" : group === "category" ? "Category" : "Product"}</Th>
            <Th right>Qty</Th>
            <Th right>Bills</Th>
            <Th right>Sales</Th>
            <Th right>Cost</Th>
            <Th right>Profit</Th>
            <Th right>Margin</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {(data?.data || []).length === 0 && !loading && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                No sales in this period.
              </td>
            </tr>
          )}
          {(data?.data || []).map((r) => (
            <tr key={r.key}>
              <Td>
                <div className="font-medium text-gray-900">{r.label}</div>
                {r.sub && <div className="text-xs text-gray-500">{r.sub}</div>}
                {r.missing_cost > 0 && <div className="text-xs text-amber-700">cost missing</div>}
              </Td>
              <Td right>{num(r.qty)}</Td>
              <Td right>{r.bills}</Td>
              <Td right>{rs(r.revenue)}</Td>
              <Td right>{rs(r.cost)}</Td>
              <Td right className={r.profit < 0 ? "font-semibold text-red-600" : "font-semibold text-green-700"}>{rs(r.profit)}</Td>
              <Td right>{r.margin === null ? "–" : `${r.margin}%`}</Td>
            </tr>
          ))}
        </tbody>
      </TableBox>
      <p className="text-xs text-gray-500">Sales are after item and bill discounts, without tax and delivery charges. Cancelled bills are left out; exchange returns reduce sales and cost.</p>
    </div>
  );
}

/* ---------------- change status modal ---------------- */
type MoveInit = { product_id: number; product_name: string; from: string; to: string; party: string; qty: number };
type Buckets = { total: number; ready: number; not_ready: number; returned: number; damaged: number; at_repair: number; at_vendor: number };
const STATUS_OPTIONS = [
  { key: "ready", label: "Ready to sell" },
  { key: "not_ready", label: "Not ready (checking / cleaning / setup)" },
  { key: "returned", label: "Returned / exchange — to check" },
  { key: "damaged", label: "Damaged / faulty" },
  { key: "at_repair", label: "Out at repair" },
  { key: "at_vendor", label: "Out with vendor / supplier warranty" },
];
function MoveModal({ init, onClose, onDone }: { init: Partial<MoveInit>; onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState<{ id: number; name: string } | null>(init.product_id ? { id: init.product_id, name: init.product_name || "" } : null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [b, setB] = useState<Buckets | null>(null);
  const [outs, setOuts] = useState<OutRow[]>([]);
  const [from, setFrom] = useState(init.from || "ready");
  const [to, setTo] = useState(init.to || (init.from ? "ready" : "not_ready"));
  const [qty, setQty] = useState(String(init.qty || 1));
  const [party, setParty] = useState(init.party || "");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (product || search.trim().length < 2) return;
    const t = setTimeout(async () => {
      const j = await fetch(`/api/inventory/status?search=${encodeURIComponent(search.trim())}`).then((r) => r.json()).catch(() => ({}));
      setFound((j.data || []).slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [search, product]);

  const loadBuckets = useCallback(async (pid: number) => {
    const [st, out] = await Promise.all([
      fetch(`/api/inventory/status`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/inventory/status?view=out`).then((r) => r.json()).catch(() => ({})),
    ]);
    const row = (st.data || []).find((x: { id: number }) => x.id === pid);
    setB(row || null);
    setOuts(((out.data || []) as OutRow[]).filter((o) => o.product_id === pid));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (product) loadBuckets(product.id);
  }, [product, loadBuckets]);

  const fromOut = from === "at_repair" || from === "at_vendor";
  const toOut = to === "at_repair" || to === "at_vendor";
  const partiesForFrom = outs.filter((o) => o.status === from);
  const have = b ? Number((b as Record<string, number>)[from]) || 0 : 0;

  const save = async () => {
    if (!product) return setError("Choose a product.");
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, from, to, qty: Number(qty), party, expected_back: expected || null, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setError(j.error || "Couldn't save.");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Change stock status</h2>
          <p className="text-xs text-gray-500">Moves units between statuses. Total stock stays the same — except a write-off, which removes them.</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Product</label>
            {product ? (
              <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium">{product.name}</span>
                {!init.product_id && (
                  <button onClick={() => { setProduct(null); setB(null); }} className="text-xs text-gray-500 underline">
                    change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type product name or code" className={inputCls} />
                {found.length > 0 && search.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                    {found.map((f) => (
                      <button key={f.id} onClick={() => { setProduct({ id: f.id, name: f.name }); setFound([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                        {f.name} <span className="text-xs text-gray-500">{f.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {b && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-gray-100 px-2 py-0.5">Total {num(b.total)}</span>
              {STATUS_OPTIONS.map((s) => (
                <span key={s.key} className="rounded bg-gray-100 px-2 py-0.5">
                  {s.label.split(" (")[0].split(" —")[0]}: <b>{num((b as Record<string, number>)[s.key] || 0)}</b>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-700">
              From
              <select value={from} onChange={(e) => {
                const f = e.target.value;
                setFrom(f);
                setParty("");
                if (to === f || (f === "ready" && to === "written_off")) setTo(f === "ready" ? "not_ready" : "ready");
              }} className={`${inputCls} mt-1`}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {b && <span className="mt-0.5 block text-[11px] font-normal text-gray-500">Available: {num(have)}</span>}
            </label>
            <label className="text-xs font-medium text-gray-700">
              To
              <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`}>
                {STATUS_OPTIONS.filter((s) => s.key !== from).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
                {from !== "ready" && <option value="written_off">Write off (remove from stock — loss)</option>}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-700">
              Quantity
              <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            {toOut && (
              <label className="text-xs font-medium text-gray-700">
                Expected back
                <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={`${inputCls} mt-1`} />
              </label>
            )}
          </div>
          {(toOut || fromOut) && (
            <label className="block text-xs font-medium text-gray-700">
              {fromOut ? "Coming back from" : to === "at_repair" ? "Repair shop / technician" : "Vendor / supplier"}
              {fromOut && partiesForFrom.length > 0 ? (
                <select value={party} onChange={(e) => setParty(e.target.value)} className={`${inputCls} mt-1`}>
                  <option value="">Choose…</option>
                  {partiesForFrom.map((o) => (
                    <option key={o.party} value={o.party}>
                      {o.party} ({num(o.qty)} with them)
                    </option>
                  ))}
                </select>
              ) : (
                <input value={party} onChange={(e) => setParty(e.target.value)} placeholder="Name" className={`${inputCls} mt-1`} />
              )}
            </label>
          )}
          <label className="block text-xs font-medium text-gray-700">
            Note {to === "written_off" ? "(reason — required)" : "(optional)"}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. screen broken, keyboard issue, S/N…" className={`${inputCls} mt-1`} />
          </label>
          {to === "written_off" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Write-off removes these units from stock for good. Their cost goes to Stock adjustments (loss) in the books.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !product} className="rounded-md bg-[#17D65D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12b94f] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
