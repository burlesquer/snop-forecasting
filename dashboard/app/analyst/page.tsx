import { loadAll } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { ModelComparisonChart } from "@/components/model-comparison-chart";
import { ShapSummaryChart } from "@/components/shap-summary-chart";
import { ShapForcePlot } from "@/components/shap-force-plot";
import { SkuTimeSeries } from "@/components/sku-time-series";

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

      {/* Model comparison */}
      <section>
        <Card elevated>
          <SectionHeader
            title="모델 성능 비교 (28일 홀드아웃)"
            subtitle="WAPE 낮을수록 우수 · LightGBM이 베이스라인 대비 얼마나 개선했는지"
          />
          <ModelComparisonChart data={modelComparison} />
        </Card>
      </section>

      {/* SKU drilldown */}
      <section>
        <Card elevated>
          <SectionHeader
            title="SKU별 시계열 + 신뢰구간"
            subtitle="실적 + 예측 P50 + P10/P90 fan band"
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
          />
          <ShapSummaryChart data={shap} />
        </Card>
        <Card elevated>
          <SectionHeader
            title="SHAP force plot"
            subtitle="개별 SKU 예측의 분해 — 왜 이 모델이 이렇게 예측했는가"
          />
          <ShapForcePlot data={shap} />
        </Card>
      </section>
    </div>
  );
}
