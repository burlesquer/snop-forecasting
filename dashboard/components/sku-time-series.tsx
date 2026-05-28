"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ForecastsJSON } from "@/lib/types.generated";
import { cn } from "@/lib/utils";

const SERIES_LABELS: Record<string, string> = {
  band: "P10-P90 신뢰구간",
  historical: "실적",
  p50: "예측 P50",
};

/**
 * Analyst per-SKU time series — historical + P10/P90 fan band + P50 line.
 *
 * SKU picker is a searchable custom listbox (not <select>) so its dropdown
 * scrollbar matches the inventory simulator's listbox. Keeping the design
 * system consistent across pages.
 */
export function SkuTimeSeries({ data }: { data: ForecastsJSON }) {
  const [selectedId, setSelectedId] = useState(data.skus[0]?.sku.id ?? "");
  const [skuFilter, setSkuFilter] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState<number>(0);

  const filteredSkus = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();
    if (!q) return data.skus;
    return data.skus.filter(
      (s) =>
        s.sku.name.toLowerCase().includes(q) ||
        s.sku.category.toLowerCase().includes(q) ||
        s.sku.id.toLowerCase().includes(q),
    );
  }, [data, skuFilter]);

  useEffect(() => {
    setHighlightIdx((h) => Math.min(h, Math.max(0, filteredSkus.length - 1)));
  }, [filteredSkus.length]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlightIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  const selected = useMemo(
    () => data.skus.find((s) => s.sku.id === selectedId),
    [data, selectedId],
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

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredSkus.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filteredSkus.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = filteredSkus[highlightIdx];
      if (opt) setSelectedId(opt.sku.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightIdx(filteredSkus.length - 1);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 mb-4">
        {/* Custom listbox SKU picker — matches inventory-simulator scrollbar style */}
        <div>
          <label
            htmlFor="ts-sku-filter"
            className="text-xs text-muted uppercase tracking-wide font-medium"
          >
            SKU 선택 (총 {data.skus.length}개)
          </label>
          <input
            id="ts-sku-filter"
            type="text"
            placeholder="검색: 토너, 립스틱, 향수..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className={cn(
              "mt-1 block w-full rounded-md border border-border bg-surface px-3 min-h-11 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "placeholder:text-muted transition-colors duration-fast",
            )}
            aria-controls="ts-sku-listbox"
          />
          <div
            id="ts-sku-listbox"
            ref={listRef}
            role="listbox"
            tabIndex={0}
            aria-label="SKU 목록"
            onKeyDown={handleKey}
            className={cn(
              "mt-2 max-h-44 overflow-y-auto rounded-md border border-border-strong bg-surface",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
            )}
          >
            {filteredSkus.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted text-center">
                검색 결과 없음
              </div>
            ) : (
              filteredSkus.map((s, idx) => {
                const isSel = selectedId === s.sku.id;
                const isHigh = highlightIdx === idx;
                return (
                  <div
                    key={s.sku.id}
                    role="option"
                    aria-selected={isSel}
                    data-idx={idx}
                    onClick={() => setSelectedId(s.sku.id)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={cn(
                      "px-3 py-2 text-sm cursor-pointer flex items-baseline justify-between gap-3",
                      "border-b border-border last:border-b-0 transition-colors duration-fast",
                      isSel && "bg-accent-bg text-accent-strong font-medium",
                      !isSel && isHigh && "bg-surface-2",
                    )}
                  >
                    <span className="truncate">{s.sku.name}</span>
                    <span className="text-xs text-muted shrink-0">
                      {s.sku.category}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            선택: <span className="text-text">{selected.sku.name}</span> ·{" "}
            {selected.sku.category}
          </p>
        </div>

        {/* Chart */}
        <div className="h-72 md:h-auto md:min-h-[280px]">
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
                cursor={{
                  stroke: "var(--color-accent)",
                  strokeWidth: 1,
                  strokeDasharray: "3 3",
                }}
                formatter={(value, name) => {
                  const label = SERIES_LABELS[String(name)] ?? String(name);
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
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--color-accent)"
                fillOpacity={0.15}
                isAnimationActive={false}
                name="band"
              />
              <Line
                type="monotone"
                dataKey="historical"
                stroke="var(--color-text-strong)"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                name="historical"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="var(--color-accent-strong)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                name="p50"
              />
              <Legend
                verticalAlign="bottom"
                height={24}
                iconType="line"
                formatter={(name) => (
                  <span className="text-xs text-muted">
                    {SERIES_LABELS[String(name)] ?? String(name)}
                  </span>
                )}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
