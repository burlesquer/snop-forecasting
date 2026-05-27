import { TrendingDown, ShieldCheck } from "lucide-react";
import { loadAll } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { SkuTable } from "@/components/sku-table";
import { ForecastChart } from "@/components/forecast-chart";
import { InventorySimulator } from "@/components/inventory-simulator";
import { formatKRW } from "@/lib/format";

export default async function ExecutivePage() {
  const { kpis, forecasts, inventorySignals } = await loadAll();

  const hasRisk = inventorySignals.risk_top5.length > 0;
  const hasExcess = inventorySignals.excess_top5.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text-strong tracking-tight">
          Executive Dashboard
        </h1>
        <p className="text-sm text-muted">
          50개 SKU · 28일 예측 · LightGBM (P50) + 베이스라인 비교
        </p>
      </div>

      {/* KPI strip */}
      <section aria-labelledby="kpis-heading">
        <h2 id="kpis-heading" className="sr-only">
          핵심 지표
        </h2>
        {/* 5 cards laid out without an orphan row across breakpoints:
            <640: 1 col (5 stacked), 640-1023: 3 col (3+2), 1024+: 5 col */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard kpi={kpis.forecast_accuracy} />
          <KpiCard kpi={kpis.inventory_turnover} />
          <KpiCard kpi={kpis.service_level} />
          <KpiCard kpi={kpis.risk_sku_count} />
          <KpiCard kpi={kpis.cash_trapped} />
        </div>
      </section>

      {/* Risk + Excess tables */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-labelledby="signals-heading">
        <h2 id="signals-heading" className="sr-only">
          위험 / 과잉 SKU
        </h2>

        <Card elevated>
          <SectionHeader
            title="결품 위험 SKU"
            subtitle="이번 주 발주 검토 필요"
          />
          {hasRisk ? (
            <SkuTable mode="risk" signals={inventorySignals.risk_top5} />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="🌿 위험 SKU 없음"
              description="최근 발주가 잘 흐르고 있어요."
              tone="good"
            />
          )}
          <p className="mt-3 text-xs text-muted">
            예상 매출 손실:{" "}
            <span className="font-medium text-danger font-tabular">
              {formatKRW(inventorySignals.estimated_revenue_loss_krw)}
            </span>
          </p>
        </Card>

        <Card elevated>
          <SectionHeader
            title="과잉재고 SKU"
            subtitle="현금 묶임 — 할인/생산조정 검토"
          />
          {hasExcess ? (
            <SkuTable mode="excess" signals={inventorySignals.excess_top5} />
          ) : (
            <EmptyState
              icon={TrendingDown}
              title="과잉재고 없음"
              description="회전율이 모두 건강한 수준이에요."
              tone="good"
            />
          )}
          <p className="mt-3 text-xs text-muted">
            묶인 현금 추정:{" "}
            <span className="font-medium text-warn font-tabular">
              {formatKRW(inventorySignals.estimated_cash_trapped_krw)}
            </span>
          </p>
        </Card>
      </section>

      {/* Forecast chart */}
      <section aria-labelledby="forecast-heading">
        <Card elevated>
          <SectionHeader
            title="총 수요 예측 (28일)"
            subtitle="신뢰구간과 What-if 시나리오로 의사결정의 폭을 본다"
          />
          <ForecastChart data={forecasts} />
        </Card>
      </section>

      {/* Inventory simulator */}
      <section aria-labelledby="simulator-heading">
        <Card elevated>
          <SectionHeader
            title="재고 의사결정 시뮬레이터"
            subtitle="SKU와 발주량을 입력하면 결품 확률이 즉시 갱신됩니다"
          />
          <InventorySimulator forecasts={forecasts} signals={inventorySignals} />
        </Card>
      </section>
    </div>
  );
}
