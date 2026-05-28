"use client";
import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { simulateStockout } from "@/lib/inventory-simulator";
import { cn } from "@/lib/utils";
import { formatPct, formatInt } from "@/lib/format";
import type { ForecastsJSON, InventorySignalsJSON } from "@/lib/types.generated";

/**
 * Interactive inventory decision simulator — the "I am the operator" widget.
 * Pick a SKU + enter an order quantity → instant gauge + 4-week trajectory.
 * Math lives in lib/inventory-simulator.ts (mirror of ml/inventory.py).
 */
export function InventorySimulator({
  forecasts,
  signals,
}: {
  forecasts: ForecastsJSON;
  signals: InventorySignalsJSON;
}) {
  // Combine risk + excess + the rest. Risk SKUs first so dropdown leads with interesting cases.
  const skuOptions = useMemo(() => {
    const indexBySku = new Map(signals.risk_top5.concat(signals.excess_top5).map((s) => [s.sku.id, s]));
    const sorted = forecasts.skus
      .map((f) => ({ forecast: f, signal: indexBySku.get(f.sku.id) }))
      .sort((a, b) => {
        const ap = a.signal?.stockout_probability ?? 0;
        const bp = b.signal?.stockout_probability ?? 0;
        return bp - ap;
      });
    return sorted;
  }, [forecasts, signals]);

  const [selectedId, setSelectedId] = useState<string>(skuOptions[0]?.forecast.sku.id ?? "");
  const [orderQty, setOrderQty] = useState<number>(0);
  const [skuFilter, setSkuFilter] = useState<string>("");

  const filteredOptions = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();
    if (!q) return skuOptions;
    return skuOptions.filter(({ forecast }) =>
      forecast.sku.name.toLowerCase().includes(q) ||
      forecast.sku.category.toLowerCase().includes(q) ||
      forecast.sku.id.toLowerCase().includes(q)
    );
  }, [skuOptions, skuFilter]);

  const selected = useMemo(
    () => skuOptions.find((o) => o.forecast.sku.id === selectedId),
    [selectedId, skuOptions]
  );

  const sim = useMemo(() => {
    if (!selected) return null;
    const { forecast, signal } = selected;
    // Trim to future portion only — historical is leading nulls in forecast arrays
    const p50: number[] = [];
    const p10: number[] = [];
    const p90: number[] = [];
    for (let i = 0; i < forecast.p50.length; i++) {
      if (forecast.p50[i] !== null) {
        p50.push(forecast.p50[i] as number);
        p10.push((forecast.p10[i] ?? 0) as number);
        p90.push((forecast.p90[i] ?? 0) as number);
      }
    }
    const currentStock = signal?.current_stock ?? Math.round(p50.reduce((a, b) => a + b, 0) * 0.6);
    return {
      currentStock,
      result: simulateStockout({
        currentStock,
        p50Daily: p50,
        p10Daily: p10,
        p90Daily: p90,
        orderQty,
      }),
      futureDates: forecast.dates.slice(forecast.dates.length - p50.length),
    };
  }, [selected, orderQty]);

  if (!selected || !sim) return null;
  const prob = sim.result.stockoutProbability;
  const tone = prob >= 0.5 ? "danger" : prob >= 0.2 ? "warn" : "safe";

  // Clamp inventory at 0 for visualization — real inventory can't go negative.
  // Keep the raw value in the tooltip so an analyst can still read the shortfall.
  const chartData = sim.result.projectedInventory.map((v, i) => ({
    date: sim.futureDates[i] ?? `+${i + 1}d`,
    inventory: Math.max(0, Math.round(v)),
    rawInventory: Math.round(v),
  }));
  const stockoutDayIdx = sim.result.daysUntilStockout
    ? sim.result.daysUntilStockout - 1
    : null;
  const stockoutDate =
    stockoutDayIdx !== null && stockoutDayIdx < sim.futureDates.length
      ? sim.futureDates[stockoutDayIdx]
      : null;
  const lastDate = sim.futureDates[sim.futureDates.length - 1];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Controls */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted uppercase tracking-wide font-medium">
            SKU 선택 (총 {skuOptions.length}개)
          </label>
          <input
            type="text"
            placeholder="검색: 토너, 립스틱, 향수..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className={cn(
              "mt-1 block w-full rounded-md border border-border bg-surface px-3 min-h-11 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "placeholder:text-muted transition-colors duration-fast"
            )}
          />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            size={Math.min(8, Math.max(3, filteredOptions.length))}
            className={cn(
              "mt-2 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "transition-colors duration-fast"
            )}
          >
            {filteredOptions.length === 0 ? (
              <option disabled>검색 결과 없음</option>
            ) : (
              filteredOptions.map(({ forecast, signal }) => (
                <option key={forecast.sku.id} value={forecast.sku.id}>
                  {forecast.sku.name}
                  {signal
                    ? ` · 결품 ${(signal.stockout_probability * 100).toFixed(0)}%`
                    : ""}
                </option>
              ))
            )}
          </select>
          <p className="mt-1 text-xs text-muted">
            {selected.forecast.sku.category} · 현재고 {formatInt(sim.currentStock)}개
          </p>
        </div>

        <div>
          <label className="text-xs text-muted uppercase tracking-wide font-medium">
            발주 수량
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={orderQty}
            onChange={(e) => setOrderQty(Math.max(0, Number(e.target.value || 0)))}
            className={cn(
              "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-tabular",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "transition-colors duration-fast"
            )}
          />
          <p className="mt-1 text-xs text-muted">
            7일 후 입고되는 발주량 시뮬레이션
          </p>
        </div>

        {/* Stockout gauge */}
        <div className="rounded-lg bg-surface-2 border border-border p-4">
          <div className="text-xs text-muted uppercase tracking-wide font-medium mb-1">
            28일 결품 확률
          </div>
          <div
            className={cn(
              "text-4xl font-bold font-tabular tracking-tight transition-colors duration-base",
              tone === "danger" && "text-danger",
              tone === "warn" && "text-warn",
              tone === "safe" && "text-safe"
            )}
          >
            {formatPct(prob, 0)}
          </div>
          <div className="text-xs text-muted mt-1">
            소진 예상: {sim.result.daysUntilStockout !== null ? `${sim.result.daysUntilStockout}일 후` : "28일 내 없음"}
          </div>
          {/* Slim 4px indicator — 80% headline 숫자가 이미 강력해서 progress
              bar는 보조적으로만. Full-width red ribbon은 panic 톤이라 회피. */}
          <div className="mt-3 h-1 w-full rounded-full overflow-hidden bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-base ease-out-expo",
                tone === "danger" && "bg-danger/80",
                tone === "warn" && "bg-warn/80",
                tone === "safe" && "bg-safe/80"
              )}
              style={{ width: `${Math.round(prob * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Projected inventory chart */}
      <div>
        <div className="text-xs text-muted uppercase tracking-wide font-medium mb-2">
          향후 4주 재고 추이
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                interval={Math.floor(chartData.length / 5)}
              />
              {/* Cap Y at 0 — real inventory can't dive into negatives.
                  After stockout day, the line plateaus at 0 and the zone
                  is shaded to communicate "you ran out". */}
              <YAxis
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                width={40}
                domain={[0, "auto"]}
                allowDataOverflow={false}
              />
              <Tooltip
                formatter={(v, _name, payload) => {
                  const raw = (payload?.payload as { rawInventory?: number } | undefined)
                    ?.rawInventory;
                  if (typeof v === "number") {
                    if (v === 0 && typeof raw === "number" && raw < 0) {
                      return [`0 (예상 부족 ${formatInt(Math.abs(raw))}개)`, "재고"];
                    }
                    return [formatInt(v), "재고"];
                  }
                  return [String(v), "재고"];
                }}
                cursor={{ stroke: "var(--color-accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              {/* Shaded "결품 zone" after the stockout day */}
              {stockoutDate && lastDate && (
                <ReferenceArea
                  x1={stockoutDate}
                  x2={lastDate}
                  fill="var(--color-danger)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              )}
              {/* Vertical line marking the exact stockout day */}
              {stockoutDate && (
                <ReferenceLine
                  x={stockoutDate}
                  stroke="var(--color-danger)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={{
                    value: `결품 D-${sim.result.daysUntilStockout}일`,
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: "var(--color-danger)",
                    offset: 6,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="inventory"
                stroke="var(--color-accent-strong)"
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={250}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
