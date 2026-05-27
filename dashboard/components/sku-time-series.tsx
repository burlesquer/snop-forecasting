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
import { cn } from "@/lib/utils";

/**
 * Analyst per-SKU time series — historical + P10/P90 fan band + P50 line.
 * Different from the Executive ForecastChart which aggregates; here we let
 * an analyst drill into a single SKU's behavior.
 */
export function SkuTimeSeries({ data }: { data: ForecastsJSON }) {
  const [selectedId, setSelectedId] = useState(data.skus[0]?.sku.id ?? "");
  const selected = useMemo(
    () => data.skus.find((s) => s.sku.id === selectedId),
    [data, selectedId]
  );

  const rows = useMemo(() => {
    if (!selected) return [];
    return selected.dates.map((d, i) => ({
      date: d,
      historical: selected.historical[i],
      p50: selected.p50[i],
      band:
        selected.p10[i] !== null && selected.p90[i] !== null
          ? [selected.p10[i], selected.p90[i]]
          : null,
    }));
  }, [selected]);

  if (!selected) return null;

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <label className="text-xs text-muted uppercase tracking-wide font-medium">
          SKU 선택
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={cn(
            "rounded-md border border-border-strong bg-surface px-2 py-1 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          )}
        >
          {data.skus.map((s) => (
            <option key={s.sku.id} value={s.sku.id}>
              {s.sku.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">{selected.sku.category}</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              interval={Math.floor(rows.length / 6)}
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--color-accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
              formatter={(v) => [
                typeof v === "number" ? v.toFixed(1) : "—",
                "",
              ]}
            />
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--color-accent)"
              fillOpacity={0.15}
              isAnimationActive={false}
              name="P10-P90"
            />
            <Line
              type="monotone"
              dataKey="historical"
              stroke="var(--color-text-strong)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              name="실적"
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="var(--color-accent-strong)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
              name="예측 P50"
            />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="line"
              formatter={(name) => <span className="text-xs text-muted">{name}</span>}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
