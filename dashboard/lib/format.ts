/**
 * Display formatters for the dashboard. Korean conventions.
 * Numbers use tabular-nums so columns align vertically.
 */

/** ₩ 12,345,678 */
export function formatKRW(value: number): string {
  return "₩" + new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

/** 36.1% (1 decimal) */
export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Signed delta with arrow + decimal — used by KPI cards.
 *  +1.3 → "▲1.3"   /   -2.0 → "▼2.0"   /   0 → "—"
 */
export function formatDelta(deltaPp: number | null): {
  text: string;
  tone: "good" | "bad" | "neutral";
} {
  if (deltaPp === null || deltaPp === 0) return { text: "—", tone: "neutral" };
  const sign = deltaPp > 0 ? "▲" : "▼";
  return {
    text: `${sign}${Math.abs(deltaPp).toFixed(1)}`,
    tone: deltaPp > 0 ? "good" : "bad",
  };
}

/** Round count with 건 suffix */
export function formatCount(n: number): string {
  return `${n.toLocaleString("ko-KR")}건`;
}

/** Whole number with thousands separator */
export function formatInt(n: number): string {
  return n.toLocaleString("ko-KR");
}
