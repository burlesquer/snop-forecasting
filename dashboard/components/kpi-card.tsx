import Link from "next/link";
import { cn } from "@/lib/utils";
import type { KPI } from "@/lib/types.generated";

interface KpiCardProps {
  kpi: KPI;
  /** Compact one-line formula shown under value (e.g., "= 1 − WAPE"). */
  formula?: string;
  /** Anchor in /methodology that explains this KPI (e.g., "#metrics"). */
  methodologyAnchor?: string;
}

/**
 * KPI card for the Executive tab header strip.
 *
 * Direction maps to a left-edge accent: safe (sage), warn (amber), danger (terracotta).
 * Every card carries a delta_label (e.g., "Naive 대비 ▲11.4%p" or "목표 12회 대비 ▲10.4회")
 * so the row reads as a row of consistent contextual indicators, not one card with
 * extra info and four bare numbers.
 *
 * Optional `formula` is a one-line micro-footnote — a credibility signal showing
 * the math behind the value. Card becomes a Link to /methodology when anchor given.
 *
 * Numbers use tabular-nums so the 5 cards align cleanly across the row.
 */
export function KpiCard({ kpi, formula, methodologyAnchor }: KpiCardProps) {
  const directionClass: Record<KPI["direction"], string> = {
    good: "before:bg-safe",
    warn: "before:bg-warn",
    bad: "before:bg-danger",
  };
  const toneClass: Record<NonNullable<KPI["delta_tone"]>, string> = {
    good: "text-safe",
    bad: "text-danger",
    neutral: "text-muted",
  };

  const Wrapper = methodologyAnchor ? Link : "div";
  const wrapperProps = methodologyAnchor
    ? {
        href: `/methodology${methodologyAnchor}`,
        "aria-label": `${kpi.label} — 방법론 보기`,
      }
    : {};

  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={cn(
        "relative bg-surface border border-border rounded-xl p-5 min-h-32 flex flex-col",
        "transition-shadow duration-base ease-out-expo hover:shadow-md",
        methodologyAnchor &&
          "hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
        // Subtle left accent bar — restrained, not the "colored card border" anti-pattern
        "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-0.5 before:rounded-full",
        directionClass[kpi.direction]
      )}
    >
      <div className="text-xs text-muted font-medium leading-tight">
        {kpi.label}
      </div>
      <div className="mt-2 text-3xl font-bold text-text-strong font-tabular tracking-tight">
        {kpi.value}
      </div>
      {formula && (
        <div className="mt-1 text-[10px] text-muted font-mono leading-tight truncate">
          {formula}
        </div>
      )}
      {kpi.delta_label && (
        <div
          className={cn(
            "mt-auto pt-2 text-xs font-medium font-tabular leading-tight",
            toneClass[kpi.delta_tone ?? "neutral"]
          )}
        >
          {kpi.delta_label}
        </div>
      )}
    </Wrapper>
  );
}
