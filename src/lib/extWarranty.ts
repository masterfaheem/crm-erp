/* ============================================================
   EXTENDED WARRANTY — plans + price rules (safe on the client)
   Admin sets the price of each plan in Settings → Extended Warranty:
     percent = % of the bill (products after their line discounts)
     fixed   = a fixed amount in Rs
   On a bill / order it is added as its own line, e.g.
   "Extended Warranty — 6 Months", so totals, khata and reports
   include it with no special handling.
============================================================ */
export type WarrantyPlanKey = "6m" | "12m";
export type WarrantyRuleType = "percent" | "fixed";

export interface WarrantyRule {
  type: WarrantyRuleType;
  value: number;
  enabled: boolean;
}
export type WarrantyRules = Record<WarrantyPlanKey, WarrantyRule>;

export const WARRANTY_PLANS: { key: WarrantyPlanKey; months: number; label: string }[] = [
  { key: "6m", months: 6, label: "6 Months" },
  { key: "12m", months: 12, label: "1 Year" },
];

/* starting prices: 5% of the bill for 6 months, 10% for 1 year */
export const DEFAULT_WARRANTY_RULES: WarrantyRules = {
  "6m": { type: "percent", value: 5, enabled: true },
  "12m": { type: "percent", value: 10, enabled: true },
};

export const WARRANTY_LINE_PREFIX = "Extended Warranty";

export function warrantyLineName(plan: WarrantyPlanKey): string {
  const p = WARRANTY_PLANS.find((x) => x.key === plan);
  return `${WARRANTY_LINE_PREFIX} — ${p ? p.label : plan}`;
}

/* is this bill / order line the extended warranty line? */
export function isWarrantyLine(desc: unknown): boolean {
  return String(desc ?? "").trim().toLowerCase().startsWith(WARRANTY_LINE_PREFIX.toLowerCase());
}

/* which plan a warranty line is (from its text) */
export function planFromLine(desc: unknown): WarrantyPlanKey | null {
  const s = String(desc ?? "").toLowerCase();
  if (!isWarrantyLine(s)) return null;
  if (/1\s*year|12\s*month/.test(s)) return "12m";
  if (/6\s*month/.test(s)) return "6m";
  return null;
}

export function planMonths(plan: WarrantyPlanKey | null): number {
  return WARRANTY_PLANS.find((x) => x.key === plan)?.months ?? 0;
}

/* price of a plan for a bill whose products total `base` (whole rupees) */
export function warrantyPrice(rule: WarrantyRule | undefined, base: number): number {
  if (!rule || !rule.enabled) return 0;
  const v = Math.max(0, Number(rule.value) || 0);
  const amt = rule.type === "fixed" ? v : ((Number(base) || 0) * v) / 100;
  return Math.max(0, Math.round(amt));
}

export function ruleText(rule: WarrantyRule): string {
  return rule.type === "fixed"
    ? `Rs ${Math.round(rule.value).toLocaleString("en-PK")}`
    : `${rule.value}% of bill`;
}

/* clean anything coming from a form / the database */
export function cleanRules(v: unknown): WarrantyRules {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, Record<string, unknown>>;
  const out = { ...DEFAULT_WARRANTY_RULES } as WarrantyRules;
  for (const p of WARRANTY_PLANS) {
    const r = o[p.key];
    if (!r || typeof r !== "object") continue;
    const type: WarrantyRuleType = r.type === "fixed" ? "fixed" : "percent";
    let value = Math.max(0, Number(r.value) || 0);
    if (type === "percent") value = Math.min(100, value);
    out[p.key] = { type, value: Math.round(value * 100) / 100, enabled: r.enabled !== false };
  }
  return out;
}

/* "valid till" date for a bill made on `fromDate` (YYYY-MM-DD or Date) */
export function warrantyValidTill(fromDate: string | Date, months: number): Date {
  const d = new Date(fromDate);
  if (isNaN(d.getTime())) return d;
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}
