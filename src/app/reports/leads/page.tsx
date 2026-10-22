"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/app/components/Navbar";
import {
  BUDGET_LABELS,
  BUDGET_RANGES,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITY_LABELS,
  LOST_REASON_LABELS,
  PROFESSION_LABELS,
  USE_CASE_LABELS,
  leadSourceLabel,
} from "@/lib/leadOptions";
import {
  BarList,
  type BarRow,
  Card,
  Columns,
  CsvButton,
  DateRangeBar,
  Tile,
  downloadCsv,
  pct,
  presetRange,
  rs,
} from "../ReportUi";

/* ============================================================
   LEAD REPORTS — marketing & sales analytics from every lead field
============================================================ */
type G = { k: string | number | null; total: number; won: number; lost: number; open: number; revenue: number; orders: number };
interface Report {
  totals: Record<string, number>;
  speed: { hours_to_order: number };
  follow_ups: Record<string, number>;
  by_status: G[];
  by_source: G[];
  by_city: G[];
  by_profession: G[];
  by_budget: G[];
  by_priority: G[];
  by_lost_reason: { k: string | null; total: number }[];
  by_assigned: G[];
  by_use_case: { k: string; total: number; won: number; revenue: number }[];
  by_day: { k: string; total: number; won: number }[];
  by_weekday: { k: number; total: number; won: number }[];
  by_hour: { k: number; total: number }[];
}

const WEEKDAYS = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_ORDER = ["new", "mature", "proposal", "negotiation", "follow_up", "won", "lost"];

const otherLabel = (k: unknown, map: Record<string, string>, none = "Not set") => {
  if (k === null || k === undefined || k === "") return none;
  const s = String(k);
  if (s.startsWith("other:") || s.startsWith("custom:")) return s.split(":").slice(1).join(":") || "Other";
  return map[s] || s;
};

function toRows(list: G[], label: (k: G["k"]) => string): BarRow[] {
  return list.map((g) => ({ label: label(g.k), value: g.total, won: g.won, lost: g.lost, revenue: g.revenue }));
}

function hoursText(h: number) {
  if (!h) return "—";
  if (h < 48) return `${Math.round(h)} hrs`;
  return `${Math.round(h / 24)} days`;
}

export default function LeadReportsPage() {
  const [range, setRange] = useState(() => presetRange("30d"));
  const [source, setSource] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set("from", range.from);
      if (range.to) qs.set("to", range.to);
      if (source) qs.set("source", source);
      const r = await fetch(`/api/reports/leads?${qs}`, { credentials: "include" });
      if (r.status === 401) throw new Error("Session expired. Please log in again.");
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      setData((await r.json()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [range, source]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const t = useMemo(() => data?.totals || {}, [data]);
  const closed = (t.won || 0) + (t.lost || 0);

  /* ---------- automatic insights ---------- */
  const insights = useMemo(() => {
    if (!data || !t.total) return [];
    const out: string[] = [];
    const src = data.by_source.filter((g) => g.k);
    if (src[0]) out.push(`Most leads come from **${leadSourceLabel(String(src[0].k))}** (${pct(src[0].total, t.total)}% of all leads).`);
    const conv = src
      .filter((g) => g.won + g.lost >= 3)
      .map((g) => ({ g, c: pct(g.won, g.won + g.lost) }))
      .sort((a, b) => b.c - a.c);
    if (conv[0]) out.push(`Best converting source: **${leadSourceLabel(String(conv[0].g.k))}** — ${conv[0].c}% of its closed leads are won.`);
    if (conv.length > 1) {
      const worst = conv[conv.length - 1];
      if (worst.c < conv[0].c) out.push(`Weakest converting source: **${leadSourceLabel(String(worst.g.k))}** (${worst.c}%) — review the ad / content quality.`);
    }
    const bud = data.by_budget.filter((g) => g.k).sort((a, b) => b.total - a.total)[0];
    if (bud) out.push(`Most common budget: **${BUDGET_LABELS[String(bud.k)] || bud.k}** — stock and promote laptops in this range.`);
    const prof = data.by_profession.filter((g) => g.k)[0];
    if (prof) out.push(`Biggest audience: **${otherLabel(prof.k, PROFESSION_LABELS)}** — target this group in ads and content.`);
    const uc = data.by_use_case[0];
    if (uc) out.push(`Top use case: **${otherLabel(uc.k, USE_CASE_LABELS)}** (${uc.total} leads).`);
    const lr = data.by_lost_reason.filter((g) => g.k)[0];
    if (lr && t.lost) out.push(`Main reason for lost leads: **${otherLabel(lr.k, LOST_REASON_LABELS)}** (${pct(lr.total, t.lost)}% of lost).`);
    const wd = [...data.by_weekday].sort((a, b) => b.total - a.total)[0];
    if (wd) out.push(`Busiest day for new leads: **${WEEKDAYS[wd.k]}** — keep the full team online and run ads then.`);
    const hr = [...data.by_hour].sort((a, b) => b.total - a.total)[0];
    if (hr) {
      const h = Number(hr.k);
      out.push(`Peak hour: **${h % 12 || 12}${h < 12 ? "am" : "pm"}–${(h + 1) % 12 || 12}${h + 1 < 12 || h + 1 === 24 ? "am" : "pm"}**.`);
    }
    if (data.follow_ups.overdue) out.push(`⚠️ **${data.follow_ups.overdue} follow-ups are overdue** — these leads are going cold.`);
    const missing = Math.max(t.no_source || 0, t.no_budget || 0, t.no_profession || 0);
    if (missing && pct(missing, t.total) >= 20) out.push(`Data gap: ${pct(missing, t.total)}% of leads are missing source / budget / profession — fill these fields for better reports.`);
    return out;
  }, [data, t]);

  const funnel = useMemo(() => {
    if (!data) return [];
    const m = new Map(data.by_status.map((g) => [String(g.k), g.total]));
    return STATUS_ORDER.map((s) => ({ label: LEAD_STATUS_LABELS[s], value: m.get(s) || 0 }));
  }, [data]);

  const budgetRows = useMemo(() => {
    if (!data) return [];
    const m = new Map(data.by_budget.map((g) => [String(g.k), g]));
    const rows: BarRow[] = BUDGET_RANGES.filter((b) => m.has(b.value)).map((b) => {
      const g = m.get(b.value)!;
      return { label: b.label, value: g.total, won: g.won, lost: g.lost, revenue: g.revenue };
    });
    const none = m.get("null");
    if (none) rows.push({ label: "Not set", value: none.total, won: none.won, lost: none.lost, revenue: none.revenue });
    return rows;
  }, [data]);

  const csvGroup = (name: string, list: G[], label: (k: G["k"]) => string) =>
    downloadCsv(
      `leads-${name}-${range.from || "all"}-${range.to || ""}`,
      ["Name", "Leads", "Won", "Lost", "Open", "Conversion %", "Orders", "Revenue (Rs)"],
      list.map((g) => [label(g.k), g.total, g.won, g.lost, g.open, pct(g.won, g.won + g.lost), g.orders, Math.round(g.revenue)])
    );

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">📊 Lead Reports</h1>
            <p className="mt-1 text-sm text-gray-500">Where leads come from, who they are, what they want — and what converts.</p>
          </div>

          <DateRangeBar from={range.from} to={range.to} onChange={setRange}>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
              <option value="">All sources</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </DateRangeBar>

          {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {loading && !data && <div className="h-64 animate-pulse rounded-2xl bg-white" />}

          {data && (
            <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <Tile label="Total leads" value={String(t.total || 0)} />
                <Tile label="Won" value={String(t.won || 0)} tone="text-green-600" sub={`${pct(t.won || 0, t.total || 0)}% of all`} />
                <Tile label="Lost" value={String(t.lost || 0)} tone="text-red-600" sub={`${pct(t.lost || 0, t.total || 0)}% of all`} />
                <Tile label="Open" value={String(t.open || 0)} tone="text-blue-600" sub="still in pipeline" />
                <Tile label="Conversion" value={`${pct(t.won || 0, closed)}%`} sub="won ÷ (won + lost)" />
                <Tile label="Revenue (orders)" value={rs(t.revenue || 0)} sub={`${t.orders || 0} orders`} />
                <Tile label="Avg order" value={rs(t.avg_order || 0)} />
                <Tile label="Lead → order" value={hoursText(data.speed.hours_to_order)} sub="average time" />
              </div>

              {/* insights */}
              {insights.length > 0 && (
                <Card title="💡 Insights" hint="Generated automatically from your lead data">
                  <ul className="grid grid-cols-1 gap-2 text-sm text-gray-800 md:grid-cols-2">
                    {insights.map((s, i) => (
                      <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                        {s.split("**").map((part, j) => (j % 2 ? <b key={j}>{part}</b> : <span key={j}>{part}</span>))}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Card id="source" title="📣 Lead Sources" hint="Volume, conversion and revenue by source — where to spend on marketing" right={<CsvButton onClick={() => csvGroup("source", data.by_source, (k) => (k ? leadSourceLabel(String(k)) : "Not set"))} />}>
                  <BarList rows={toRows(data.by_source, (k) => (k ? leadSourceLabel(String(k)) : "Not set"))} showConversion showRevenue />
                </Card>

                <Card title="🔻 Sales Funnel" hint="How many leads are at each stage right now">
                  <BarList rows={funnel} />
                </Card>

                <Card title="💰 Budget Range" hint="What customers want to spend" right={<CsvButton onClick={() => csvGroup("budget", data.by_budget, (k) => (k ? BUDGET_LABELS[String(k)] || String(k) : "Not set"))} />}>
                  <BarList rows={budgetRows} showConversion showRevenue />
                </Card>

                <Card id="profession" title="🎓 Profession" hint="Who your buyers are" right={<CsvButton onClick={() => csvGroup("profession", data.by_profession, (k) => otherLabel(k, PROFESSION_LABELS))} />}>
                  <BarList rows={toRows(data.by_profession, (k) => otherLabel(k, PROFESSION_LABELS))} showConversion showRevenue />
                </Card>

                <Card title="💻 Workload / Use Case" hint="What they will use the laptop for (a lead can have several)">
                  <BarList
                    rows={data.by_use_case.map((u) => ({ label: otherLabel(u.k, USE_CASE_LABELS), value: u.total, won: u.won, revenue: u.revenue }))}
                    showRevenue
                  />
                </Card>

                <Card id="city" title="📍 Cities" hint="Top 25 cities" right={<CsvButton onClick={() => csvGroup("city", data.by_city, (k) => (k ? String(k) : "Not set"))} />}>
                  <BarList rows={toRows(data.by_city, (k) => (k ? String(k) : "Not set"))} showConversion showRevenue />
                </Card>

                <Card title="❌ Lost Reasons" hint="Why deals are lost — fix the top one first">
                  <BarList rows={data.by_lost_reason.map((g) => ({ label: otherLabel(g.k, LOST_REASON_LABELS), value: Number(g.total) }))} empty="No lost leads 🎉" />
                </Card>

                <Card title="👤 Team Performance" hint="Leads handled and won per person" right={<CsvButton onClick={() => csvGroup("team", data.by_assigned, (k) => String(k))} />}>
                  <BarList rows={toRows(data.by_assigned, (k) => String(k))} showConversion showRevenue />
                </Card>
              </div>

              <Card title="📈 New Leads per Day" hint="Hover a bar for leads and wins that day">
                <Columns rows={data.by_day.map((d) => ({ label: d.k.slice(5), value: d.total, extra: `${d.won} won` }))} height={160} />
              </Card>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <Card title="📅 Best Day of Week" hint="When leads come in">
                  <Columns rows={[2, 3, 4, 5, 6, 7, 1].map((k) => {
                    const g = data.by_weekday.find((x) => Number(x.k) === k);
                    return { label: WEEKDAYS[k], value: g?.total || 0, extra: `${g?.won || 0} won` };
                  })} />
                </Card>
                <Card title="⏰ Best Hour" hint="Lead creation time (24h)">
                  <Columns rows={Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: data.by_hour.find((x) => Number(x.k) === h)?.total || 0 }))} />
                </Card>
                <Card title="🔔 Follow-ups & Priority">
                  <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-red-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">Overdue</p><p className="text-lg font-bold text-red-600">{data.follow_ups.overdue || 0}</p></div>
                    <div className="rounded-lg bg-indigo-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">Upcoming</p><p className="text-lg font-bold text-indigo-600">{data.follow_ups.upcoming || 0}</p></div>
                    <div className="rounded-lg bg-green-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">Done</p><p className="text-lg font-bold text-green-600">{data.follow_ups.done || 0}</p></div>
                  </div>
                  <BarList rows={toRows(data.by_priority, (k) => LEAD_PRIORITY_LABELS[String(k)] || String(k))} />
                </Card>
              </div>

              <Card title="🧹 Data Quality" hint="Leads missing key fields — complete data = better marketing decisions">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {[
                    ["No source", t.no_source],
                    ["No city", t.no_city],
                    ["No budget", t.no_budget],
                    ["No profession", t.no_profession],
                    ["No number", t.no_number],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase text-gray-500">{l}</p>
                      <p className="text-lg font-bold text-gray-900">
                        {Number(v) || 0} <span className="text-xs font-normal text-gray-500">({pct(Number(v) || 0, t.total || 0)}%)</span>
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
