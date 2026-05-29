import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { loadWorkedExample } from "@/lib/data";
import { formatInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "방법론 · Forecast Studio",
  description:
    "Dashboard의 모든 숫자가 어떻게 계산되었는지 — 데이터 출처, 모델 선택, 지표 정의, 공식, 가정과 한계, 실제 worked example.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <h2 className="text-xl font-semibold text-text-strong tracking-tight">
        <a
          href={`#${id}`}
          className="hover:text-accent transition-colors"
          aria-label={`${title} 섹션 링크`}
        >
          {title}
        </a>
      </h2>
      <div className="space-y-4 text-sm leading-relaxed text-text">
        {children}
      </div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rounded-md bg-surface-2 border border-border px-4 py-3 text-xs font-mono text-text-strong overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const colorClass =
    tone === "warn"
      ? "border-warn/40 bg-warn/5 text-text"
      : "border-border-strong bg-surface-2 text-text";
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${colorClass}`}
    >
      {children}
    </div>
  );
}

const TOC = [
  { id: "data", label: "데이터 출처" },
  { id: "model", label: "모델 선택 근거" },
  { id: "metrics", label: "지표 정의" },
  { id: "formulas", label: "공식 라이브러리" },
  { id: "assumptions", label: "가정 & 한계" },
  { id: "whatif", label: "What-if 시나리오" },
  { id: "example", label: "예시: 한 SKU 끝까지 계산" },
] as const;

export default async function MethodologyPage() {
  const example = await loadWorkedExample();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <header className="space-y-3">
        <p className="text-xs font-medium text-accent uppercase tracking-wider">
          Methodology
        </p>
        <h1 className="text-3xl font-bold text-text-strong tracking-tight">
          방법론
        </h1>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Dashboard에 표시된 모든 숫자가 어떻게 도출되었는지 정리한 문서. 어떤
          데이터를 썼고, 왜 이 모델을 골랐고, 각 지표는 정확히 무엇이며, 어떤
          가정 위에서 계산되었는지.
        </p>
      </header>

      {/* Quick jump TOC */}
      <nav
        aria-label="섹션 목차"
        className="rounded-lg border border-border bg-surface-2 px-4 py-3"
      >
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          목차
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {TOC.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-text hover:text-accent transition-colors"
              >
                <span className="text-muted font-tabular mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="data" title="데이터 출처">
        <p>
          원천 데이터셋은 <strong>Kaggle M5 Forecasting-Accuracy</strong>{" "}
          (Walmart 미국 매장의 일별 매출, 2011-01-29 ~ 2016-06-19, 약 30,000개
          SKU × 1,941일). 본 데모는 그중 50개 SKU subset을 사용합니다.
        </p>
        <p>
          K-beauty 시나리오로 reframe된 부분은{" "}
          <strong>표시 레이어 매핑</strong>입니다. M5의 FOODS / HOUSEHOLD /
          HOBBIES 카테고리를 스킨케어 / 메이크업 / 프래그런스 / 바디케어 4개
          K-beauty 카테고리로 시각적으로만 변환했습니다 (코드:{" "}
          <code className="text-xs">ml/scenario_mapping.py</code>). 실제 demand
          pattern은 M5 그대로이며, 시나리오 언어만 한국 화장품 도메인으로 표현한
          것입니다.
        </p>
        <p>데이터 분할:</p>
        <ul className="list-disc list-inside space-y-1 text-muted">
          <li>
            <strong className="text-text">Train</strong>: 처음 1,913일
          </li>
          <li>
            <strong className="text-text">Test (holdout)</strong>: 마지막 28일
            — 모델이 보지 못한 상태로 예측하여 실제값과 WAPE/MAPE 비교
          </li>
        </ul>
      </Section>

      <Section id="model" title="모델 선택 근거">
        <h3 className="text-base font-semibold text-text-strong mt-2">
          왜 LightGBM인가
        </h3>
        <p>비교 후보:</p>
        <ul className="list-disc list-inside space-y-1.5 text-muted">
          <li>
            <strong className="text-text">ARIMA / Prophet</strong> — 시계열 전통
            모델. 단일 SKU에 적합하지만 50 SKU × 다수 feature 동시 학습엔
            비효율적.
          </li>
          <li>
            <strong className="text-text">N-BEATS / Transformer</strong> — 큰
            데이터셋엔 강력하나 50 SKU subset엔 overkill. 학습 시간과 해석성의
            trade-off가 큼.
          </li>
          <li>
            <strong className="text-text">LightGBM (선택)</strong> — Gradient
            boosting tree. M5 Kaggle 상위 솔루션의 표준. 빠른 학습 (수 초), 50+
            feature를 자연스럽게 다루며 SHAP로 해석 가능.
          </li>
        </ul>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          왜 quantile regression 3-모델 구성인가
        </h3>
        <p>
          단일 point forecast (P50) 하나만으론 "얼마나 확신하는지"를 표현할 수
          없습니다. 결품 확률 계산과 안전재고 산정에 spread(불확실성 폭)가
          필요합니다.
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-muted">
          <li>
            <strong className="text-text">P10</strong> ={" "}
            <code className="text-xs">
              LGBMRegressor(objective=&apos;quantile&apos;, alpha=0.1)
            </code>{" "}
            — 비관 시나리오, 10% 분위수
          </li>
          <li>
            <strong className="text-text">P50</strong> ={" "}
            <code className="text-xs">
              LGBMRegressor(objective=&apos;tweedie&apos;)
            </code>{" "}
            — 중앙값. Tweedie loss는 0이 많은 demand에 강건
          </li>
          <li>
            <strong className="text-text">P90</strong> ={" "}
            <code className="text-xs">
              LGBMRegressor(objective=&apos;quantile&apos;, alpha=0.9)
            </code>{" "}
            — 낙관, 90% 분위수
          </li>
        </ul>
        <p>
          → 세 분위수가 있으면 "80% 확률로 demand는 [P10, P90] 구간에 들어옴"
          이라는 진술이 가능하고, 이 spread로 σ를 역산하여 안전재고를 계산할 수
          있습니다.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          왜 Naive + Moving Average baseline인가
        </h3>
        <p>
          LightGBM의 적중률 36.1%가 "좋은 숫자인지"를 알려면 비교 기준이
          필요합니다. baseline 두 가지는 일부러 약하게 골라 LightGBM의 가치를
          드러냅니다.
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-muted">
          <li>
            <strong className="text-text">Naive</strong>: "내일 = 어제와 같음"
            — 가장 단순
          </li>
          <li>
            <strong className="text-text">Moving Average (28일)</strong>: 최근
            28일 평균
          </li>
          <li>
            <strong className="text-text">LightGBM</strong>: 위 둘을 명확하게
            이기지 못하면 모델의 가치가 zero
          </li>
        </ul>
      </Section>

      <Section id="metrics" title="지표 정의">
        <h3 className="text-base font-semibold text-text-strong">
          P10 / P50 / P90 (분위수)
        </h3>
        <p>
          확률적 예측 분포에서의 분위수. "이 SKU의 다음 날 demand가 P10보다 낮을
          확률 = 10%, P90보다 높을 확률 = 10%."
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted">
          <li>
            <strong className="text-text">P50</strong> — 중앙값, 대표 예측치
          </li>
          <li>
            <strong className="text-text">[P10, P90]</strong> — 80% 예측 구간
            (prediction interval)
          </li>
        </ul>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          WAPE (Weighted Absolute Percentage Error)
        </h3>
        <Formula>WAPE = sum(|actual − forecast|) / sum(|actual|)</Formula>
        <p>
          MAPE의 변형. MAPE는 actual=0인 시점에서 분모 폭발로 intermittent
          demand에 부적합. WAPE는 분자분모를 모두 합산해 계산하므로 0-demand
          처리가 강건합니다. 본 데모의 main metric. <strong>낮을수록 우수.</strong>
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          MAPE (Mean Absolute Percentage Error)
        </h3>
        <Formula>MAPE = mean(|actual − forecast| / |actual|)</Formula>
        <p>전통 metric. 비교용으로 표시하지만 main metric은 WAPE.</p>

        <h3 className="text-base font-semibold text-text-strong mt-4">Bias</h3>
        <Formula>Bias = mean(forecast − actual)</Formula>
        <p>
          음수면 under-forecast (재고 부족 위험), 양수면 over-forecast (재고
          과잉). 0 근처가 이상적.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          예측 적중률 (1 − WAPE)
        </h3>
        <p>
          사용자 친화적 표현. WAPE = 0.639 → 적중률 = 36.1%. 경영자용 KPI 카드에
          쓰입니다.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          Service Level (서비스 레벨)
        </h3>
        <Formula>SL = 1 − mean(P_lead_stockout)</Formula>
        <p>
          여기서 P_lead_stockout은 각 SKU의 lead time (7일) 내 결품 확률.
          평균값이 92.8%라면 "평균적으로 lead time 내에 결품을 92.8% 확률로
          피한다"는 의미. 산업 표준 목표는 95%.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          재고회전율 (Inventory Turnover)
        </h3>
        <Formula>
          회전율 = 365 / 평균 재고 일수 = 365 / (current_stock / daily_demand)
        </Formula>
        <p>
          연 22.4회 = 평균 약 16일에 한 번 재고가 회전. 산업 표준 목표는 12회/년
          (월 1회전).
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          결품 위험 SKU 카운트
        </h3>
        <p>
          P_lead_stockout ≥ 0.30 인 SKU의 수. 0.30 threshold은 "30% 이상 결품
          확률 = 이번 주 발주 검토 대상"이라는 운영적 의사결정 기준 (조정 가능).
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          과잉재고 묶인 현금
        </h3>
        <Formula>
          sum(max(0, current_stock − demand_28d) × KRW_PER_UNIT)
        </Formula>
        <p>
          KRW_PER_UNIT = ₩12,000 (가정 — 자세한 내용은{" "}
          <a href="#assumptions" className="text-accent hover:underline">
            가정 & 한계
          </a>{" "}
          참조).
        </p>
      </Section>

      <Section id="formulas" title="공식 라이브러리">
        <h3 className="text-base font-semibold text-text-strong">
          안전재고 (Safety Stock)
        </h3>
        <Formula>{`SS = Z × σ_daily × √L

Z = 1.6449       (95% 서비스 레벨 일측 정규분포)
σ_daily = (P90 - P10) / 2.5631    (80% 구간을 1σ로 환산)
L = 7일          (lead time 가정)`}</Formula>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          재발주점 (Reorder Point)
        </h3>
        <Formula>{`ROP = sum(P50 over lead time) + SS`}</Formula>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          결품 확률 — Two-Phase
        </h3>
        <Formula>{`P_stockout = max(P_lead, P_horizon)

Phase 1 (lead time, 발주 안 함):
  P_lead = 1 - Φ((current_stock - μ_lead) / σ_lead)
  μ_lead = sum(P50[0:7])
  σ_lead = (sum(P90[0:7]) - sum(P10[0:7])) / 2.5631

Phase 2 (28일 전체, 발주 도착 후):
  P_horizon = 1 - Φ((current_stock + order_qty - μ_28) / σ_28)
  μ_28 = sum(P50[0:28])
  σ_28 = (sum(P90[0:28]) - sum(P10[0:28])) / 2.5631`}</Formula>
        <p>
          두 단계 중 worst-case를 사용. lead time 동안은 발주분이 아직 도착 안
          했으므로 order_qty가 도움 안 됨 → 시뮬레이터에서 큰 발주를 넣어도
          P_lead floor 아래로는 떨어지지 않는 이유.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          권장 발주 (Recommended Order)
        </h3>
        <Formula>{`rec = max(0, ceil(demand_28d + SS − current_stock))`}</Formula>
        <p>
          28일 horizon 수요 + 안전재고 - 현재고 = 부족분. 음수면 0으로 clip
          (이미 충분).
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          소진 D-day (Days Until Stockout)
        </h3>
        <p>
          첫 t에서 누적 P50 demand &gt; current_stock + arriving_order인 시점.
          "발주를 안 하면 며칠 후 재고가 0이 되는가"의 기댓값.
        </p>

        <h3 className="text-base font-semibold text-text-strong mt-4">
          현재고 (Current Stock) — 합성치
        </h3>
        <Note tone="warn">
          <strong>중요:</strong> 본 데모는 실제 ERP 데이터가 없으므로 현재고는
          SKU id 해시 기반으로 합성합니다. 일부 SKU는 의도적으로 understock
          (위험 테이블에 노출), 일부는 overstock (과잉 테이블에 노출)되도록
          설계했습니다. 실제 운영 환경에서는 ERP 재고 데이터로 교체되어야
          합니다.
        </Note>
        <Formula>{`sku_digest = SHA256(sku_id).hexdigest()
hash_pct   = first_4_bytes / 0xFFFFFFFF        ∈ [0, 1)
stock_days = 21 + (hash_pct - 0.5) × 36         (평균 21일, ±18일)
current_stock = round(daily_demand × stock_days)`}</Formula>
      </Section>

      <Section id="assumptions" title="가정 & 한계">
        <p>이 데모는 다음 가정 위에서 동작합니다. 실제 운영 시 검토 필요.</p>
        <ul className="list-disc list-outside ml-5 space-y-2 text-muted">
          <li>
            <strong className="text-text">
              KRW_PER_UNIT = ₩12,000 (전 SKU 동일)
            </strong>{" "}
            — 매출 손실 / 묶인 현금 계산에 사용. 실제로는 SKU별 단가가 다르므로
            ERP 마스터 데이터로 교체 필요.
          </li>
          <li>
            <strong className="text-text">Lead time = 7일 (전 SKU 동일)</strong>{" "}
            — 안전재고와 P_lead 계산의 기반. 실제론 공급사 / 제품군별로 다름.
          </li>
          <li>
            <strong className="text-text">
              현재고는 SKU id 해시 기반 합성치
            </strong>{" "}
            — 위{" "}
            <a href="#formulas" className="text-accent hover:underline">
              공식 라이브러리
            </a>{" "}
            참조. 실 ERP 연동 시 교체.
          </li>
          <li>
            <strong className="text-text">
              σ ≈ (P90 - P10) / 2.5631 정규분포 가정
            </strong>{" "}
            — quantile residual이 정규에 근사한다고 가정. 실제 demand 분포는
            right-skewed인 경우가 많아 결품 확률을 미세하게 과소추정할 수
            있음.
          </li>
          <li>
            <strong className="text-text">서비스 레벨 95% 목표</strong>,{" "}
            <strong className="text-text">회전율 12회/년 목표</strong> — S&OP
            교과서의 산업 rule-of-thumb. 실제 비즈니스 KPI에 맞춰 조정 필요.
          </li>
          <li>
            <strong className="text-text">결품 위험 threshold 30%</strong> —
            운영적 의사결정 기준. 보수적 운영이면 20%, 적극적이면 40%로 조정
            가능.
          </li>
          <li>
            <strong className="text-text">
              M5 데이터는 미국 grocery — Korean cosmetics 데이터 아님
            </strong>{" "}
            — demand seasonality 모양과 intermittent demand 특성을 차용. 실제
            cosmetics demand pattern과의 동일성은 보장되지 않음.
          </li>
          <li>
            <strong className="text-text">
              28일 horizon, 50 SKU subset
            </strong>{" "}
            — 데모 규모. 실제 production은 90-120일 horizon × 수천 SKU 가능.
          </li>
        </ul>
      </Section>

      <Section id="whatif" title="What-if 시나리오">
        <p>
          Executive 차트의 "What-if · 프로모션 진행" 토글:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-muted">
          <li>
            <strong className="text-text">OFF</strong> — P50 forecast 그대로
            표시 (현재 조건 유지)
          </li>
          <li>
            <strong className="text-text">ON</strong> — 모델을 event_promo=1로
            재추론. "다음 28일 동안 프로모션이 항상 진행된다면" 시나리오의 P50.
          </li>
        </ul>
        <p>
          이 변환은{" "}
          <code className="text-xs">ml/scenarios.py</code>에서 forecaster를 두
          번 호출하여 사전 계산 (<code className="text-xs">p50_no_promo</code>,{" "}
          <code className="text-xs">p50_with_promo</code>). 토글 시 클라이언트는
          같은 JSON에서 다른 series로 swap만 — 재계산 없음.
        </p>
        <p>
          전제: feature engineering 단계에서{" "}
          <code className="text-xs">event_promo</code> 변수가 학습 데이터에
          포함되어 모델이 프로모션 효과를 학습한 상태여야 함 (코드:{" "}
          <code className="text-xs">ml/features.py</code>).
        </p>
      </Section>

      <Section id="example" title="예시: 한 SKU 끝까지 계산">
        <p>
          위 모든 공식이 실제로 어떻게 적용되는지 — 가장 위험도가 높은 SKU
          하나를 골라 원천 데이터부터 권장 발주까지 전 과정을 따라갑니다.
          숫자는 모두{" "}
          <code className="text-xs">inventory_signals.json</code>에 저장된 값과
          동일 (맨 아래 ledger check 참고).
        </p>

        <div className="rounded-lg border border-border-strong bg-surface-2 px-4 py-3 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              대상 SKU
            </span>
            <span className="text-sm font-semibold text-text-strong">
              {example.sku.name}
            </span>
            <span className="text-xs text-muted">· {example.sku.category}</span>
          </div>
          <div className="text-xs text-muted">
            학습 종료: <span className="font-tabular">{example.train_end_date}</span>{" "}
            · 예측 시작:{" "}
            <span className="font-tabular text-accent">
              {example.prediction_start_date}
            </span>{" "}
            · 원천 ID: <code className="text-[10px]">{example.sku.id}</code>
          </div>
        </div>

        {/* Step 1: Raw data sample */}
        <h3 className="text-base font-semibold text-text-strong mt-5">
          ① 원천 데이터 (학습 종료 직전 14일)
        </h3>
        <p>{example.raw_sample.description}</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr>
                {example.raw_sample.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-medium text-muted uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-tabular">
              {example.raw_sample.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-border hover:bg-surface-2/50"
                >
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 text-text">
                      {cell === null
                        ? "—"
                        : typeof cell === "number"
                          ? cell
                          : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          이 raw 데이터가{" "}
          <code className="text-[10px]">ml/features.py</code>에서 lag · rolling
          · 이벤트 인코딩을 거쳐 feature vector로 변환됩니다.
        </p>

        {/* Step 2: Features */}
        <h3 className="text-base font-semibold text-text-strong mt-5">
          ② Engineered Features (예측 시점 snapshot)
        </h3>
        <p>{example.features.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {example.features.items.map((f) => (
            <div
              key={f.name}
              className="rounded-md border border-border px-3 py-2 bg-surface flex items-baseline justify-between gap-3"
            >
              <div className="min-w-0">
                <code className="text-xs font-mono text-text-strong">
                  {f.name}
                </code>
                <div className="text-[11px] text-muted truncate">
                  {f.description}
                </div>
              </div>
              <span className="text-sm font-tabular font-semibold text-accent-strong shrink-0">
                {f.value}
              </span>
            </div>
          ))}
        </div>

        {/* Step 3: Predictions */}
        <h3 className="text-base font-semibold text-text-strong mt-5">
          ③ LightGBM 예측 결과
        </h3>
        <p>{example.prediction.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-strong bg-surface p-4 space-y-2">
            <div className="text-xs font-medium text-muted uppercase tracking-wide">
              Day 1 (
              <span className="font-tabular">{example.prediction.day1.date}</span>
              )
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-muted">P10</div>
                <div className="text-lg font-bold font-tabular text-text">
                  {example.prediction.day1.p10}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted">P50</div>
                <div className="text-lg font-bold font-tabular text-accent-strong">
                  {example.prediction.day1.p50}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted">P90</div>
                <div className="text-lg font-bold font-tabular text-text">
                  {example.prediction.day1.p90}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border-strong bg-surface p-4 space-y-2">
            <div className="text-xs font-medium text-muted uppercase tracking-wide">
              28일 horizon 총합
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-muted">Σ P10</div>
                <div className="text-lg font-bold font-tabular text-text">
                  {example.prediction.horizon_total.p10}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted">Σ P50</div>
                <div className="text-lg font-bold font-tabular text-accent-strong">
                  {example.prediction.horizon_total.p50}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted">Σ P90</div>
                <div className="text-lg font-bold font-tabular text-text">
                  {example.prediction.horizon_total.p90}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Inventory math chain */}
        <h3 className="text-base font-semibold text-text-strong mt-5">
          ④ 재고 수학 chain (단계별 누적 계산)
        </h3>
        <p>
          위 예측치와 합성 현재고로 안전재고·결품확률·권장 발주를 차례로 계산.
          각 step의 expression은 그대로 코드(ml/inventory.py)에서 가져온 것.
        </p>
        <ol className="space-y-2">
          {example.inventory_math.map((step) => (
            <li
              key={step.step}
              className="rounded-md border border-border bg-surface px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            >
              <div className="flex items-baseline gap-3 sm:min-w-0 sm:flex-1">
                <span className="text-xs font-tabular font-bold text-muted shrink-0">
                  {String(step.step).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-strong">
                    {step.label}
                  </div>
                  <code className="block text-[11px] font-mono text-muted mt-0.5 break-all">
                    {step.expression}
                  </code>
                </div>
              </div>
              <div className="text-right shrink-0 sm:min-w-32">
                <div className="text-lg font-bold font-tabular text-accent-strong">
                  {step.unit === "probability"
                    ? `${(step.value * 100).toFixed(1)}%`
                    : step.unit === "KRW"
                      ? `₩${formatInt(step.value)}`
                      : formatInt(step.value)}
                </div>
                <div className="text-[10px] text-muted">{step.unit}</div>
              </div>
            </li>
          ))}
        </ol>

        {/* Step 5: Ledger check */}
        <h3 className="text-base font-semibold text-text-strong mt-5">
          ⑤ Ledger Check — 계산 결과가 dashboard와 일치하는가
        </h3>
        <p>{example.ledger_check.description}</p>
        <div
          className={`rounded-md border px-4 py-3 ${
            example.ledger_check.match
              ? "border-safe/40 bg-safe/5"
              : "border-warn/40 bg-warn/5"
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2
              className={`size-4 ${example.ledger_check.match ? "text-safe" : "text-warn"}`}
              aria-hidden
            />
            <span className="text-sm font-semibold text-text-strong">
              {example.ledger_check.match
                ? "검증 통과 — 모든 값 일치"
                : "검증 실패 — 코드와 worked example 간 차이 확인 필요"}
            </span>
          </div>
          <table className="w-full text-xs font-tabular">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium pb-1">항목</th>
                <th className="text-right font-medium pb-1">
                  worked example 계산
                </th>
                <th className="text-right font-medium pb-1">
                  inventory_signals.json
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-1.5 text-text">결품 확률</td>
                <td className="py-1.5 text-right text-text">
                  {(example.ledger_check.computed_stockout_probability * 100).toFixed(
                    1,
                  )}
                  %
                </td>
                <td className="py-1.5 text-right text-text">
                  {(example.ledger_check.stored_stockout_probability * 100).toFixed(
                    1,
                  )}
                  %
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-1.5 text-text">권장 발주</td>
                <td className="py-1.5 text-right text-text">
                  {example.ledger_check.computed_recommended_order}
                </td>
                <td className="py-1.5 text-right text-text">
                  {example.ledger_check.stored_recommended_order}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-1.5 text-text">안전재고</td>
                <td className="py-1.5 text-right text-text">
                  {example.ledger_check.computed_safety_stock}
                </td>
                <td className="py-1.5 text-right text-text">
                  {example.ledger_check.stored_safety_stock}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <div className="border-t border-border pt-6 text-xs text-muted">
        본 문서는 운영 시점 (2026) 기준. 모델·가정·threshold는 비즈니스 변화에
        따라 재검토 필요.
      </div>
    </div>
  );
}
