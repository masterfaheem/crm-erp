export function formatCurrency(n: number): string {
  return "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

export function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-PK", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

export function prettyStatus(s: string): string {
  return s.replace(/_/g, " ");
}

/* Exchange bills: TX-EXC-000001 (older: EXC-2026-0001) */
export function isExchangeNo(n: unknown): boolean {
  return /^(TX-)?EXC-/.test(String(n || ""));
}
export const exchangeNoSql = (col: string) => `(${col} LIKE 'EXC-%' OR ${col} LIKE 'TX-EXC-%')`;
