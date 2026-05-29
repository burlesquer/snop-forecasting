import { CheckCircle2, AlertTriangle } from "lucide-react";
import type {
  ForecastsJSON,
  ModelComparisonJSON,
} from "@/lib/types.generated";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";

interface BacktestStats {
  /** WAPE on holdout, ∈ [0, 1]. Source: model_comparison.json for lightgbm. */
  wape: number;
  /** Aggregate actual demand across all SKUs × holdout days. */
  actualTotal: number;
  /** Aggregate P50 predicted demand. */
  predictedTotal: number;
  /** Fraction of (actual, p10, p90) tuples where p10 ≤ actual ≤ p90. */
  calibration: number;
  /** Days with a valid actual_holdout × p50 pair. */
  daysCovered: number;
  /** SKUs included. */
  skuCount: number;
}

function computeStats(
  forecasts: ForecastsJSON,
  modelComparison: ModelComparisonJSON,
): BacktestStats {
  let actualTotal = 0;
  let predictedTotal = 0;
  let inRange = 0;
  let bandTotal = 0;
  let daysCovered = 0;

  for (const sku of forecasts.skus) {
    for (let i = 0; i < sku.dates.length; i++) {
      const a = sku.actual_holdout?.[i] ?? null;
      const p = sku.p50[i];
      const lo = sku.p10[i];
      const hi = sku.p90[i];

      if (a !== null && p !== null) {
        actualTotal += a;
        predictedTotal += p;
        daysCovered++;
      }
      if (a !== null && lo !== null && hi !== null) {
        if (a >= lo && a <= hi) inRange++;
        bandTotal++;
      }
    }
  }

  const lightgbm = modelComparison.models.find((m) => m.model === "lightgbm");
  const wape = lightgbm?.wape ?? 0;

  return {
    wape,
    actualTotal,
    predictedTotal,
    calibration: bandTotal > 0 ? inRange / bandTotal : 0,
    daysCovered,
    skuCount: forecasts.skus.length,
  };
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "neutral" | "warn";
}) {
  const toneClass = {
    good: "text-safe",
    neutral: "text-text-strong",
    warn: "text-warn",
  }[tone];
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="text-xs text-muted font-medium uppercase tracking-wide">
        {label}
      </div>
      <div className={cn("text-2xl font-bold font-tabular tracking-tight", toneClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-muted font-tabular truncate">{sub}</div>
      )}
    </div>
  );
}

/**
 * Backtest verification — proves the model's claims on the 28-day holdout.
 *
 * "1-WAPE = 36.1%" is just a number until you can see the predicted vs
 * actual curves on data the model did not train on. This widget surfaces
 * four credibility-critical stats from the holdout window:
 *
 *  1) Accuracy  — 1 - WAPE on holdout (matches the headline KPI)
 *  2) Bias      — predicted total vs actual total, signed %
 *  3) P10-P90 calibration — should hit 80%. <70% = intervals too narrow,
 *     >90% = too wide. Reveals whether the uncertainty estimates are real.
 *  4) Coverage  — N SKUs × N days included in the stats
 */
export function BacktestSummary({
  forecasts,
  modelComparison,
}: {
  forecasts: ForecastsJSON;
  modelComparison: ModelComparisonJSON;
}) {
  const stats = computeStats(forecasts, modelComparison);

  const accuracy = (1 - stats.wape) * 100;
  const biasPct =
    stats.actualTotal > 0
      ? ((stats.predictedTotal - stats.actualTotal) / stats.actualTotal) * 100
      : 0;
  const calibPct = stats.calibration * 100;

  // Calibration tone: 70-90% is the "honest" band
  const calibTone: "good" | "warn" =
    calibPct >= 70 && calibPct <= 90 ? "good" : "warn";

  const biasArrow = biasPct > 0 ? "▲" : biasPct < 0 ? "▼" : "·";
  const biasLabel = biasPct > 0 ? "과대예측" : biasPct < 0 ? "과소예측" : "정합";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-4">
        <Stat
          label="홀드아웃 적중률"
          value={`${accuracy.toFixed(1)}%`}
          sub={`1 − WAPE (${stats.wape.toFixed(3)})`}
          tone="neutral"
        />
        <Stat
          label="총량 편향"
          value={`${biasArrow}${Math.abs(biasPct).toFixed(1)}%`}
          sub={`예측 ${formatInt(Math.round(stats.predictedTotal))} vs 실제 ${formatInt(
            Math.round(stats.actualTotal),
          )} · ${biasLabel}`}
          tone={Math.abs(biasPct) < 5 ? "good" : "warn"}
        />
        <Stat
          label="P10–P90 적중률"
          value={`${calibPct.toFixed(1)}%`}
          sub="목표 80% (정규근사 가정의 정확도)"
          tone={calibTone}
        />
        <Stat
          label="검증 커버리지"
          value={`${stats.skuCount} × 28일`}
          sub={`${formatInt(stats.daysCovered)} SKU-일 시점`}
          tone="neutral"
        />
      </div>

      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md border px-4 py-3 text-xs leading-relaxed",
          calibTone === "good"
            ? "border-safe/30 bg-safe/5 text-text"
            : "border-warn/40 bg-warn/5 text-text",
        )}
      >
        {calibTone === "good" ? (
          <CheckCircle2 className="size-4 text-safe shrink-0 mt-0.5" aria-hidden />
        ) : (
          <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" aria-hidden />
        )}
        <p>
          <strong className="font-semibold">
            Calibration 해석:
          </strong>{" "}
          {calibTone === "good"
            ? `실제값 ${calibPct.toFixed(1)}%가 P10-P90 구간 안에 들어왔습니다. 목표 80%에 근접 → 모델의 불확실성 추정이 신뢰할 만한 수준입니다.`
            : calibPct < 70
              ? `실제값 ${calibPct.toFixed(1)}%만 P10-P90 구간 안. 70% 미만 → 모델이 자신만만(과확신). 안전재고 계산을 보수적으로 조정 필요.`
              : `실제값 ${calibPct.toFixed(1)}%가 P10-P90 구간 안. 90% 초과 → 모델이 과보수적. 구간이 너무 넓어 의사결정에 보수적 편향.`}
        </p>
      </div>
    </div>
  );
}
