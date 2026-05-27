import { cn } from "@/lib/utils";
import type { KPI } from "@/lib/types.generated";

/**
 * KPI card for the Executive tab header strip.
 *
 * Direction maps to a left-edge accent: safe (sage), warn (amber), danger (terracotta).
 * Every card carries a delta_label (e.g., "Naive 대비 ▲11.4%p" or "목표 12회 대비 ▲10.4회")
 * so the row reads as a row of consistent contextual indicators, not one card with
 * extra info and four bare numbers.
 *
 * Numbers use tabular-nums so the 5 cards align cleanly across the row.
 */
export function KpiCard({ kpi }: { kpi: KPI }) {
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

  return (
    <div
      className={cn(
        "relative bg-surface border border-border rounded-xl p-5 min-h-32 flex flex-col",
        "transition-shadow duration-base ease-out-expo hover:shadow-md",
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
    </div>
  );
}
