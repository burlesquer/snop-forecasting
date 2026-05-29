import { loadAll } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { ModelComparisonChart } from "@/components/model-comparison-chart";
import { ShapSummaryChart } from "@/components/shap-summary-chart";
import { ShapForcePlot } from "@/components/shap-force-plot";
import { SkuTimeSeries } from "@/components/sku-time-series";
import { BacktestSummary } from "@/components/backtest-summary";

export default async function AnalystPage() {
  const { forecasts, modelComparison, shap } = await loadAll();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text-strong tracking-tight">
          Analyst View
        </h1>
        <p className="text-sm text-muted">
          모델 성능 비교 · 시계열 · feature 기여도 (SHAP)
        </p>
      </div>

      {/* Holdout backtest — credibility section: "did our predictions
          actually match what happened?" */}
      <section>
        <Card elevated>
          <SectionHeader
            title="홀드아웃 백테스트 (지난 28일)"
            subtitle="모델이 보지 못한 28일 동안의 예측 vs 실제 — 정직한 자기검증"
            methodologyAnchor="#metrics"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/40 bg-safe/10 px-2.5 py-1 text-[11px] font-medium text-text-strong whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-safe" aria-hidden />
                Show, don&apos;t tell
              </span>
            }
          />
          <BacktestSummary
            forecasts={forecasts}
            modelComparison={modelComparison}
          />
        </Card>
      </section>

      {/* Model comparison */}
      <section>
        <Card elevated>
          <SectionHeader
            title="모델 성능 비교 (28일 홀드아웃)"
            subtitle="WAPE 낮을수록 우수 · LightGBM이 베이스라인 대비 얼마나 개선했는지"
            methodologyAnchor="#model"
          />
          <ModelComparisonChart data={modelComparison} />
        </Card>
      </section>

      {/* SKU drilldown */}
      <section>
        <Card elevated>
          <SectionHeader
            title="SKU별 시계열 + 신뢰구간"
            subtitle="개별 SKU 진단 · 점선=실제 (홀드아웃) vs 빨강=예측 P50"
            methodologyAnchor="#metrics"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-strong whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-text-strong" aria-hidden />
                단일 SKU 단위
              </span>
            }
          />
          <SkuTimeSeries data={forecasts} />
        </Card>
      </section>

      {/* SHAP */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card elevated>
          <SectionHeader
            title="SHAP 전역 importance"
            subtitle="모델 전체에서 각 feature가 얼마나 중요한가"
            methodologyAnchor="#model"
          />
          <ShapSummaryChart data={shap} />
        </Card>
        <Card elevated>
          <SectionHeader
            title="SHAP force plot"
            subtitle="개별 SKU 예측의 분해 — 왜 이 모델이 이렇게 예측했는가"
            methodologyAnchor="#model"
          />
          <ShapForcePlot data={shap} />
        </Card>
      </section>
    </div>
  );
}
