"use client";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastsJSON, ForecastSeries } from "@/lib/types.generated";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = "전체";

/**
 * Executive chart — total demand trajectory, decomposable by category.
 *
 * Category selector defaults to "전체" (all 50 SKUs aggregated). Picking a
 * specific category aggregates only that category's SKUs so the forecast
 * shape per category becomes visible.
 *
 * Recharts Area renders the P10/P90 fan band when 신뢰구간 toggle is on.
 * What-if toggle swaps the P50 line for the promotion=on variant.
 */
export function ForecastChart({ data }: { data: ForecastsJSON }) {
  const [showConfidence, setShowConfidence] = useState(true);
  const [whatIf, setWhatIf] = useState(false);
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...new Set(data.skus.map((s) => s.sku.category))],
    [data]
  );

  const filteredSkus = useMemo(() => {
    if (category === ALL_CATEGORIES) return data.skus;
    return data.skus.filter((s) => s.sku.category === category);
  }, [data, category]);

  const rows = useMemo(() => buildAggregated(filteredSkus), [filteredSkus]);
  const lastHistorical = rows.findIndex((r) => r.p50 !== null) - 1;
  const cutoffDate = lastHistorical >= 0 ? rows[lastHistorical].date : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="inline-flex items-center gap-2 text-xs text-muted">
          카테고리
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={cn(
              "rounded-md border border-border-strong bg-surface px-2 min-h-11 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            )}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
                {c !== ALL_CATEGORIES
                  ? ` (${data.skus.filter((s) => s.sku.category === c).length})`
                  : ` (${data.skus.length})`}
              </option>
            ))}
          </select>
        </label>
        <Toggle pressed={showConfidence} onPressedChange={setShowConfidence}>
          신뢰구간 (P10-P90)
        </Toggle>
        <Toggle pressed={whatIf} onPressedChange={setWhatIf}>
          What-if · 프로모션 진행
        </Toggle>
        {cutoffDate && (
          <span className="ml-auto text-xs text-muted">
            예측 시작: <span className="font-tabular">{cutoffDate}</span>
          </span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "var(--color-muted)" }}
              interval={Math.floor(rows.length / 6)}
            />
            <YAxis tick={{ fontSize: 12, fill: "var(--color-muted)" }} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--color-accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
              formatter={(value, name) => {
                const label = NAME_LABELS[String(name)] ?? String(name);
                // Recharts Area passes [lower, upper] for band — format as range
                if (Array.isArray(value) && value.length === 2) {
                  const [lo, hi] = value as [number, number];
                  if (typeof lo === "number" && typeof hi === "number") {
                    return [`${lo.toFixed(1)} ~ ${hi.toFixed(1)}`, label];
                  }
                }
                if (typeof value === "number") {
                  return [value.toFixed(1), label];
                }
                return ["—", label];
              }}
            />
            {/* Historical line */}
            <Line
              type="monotone"
              dataKey="historical"
              stroke="var(--color-text-strong)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="historical"
            />
            {/* Fan band — render under the P50 line when toggle on */}
            {showConfidence && (
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--color-accent)"
                fillOpacity={0.12}
                isAnimationActive={false}
                name="band"
              />
            )}
            {/* Main P50 forecast line — swap source based on What-if */}
            <Line
              type="monotone"
              dataKey={whatIf ? "p50_with_promo" : "p50"}
              stroke="var(--color-accent-strong)"
              strokeWidth={2}
              strokeDasharray={whatIf ? "4 3" : undefined}
              dot={false}
              connectNulls
              isAnimationActive={false}
              name={whatIf ? "p50_with_promo" : "p50"}
            />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="line"
              formatter={(name) => (
                <span className="text-xs text-muted">{NAME_LABELS[name] ?? name}</span>
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const NAME_LABELS: Record<string, string> = {
  historical: "실적",
  p50: "예측 (P50)",
  p50_with_promo: "예측 (프로모션 시)",
  band: "P10-P90 신뢰구간",
};

/** Sum across SKUs by date → single aggregated row per date. */
type Row = {
  date: string;
  historical: number | null;
  p50: number | null;
  p50_with_promo: number | null;
  band: [number, number] | null;
};

function buildAggregated(skus: ForecastSeries[]): Row[] {
  if (!skus.length) return [];
  // Use first SKU's date axis (all SKUs share the same dates by construction)
  const dates = skus[0].dates;

  const sumAt = (field: keyof ForecastSeries, idx: number): number | null => {
    let sum = 0;
    let anyPresent = false;
    for (const s of skus) {
      const arr = s[field] as Array<number | null>;
      const v = arr?.[idx];
      if (v !== null && v !== undefined && !Number.isNaN(v)) {
        sum += v;
        anyPresent = true;
      }
    }
    return anyPresent ? sum : null;
  };

  return dates.map((date, idx) => {
    const p10 = sumAt("p10", idx);
    const p50 = sumAt("p50", idx);
    const p90 = sumAt("p90", idx);
    return {
      date,
      historical: sumAt("historical", idx),
      p50,
      p50_with_promo: sumAt("p50_with_promo", idx),
      band: p10 !== null && p90 !== null ? [p10, p90] : null,
    };
  });
}
