import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/format";
import type { KPI } from "@/lib/types.generated";

/**
 * KPI card for the Executive tab header strip.
 * Direction maps to a left-edge accent: safe (sage), warn (amber), danger (terracotta).
 * Numbers use tabular-nums so 5 cards align cleanly across the row.
 */
export function KpiCard({ kpi }: { kpi: KPI }) {
  const directionClass: Record<KPI["direction"], string> = {
    good: "before:bg-safe",
    warn: "before:bg-warn",
    bad: "before:bg-danger",
  };
  const delta = formatDelta(kpi.delta_pp ?? null);

  return (
    <div
      className={cn(
        "relative bg-surface border border-border rounded-xl p-5",
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
      {delta.text !== "—" && (
        <div
          className={cn(
            "mt-1 text-xs font-medium font-tabular",
            delta.tone === "good" && "text-safe",
            delta.tone === "bad" && "text-danger",
            delta.tone === "neutral" && "text-muted"
          )}
        >
          {delta.text}
          <span className="text-muted ml-1">vs baseline</span>
        </div>
      )}
    </div>
  );
}
