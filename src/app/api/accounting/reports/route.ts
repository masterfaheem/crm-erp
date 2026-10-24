import { NextRequest, NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/requireUser";
import { accountTotals, costQuality, partyBalances, stockValueAtCost, syncJournal } from "@/lib/accounting";
import { bad, todayPKT, ymd } from "../_shared";

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ============================================================
   GET /api/accounting/reports?type=pl&from=&to=
                              ?type=bs&as_of=
                              ?type=tb&from=&to=
============================================================ */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") || "pl";
  const cid = user.company_id;
  try {
    const sync = await syncJournal(cid);

    if (type === "tb") {
      const from = ymd(sp.get("from"));
      const to = ymd(sp.get("to")) || todayPKT();
      const rows = (await accountTotals(cid, from, to)).filter((a) => a.debit || a.credit);
      const lines = rows.map((a) => {
        const net = r2(a.debit - a.credit);
        return { ...a, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 };
      });
      return NextResponse.json({
        data: {
          from, to, lines,
          total_dr: r2(lines.reduce((s, l) => s + l.dr, 0)),
          total_cr: r2(lines.reduce((s, l) => s + l.cr, 0)),
        },
        sync,
      });
    }

    if (type === "bs") {
      const asOf = ymd(sp.get("as_of")) || todayPKT();
      const all = await accountTotals(cid, null, asOf);
      const ar = await partyBalances(cid, "ar", asOf);
      const ap = await partyBalances(cid, "ap", asOf);
      const earnings = r2(
        all.filter((a) => a.type === "income").reduce((s, a) => s + a.balance, 0) -
          all.filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0)
      );
      const pick = (t: string) =>
        all.filter((a) => a.type === t && a.balance !== 0 && a.system_key !== "ar" && a.system_key !== "ap").map((a) => ({ id: a.id, code: a.code, name: a.name, amount: a.balance }));
      const assets = [
        ...pick("asset"),
        ...(ar.debit_side ? [{ id: all.find((a) => a.system_key === "ar")?.id, code: "1100", name: "Customers owe us (receivable)", amount: ar.debit_side }] : []),
        ...(ap.debit_side ? [{ id: all.find((a) => a.system_key === "ap")?.id, code: "2000", name: "Advances paid to suppliers", amount: ap.debit_side }] : []),
      ];
      const liabilities = [
        ...pick("liability"),
        ...(ap.credit_side ? [{ id: all.find((a) => a.system_key === "ap")?.id, code: "2000", name: "We owe suppliers (payable)", amount: ap.credit_side }] : []),
        ...(ar.credit_side ? [{ id: all.find((a) => a.system_key === "ar")?.id, code: "1100", name: "Customer advances / credit", amount: ar.credit_side }] : []),
      ];
      const equity = [...pick("equity"), { id: null, code: "", name: "Profit to date (all periods)", amount: earnings }];
      const tA = r2(assets.reduce((s, a) => s + a.amount, 0));
      const tL = r2(liabilities.reduce((s, a) => s + a.amount, 0));
      const tE = r2(equity.reduce((s, a) => s + a.amount, 0));
      const inv = all.find((a) => a.system_key === "inventory");
      return NextResponse.json({
        data: {
          as_of: asOf, assets, liabilities, equity,
          total_assets: tA, total_liabilities: tL, total_equity: tE,
          balanced: Math.abs(tA - (tL + tE)) < 0.01,
          inventory_book: inv?.balance ?? 0,
          stock_value_at_cost: asOf === todayPKT() ? await stockValueAtCost(cid) : null,
        },
        sync,
      });
    }

    /* profit & loss */
    const from = ymd(sp.get("from"));
    const to = ymd(sp.get("to")) || todayPKT();
    const all = await accountTotals(cid, from, to);
    const by = (k: string) => all.find((a) => a.system_key === k)?.balance || 0;
    const sales = by("sales");
    const delivery = by("delivery_income");
    const returns = -by("sales_returns"); // contra: shown as a positive deduction
    const discounts = -by("discounts");
    const otherIncome = all.filter((a) => a.type === "income" && !a.system_key).map((a) => ({ id: a.id, code: a.code, name: a.name, amount: a.balance })).filter((a) => a.amount);
    const netRevenue = r2(sales + delivery - returns - discounts);
    const cogs = by("cogs");
    const gross = r2(netRevenue - cogs);
    const expenses = all
      .filter((a) => a.type === "expense" && a.system_key !== "cogs" && a.balance !== 0)
      .map((a) => ({ id: a.id, code: a.code, name: a.name, amount: a.balance }));
    const totalExp = r2(expenses.reduce((s, e) => s + e.amount, 0));
    const totalOther = r2(otherIncome.reduce((s, e) => s + e.amount, 0));
    const net = r2(gross - totalExp + totalOther);
    return NextResponse.json({
      data: {
        from, to,
        sales, delivery_income: delivery, returns, discounts, net_revenue: netRevenue,
        cogs, gross_profit: gross, gross_margin: netRevenue ? r2((gross / netRevenue) * 100) : null,
        expenses, total_expenses: totalExp, other_income: otherIncome, total_other_income: totalOther,
        net_profit: net, net_margin: netRevenue ? r2((net / netRevenue) * 100) : null,
        accounts: Object.fromEntries(all.filter((a) => a.system_key).map((a) => [a.system_key, a.id])),
        cost_quality: await costQuality(cid, from, to),
      },
      sync,
    });
  } catch (e) {
    console.error("GET /api/accounting/reports", e);
    return bad("Could not build the report.", 500);
  }
}
