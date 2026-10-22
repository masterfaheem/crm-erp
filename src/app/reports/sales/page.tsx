"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";
import {
  BarList,
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
   SALES & ORDERS REPORT — revenue, profit, products, customers,
   receivables, online-order operations and reviews
============================================================ */
type R = Record<string, number | string | null>;
interface Report {
  totals: R;
  channel: R[];
  by_day: R[];
  top_products: R[];
  top_customers: R[];
  receivables: R[];
  orders_by_status: R[];
  ops_speed: R;
  reviews: R[];
  advance_methods: R[];
  online_by_city: R[];
  cod_due: R;
}

const N = (v: unknown) => Number(v) || 0;
const STATUS_LABEL: Record<string, string> = {
  pending: "To bill",
  invoiced: "Ready to dispatch",
  shipped: "Dispatched",
  delivered: "Delivered (review pending)",
  completed: "Completed",
  cancelled: "Cancelled",
};
const METHOD: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  cash: "Cash",
  card: "Card",
  none: "No advance",
};
const hrs = (h: unknown) => {
  const x = N(h);
  if (!x) return "—";
  return x < 48 ? `${Math.round(x)} hrs` : `${(x / 24).toFixed(1)} days`;
};

export default function SalesReportPage() {
  const [range, setRange] = useState(() => presetRange("30d"));
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
      const r = await fetch(`/api/reports/sales?${qs}`, { credentials: "include" });
      if (r.status === 401) throw new Error("Session expired. Please log in again.");
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      setData((await r.json()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const t = data?.totals || {};
  const online = data?.channel.find((c) => c.k === "online");
  const walkin = data?.channel.find((c) => c.k === "walk_in");
  const reviewCount = (data?.reviews || []).reduce((s, r) => s + N(r.n), 0);
  const reviewAvg = reviewCount
    ? (data!.reviews.reduce((s, r) => s + N(r.k) * N(r.n), 0) / reviewCount).toFixed(1)
    : "—";
  const profit = (data?.top_products || []).reduce((s, p) => s + N(p.profit), 0);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">💹 Sales & Orders Report</h1>
            <p className="mt-1 text-sm text-gray-500">Revenue, best sellers, customers, money to collect and delivery performance.</p>
          </div>

          <DateRangeBar from={range.from} to={range.to} onChange={setRange} />

          {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {loading && !data && <div className="h-64 animate-pulse rounded-2xl bg-white" />}

          {data && (
            <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <Tile label="Sales" value={rs(N(t.sales))} sub={`${N(t.bills)} bills`} />
                <Tile label="Collected" value={rs(N(t.paid))} tone="text-green-600" />
                <Tile label="To collect" value={rs(N(t.outstanding))} tone="text-red-600" sub="unpaid balance" />
                <Tile label="Avg bill" value={rs(N(t.avg_bill))} />
                <Tile label="Customers" value={String(N(t.customers))} sub="who bought" />
                <Tile label="Online sales" value={rs(N(online?.sales))} sub={`${N(online?.bills)} bills · ${pct(N(online?.sales), N(t.sales))}%`} />
                <Tile label="Walk-in sales" value={rs(N(walkin?.sales))} sub={`${N(walkin?.bills)} bills · ${pct(N(walkin?.sales), N(t.sales))}%`} />
                <Tile label="COD to collect" value={rs(N(data.cod_due.cod_due))} tone="text-amber-600" sub={`${N(data.cod_due.n)} online orders`} />
              </div>

              <Card title="📈 Sales per Day" hint="Hover a bar for the amount and number of bills">
                <Columns
                  rows={data.by_day.map((d) => ({ label: String(d.k).slice(5), value: N(d.sales), extra: `${N(d.bills)} bills` }))}
                  format={(n) => rs(n)}
                  height={170}
                />
              </Card>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Card
                  title="🏆 Best-selling Products"
                  hint={profit ? `Estimated gross profit on these: ${rs(profit)} (sale − purchase price)` : "Top 15 by revenue"}
                  right={
                    <CsvButton
                      onClick={() =>
                        downloadCsv(
                          "top-products",
                          ["Product", "SKU", "Qty", "Revenue", "Est. profit"],
                          data.top_products.map((p) => [String(p.name), String(p.code || ""), N(p.qty), Math.round(N(p.revenue)), Math.round(N(p.profit))])
                        )
                      }
                    />
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          <th className="pb-2">Product</th>
                          <th className="pb-2 text-right">Qty</th>
                          <th className="pb-2 text-right">Revenue</th>
                          <th className="pb-2 text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_products.length === 0 && (
                          <tr><td colSpan={4} className="py-6 text-center text-gray-400">No sales yet</td></tr>
                        )}
                        {data.top_products.map((p, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 pr-2"><span className="font-medium text-gray-900">{String(p.name)}</span>{p.code && <span className="ml-1 text-[11px] text-gray-400">{String(p.code)}</span>}</td>
                            <td className="py-2 text-right">{N(p.qty)}</td>
                            <td className="py-2 text-right font-semibold">{rs(N(p.revenue))}</td>
                            <td className="py-2 text-right text-gray-600">{p.profit === null ? "—" : rs(N(p.profit))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="⭐ Top Customers" hint="Highest spending customers in this period">
                  <BarList rows={data.top_customers.map((c) => ({ label: `${c.name} (${c.code})`, value: N(c.sales) }))} format={rs} />
                </Card>

                <Card title="🧾 Money to Collect" hint="Customers with unpaid balance — follow up for payment">
                  {data.receivables.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">Nothing pending 🎉</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 text-sm">
                      {data.receivables.map((c, i) => (
                        <li key={i} className="flex items-center justify-between py-2">
                          <span><b className="text-gray-900">{String(c.name)}</b> <span className="text-xs text-gray-400">{String(c.code)} · {N(c.bills)} bill(s)</span></span>
                          <span className="font-bold text-red-600">{rs(N(c.balance))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="📦 Online Orders Pipeline" hint="Orders created from won leads in this period">
                  <BarList rows={["pending", "invoiced", "shipped", "delivered", "completed", "cancelled"].map((s) => {
                    const r = data.orders_by_status.find((x) => x.k === s);
                    return { label: STATUS_LABEL[s], value: N(r?.n) };
                  }).filter((r) => r.value > 0)} empty="No online orders yet" />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-gray-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">Order → dispatch</p><p className="text-sm font-bold">{hrs(data.ops_speed.hours_to_ship)}</p></div>
                    <div className="rounded-lg bg-gray-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">In transit</p><p className="text-sm font-bold">{hrs(data.ops_speed.hours_in_transit)}</p></div>
                    <div className="rounded-lg bg-gray-50 py-2"><p className="text-[10px] font-semibold uppercase text-gray-500">Order → delivered</p><p className="text-sm font-bold">{hrs(data.ops_speed.hours_total)}</p></div>
                  </div>
                </Card>

                <Card title="⭐ Customer Reviews" hint={reviewCount ? `Average ${reviewAvg} / 5 from ${reviewCount} reviews` : "Add reviews after delivery in Online Orders"}>
                  <BarList rows={[5, 4, 3, 2, 1].map((k) => ({ label: "★".repeat(k), value: N(data.reviews.find((r) => N(r.k) === k)?.n) }))} max={Math.max(1, ...data.reviews.map((r) => N(r.n)))} empty="No reviews yet" />
                </Card>

                <Card title="💳 Advance Payments" hint="How online customers paid the advance">
                  <BarList rows={data.advance_methods.map((m) => ({ label: METHOD[String(m.k)] || String(m.k), value: N(m.n), revenue: N(m.amount) }))} showRevenue empty="No online orders yet" />
                </Card>

                <Card title="🚚 Online Orders by City" hint="Where you deliver the most">
                  <BarList rows={data.online_by_city.map((c) => ({ label: String(c.k || "Not set"), value: N(c.n), revenue: N(c.amount) }))} showRevenue empty="No online orders yet" />
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
