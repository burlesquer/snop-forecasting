"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatInt, formatPct } from "@/lib/format";
import type { ForecastsJSON, InventorySignalsJSON } from "@/lib/types.generated";

/**
 * Interactive inventory decision simulator — the "I am the operator" widget.
 * Pick a SKU + enter an order quantity → instant gauge + 4-week trajectory.
 * Math lives in lib/inventory-simulator.ts (mirror of ml/inventory.py).
 *
 * SKU picker is a custom listbox (not <select size>) so the dropdown scroll
 * bar can match the rest of the design system — native <select> internal
 * scrollbars can't be styled via CSS.
 */
export function InventorySimulator({
  forecasts,
  signals,
}: {
  forecasts: ForecastsJSON;
  signals: InventorySignalsJSON;
}) {
  // Combine risk + excess + the rest. Risk SKUs first so picker leads with interesting cases.
  const skuOptions = useMemo(() => {
    const indexBySku = new Map(
      signals.risk_top5.concat(signals.excess_top5).map((s) => [s.sku.id, s]),
    );
    return forecasts.skus
      .map((f) => ({ forecast: f, signal: indexBySku.get(f.sku.id) }))
      .sort((a, b) => {
        const ap = a.signal?.stockout_probability ?? 0;
        const bp = b.signal?.stockout_probability ?? 0;
        return bp - ap;
      });
  }, [forecasts, signals]);

  const [selectedId, setSelectedId] = useState<string>(
    skuOptions[0]?.forecast.sku.id ?? "",
  );
  // String-backed numeric input — feels natural to type without fighting a
  // pre-filled "0" or native spinner arrows. Empty → 0 for the math.
  const [orderQtyText, setOrderQtyText] = useState<string>("");
  const orderQty = Number(orderQtyText) || 0;
  const [skuFilter, setSkuFilter] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState<number>(0);

  // Guard against stale selectedId — if data reloads and the previously
  // selected SKU is gone, snap to the first option instead of rendering blank.
  useEffect(() => {
    if (skuOptions.length === 0) return;
    if (!skuOptions.some((o) => o.forecast.sku.id === selectedId)) {
      setSelectedId(skuOptions[0].forecast.sku.id);
    }
  }, [skuOptions, selectedId]);

  const filteredOptions = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();
    if (!q) return skuOptions;
    return skuOptions.filter(
      ({ forecast }) =>
        forecast.sku.name.toLowerCase().includes(q) ||
        forecast.sku.category.toLowerCase().includes(q) ||
        forecast.sku.id.toLowerCase().includes(q),
    );
  }, [skuOptions, skuFilter]);

  // Reset highlight when filter changes; clamp if list shrinks
  useEffect(() => {
    setHighlightIdx((h) => Math.min(h, Math.max(0, filteredOptions.length - 1)));
  }, [filteredOptions.length]);

  const listRef = useRef<HTMLDivElement | null>(null);
  // Keep highlighted row scrolled into view
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlightIdx}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  const selected = useMemo(
    () => skuOptions.find((o) => o.forecast.sku.id === selectedId),
    [selectedId, skuOptions],
  );

  const sim = useMemo(() => {
    if (!selected) return null;
    const { forecast, signal } = selected;
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
    const currentStock =
      signal?.current_stock ?? Math.round(p50.reduce((a, b) => a + b, 0) * 0.6);
    return {
      currentStock,
      forecastDemand28d: p50.reduce((a, b) => a + b, 0),
      signal,
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

  const handleListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = filteredOptions[highlightIdx];
      if (opt) setSelectedId(opt.forecast.sku.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightIdx(filteredOptions.length - 1);
    }
  };

  // Reasonable safety-stock + recommended-order numbers when the signal is
  // missing (rare — only happens if the SKU isn't in the risk/excess top-N
  // and signals data wasn't passed for that SKU specifically).
  const safetyStock = sim.signal?.safety_stock ?? 0;
  const recommended =
    sim.signal?.recommended_order ??
    Math.max(0, Math.round(sim.forecastDemand28d + safetyStock - sim.currentStock));
  const turnover = sim.signal?.turnover_rate_annual ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
      {/* ───── LEFT — Inputs + Selected SKU info ───────────── */}
      <div className="flex flex-col gap-4">
        {/* SKU picker */}
        <div>
          <label
            htmlFor="sku-filter"
            className="text-xs text-muted uppercase tracking-wide font-medium"
          >
            SKU 선택 (총 {skuOptions.length}개)
          </label>
          <input
            id="sku-filter"
            type="text"
            placeholder="검색: 토너, 립스틱, 향수..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className={cn(
              "mt-1 block w-full rounded-md border border-border bg-surface px-3 min-h-11 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "placeholder:text-muted transition-colors duration-fast",
            )}
            aria-controls="sku-listbox"
          />
          <div
            id="sku-listbox"
            ref={listRef}
            role="listbox"
            tabIndex={0}
            aria-label="SKU 목록"
            aria-activedescendant={
              filteredOptions[highlightIdx]
                ? `sku-opt-${filteredOptions[highlightIdx].forecast.sku.id}`
                : undefined
            }
            onKeyDown={handleListKey}
            className={cn(
              "mt-2 max-h-44 overflow-y-auto rounded-md border border-border-strong bg-surface",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
            )}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted text-center">
                검색 결과 없음
              </div>
            ) : (
              filteredOptions.map(({ forecast, signal }, idx) => {
                const isSelected = selectedId === forecast.sku.id;
                const isHighlighted = highlightIdx === idx;
                return (
                  <div
                    key={forecast.sku.id}
                    id={`sku-opt-${forecast.sku.id}`}
                    role="option"
                    aria-selected={isSelected}
                    data-idx={idx}
                    onClick={() => setSelectedId(forecast.sku.id)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={cn(
                      "px-3 py-2 text-sm cursor-pointer flex items-baseline justify-between gap-3",
                      "border-b border-border last:border-b-0 transition-colors duration-fast",
                      isSelected && "bg-accent-bg text-accent-strong font-medium",
                      !isSelected && isHighlighted && "bg-surface-2",
                    )}
                  >
                    <span className="truncate">{forecast.sku.name}</span>
                    {signal && (
                      <span className="text-xs text-muted shrink-0 font-tabular">
                        결품 {(signal.stockout_probability * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Order qty input */}
        <div>
          <label
            htmlFor="order-qty"
            className="text-xs text-muted uppercase tracking-wide font-medium"
          >
            발주 수량
          </label>
          <input
            id="order-qty"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={orderQtyText}
            onChange={(e) => setOrderQtyText(e.target.value.replace(/[^\d]/g, ""))}
            onFocus={(e) => e.target.select()}
            aria-label="발주 수량 (단위)"
            className={cn(
              "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 min-h-11 text-sm font-tabular",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              "transition-colors duration-fast",
            )}
          />
          <p className="mt-1 text-xs text-muted">
            7일 후 입고되는 발주량 시뮬레이션
          </p>
        </div>

        {/* Selected SKU detail panel — fills left column to match right side */}
        <div className="rounded-lg bg-surface-2 border border-border p-4 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-text-strong truncate">
              {selected.forecast.sku.name}
            </h4>
            <span className="text-xs text-muted shrink-0">
              {selected.forecast.sku.category}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-tabular">
            <Row label="현재고" value={`${formatInt(sim.currentStock)}개`} />
            <Row
              label="28일 예측 수요"
              value={`${formatInt(Math.round(sim.forecastDemand28d))}개`}
            />
            <Row label="안전재고" value={`${formatInt(Math.round(safetyStock))}개`} />
            <Row
              label="권장 발주"
              value={recommended > 0 ? `+${formatInt(recommended)}` : "유지"}
              accent={recommended > 0}
            />
            <Row
              label="연 회전율"
              value={turnover !== null ? `${turnover.toFixed(1)}회` : "—"}
            />
            <Row
              label="결품 D-day"
              value={
                sim.result.daysUntilStockout !== null
                  ? `${sim.result.daysUntilStockout}일 후`
                  : "28일 내 없음"
              }
            />
          </dl>
        </div>
      </div>

      {/* ───── RIGHT — Output: gauge + chart ───────────────── */}
      <div className="flex flex-col gap-4">
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
              tone === "safe" && "text-safe",
            )}
          >
            {formatPct(prob, 0)}
          </div>
          <div className="text-xs text-muted mt-1">
            소진 예상:{" "}
            {sim.result.daysUntilStockout !== null
              ? `${sim.result.daysUntilStockout}일 후`
              : "28일 내 없음"}
          </div>
          <div className="mt-3 h-1 w-full rounded-full overflow-hidden bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-base ease-out-expo",
                tone === "danger" && "bg-danger/80",
                tone === "warn" && "bg-warn/80",
                tone === "safe" && "bg-safe/80",
              )}
              style={{ width: `${Math.round(prob * 100)}%` }}
            />
          </div>
        </div>

        {/* Projected inventory chart — same container styling as gauge */}
        <div className="rounded-lg bg-surface-2 border border-border p-4 flex-1 flex flex-col">
          <div className="text-xs text-muted uppercase tracking-wide font-medium mb-2">
            향후 4주 재고 추이
          </div>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 12, bottom: 0, left: -10 }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                  interval={Math.floor(chartData.length / 5)}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                  width={56}
                  domain={[0, "auto"]}
                  allowDataOverflow={false}
                  label={{
                    value: "재고 (units)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    style: { fontSize: 11, fill: "var(--color-muted)", textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  formatter={(v, _name, payload) => {
                    const raw = (payload?.payload as { rawInventory?: number } | undefined)
                      ?.rawInventory;
                    if (typeof v === "number") {
                      if (v === 0 && typeof raw === "number" && raw < 0) {
                        return [
                          `0 (예상 부족 ${formatInt(Math.abs(raw))}개)`,
                          "재고",
                        ];
                      }
                      return [formatInt(v), "재고"];
                    }
                    return [String(v), "재고"];
                  }}
                  cursor={{
                    stroke: "var(--color-accent)",
                    strokeWidth: 1,
                    strokeDasharray: "3 3",
                  }}
                />
                {stockoutDate && lastDate && (
                  <ReferenceArea
                    x1={stockoutDate}
                    x2={lastDate}
                    fill="var(--color-danger)"
                    fillOpacity={0.06}
                    ifOverflow="visible"
                  />
                )}
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
    </div>
  );
}

function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "text-sm text-right text-text",
          accent && "text-accent-strong font-medium",
        )}
      >
        {value}
      </dd>
    </>
  );
}
