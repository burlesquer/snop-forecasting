"""
End-to-end orchestrator: M5 → forecast pipeline → 5 validated JSON files.

Pipeline:

    subset.parquet
       │
       ▼  build_features → train/test split
       │
       ├─▶ run_baselines (Naive, MA)             ─┐
       ├─▶ train_quantiles (LightGBM × P10/50/90) │
       ├─▶ run_scenarios (What-if promo on/off)    │
       │                                            │
       ▼                                            │
    compute_metrics ◄───────────────────────────────┘
    compute_signals (inventory)
    compute_shap (TreeExplainer on P50)

       │
       ▼  aggregate via ml.schema pydantic models (validation = build gate)
       ▼
    dashboard/public/data/
       ├─ kpis.json
       ├─ forecasts.json
       ├─ model_comparison.json
       ├─ inventory_signals.json
       └─ shap.json

Usage:
    python -m ml.build_dashboard_data
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import numpy as np
import pandas as pd

from ml.baseline import run_baselines
from ml.evaluate import Metrics, assert_quantile_monotonicity, compute_metrics
from ml.explain import compute_shap
from ml.features import load_and_build
from ml.inventory import (
    InventoryRow,
    compute_signals,
    estimated_cash_trapped,
    estimated_revenue_loss,
    top_risk_excess,
)
from ml.scenario_mapping import map_to_cosmetic
from ml.scenarios import run_scenarios
from ml.schema import (
    KPI,
    DashboardBundle,
    ForecastSeries,
    ForecastsJSON,
    InventorySignal,
    InventorySignalsJSON,
    KPIsJSON,
    ModelComparisonJSON,
    ModelMetrics,
    SHAPFeatureSummary,
    SHAPForce,
    SHAPForceFeature,
    SHAPJSON,
    SKUMeta,
)
from ml.train import train_quantiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.build")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "dashboard" / "public" / "data"
HISTORICAL_DAYS_SHOWN = 60   # how much past context to expose in forecasts.json
KRW_PER_UNIT = 12_000.0


# ── Helpers ────────────────────────────────────────────────────────
def _clean(arr: np.ndarray) -> list[float | None]:
    """numpy → JSON-safe list. NaN/Inf → None."""
    out: list[float | None] = []
    for v in arr:
        if v is None:
            out.append(None)
            continue
        x = float(v)
        if math.isnan(x) or math.isinf(x):
            out.append(None)
        else:
            out.append(round(x, 4))
    return out


def _direction(value: float, *, good: float, bad: float, lower_is_better: bool = False) -> str:
    """Map a numeric KPI to a discrete tint."""
    if lower_is_better:
        if value <= good:
            return "good"
        if value >= bad:
            return "bad"
        return "warn"
    if value >= good:
        return "good"
    if value <= bad:
        return "bad"
    return "warn"


def _make_sku_meta_lookup(subset: pd.DataFrame) -> dict[str, SKUMeta]:
    """One pass through the raw subset to build (item_id → SKUMeta) cache."""
    lookup: dict[str, SKUMeta] = {}
    for _, row in subset[["item_id", "dept_id"]].drop_duplicates().iterrows():
        lookup[row["item_id"]] = map_to_cosmetic(
            m5_item_id=row["item_id"], m5_dept_id=row["dept_id"]
        )
    return lookup


# ── KPIs ───────────────────────────────────────────────────────────
def _build_kpis(
    metrics: list[Metrics],
    signals: list[InventoryRow],
    risk: list[InventoryRow],
    excess: list[InventoryRow],
) -> KPIsJSON:
    """Five executive KPIs derived from model + inventory state.

    Each KPI carries an optional `delta_label` that compares to a meaningful
    reference (baseline model, business target, ideal state). Keeps all five
    cards visually consistent — every card has a second line of context.
    """
    lgbm = next(m for m in metrics if m.model == "lightgbm")
    naive = next(m for m in metrics if m.model == "naive")
    accuracy = max(0.0, 1.0 - lgbm.wape)
    accuracy_naive = max(0.0, 1.0 - naive.wape)
    accuracy_delta_pp = (accuracy - accuracy_naive) * 100

    turnover_mean = float(np.mean([s.turnover_rate_annual for s in signals]))
    # Service level + risk count use LEAD-TIME stockout (urgent / this-week meaning).
    # The horizon-based probability is shown on the simulator gauge — different KPI.
    mean_stockout_lead = float(
        np.mean([s.stockout_probability_lead for s in signals])
    )
    service_level = max(0.0, 1.0 - mean_stockout_lead)
    risk_count = int(
        sum(1 for s in signals if s.stockout_probability_lead >= 0.30)
    )
    cash_trapped = estimated_cash_trapped(excess)

    # Business targets — referenced from DESIGN.md / industry rules of thumb
    TURNOVER_TARGET = 12.0     # 회/년 (월 1회전)
    SERVICE_TARGET = 95.0      # %
    RISK_TARGET = 0            # 건

    def _arrow(value: float) -> str:
        return "▲" if value > 0 else ("▼" if value < 0 else "")

    return KPIsJSON(
        forecast_accuracy=KPI(
            label="예측 적중률 (1-WAPE)",
            value=f"{accuracy * 100:.1f}%",
            value_raw=accuracy,
            delta_pp=round(accuracy_delta_pp, 1),
            delta_label=f"Naive 대비 {_arrow(accuracy_delta_pp)}{abs(accuracy_delta_pp):.1f}%p",
            delta_tone="good" if accuracy_delta_pp > 0 else "bad",
            unit="pct",
            direction=_direction(accuracy * 100, good=40, bad=25),
        ),
        inventory_turnover=KPI(
            label="평균 재고회전율",
            value=f"{turnover_mean:.1f}회",
            value_raw=turnover_mean,
            delta_pp=None,
            delta_label=(
                f"목표 {TURNOVER_TARGET:.0f}회 대비 "
                f"{_arrow(turnover_mean - TURNOVER_TARGET)}"
                f"{abs(turnover_mean - TURNOVER_TARGET):.1f}회"
            ),
            delta_tone="good" if turnover_mean >= TURNOVER_TARGET else "bad",
            unit="ratio",
            direction=_direction(turnover_mean, good=12, bad=6),
        ),
        service_level=KPI(
            label="서비스 레벨",
            value=f"{service_level * 100:.1f}%",
            value_raw=service_level,
            delta_pp=None,
            delta_label=(
                f"목표 {SERVICE_TARGET:.0f}% 대비 "
                f"{_arrow(service_level * 100 - SERVICE_TARGET)}"
                f"{abs(service_level * 100 - SERVICE_TARGET):.1f}%p"
            ),
            delta_tone="good" if service_level * 100 >= SERVICE_TARGET else "bad",
            unit="pct",
            direction=_direction(service_level * 100, good=90, bad=70),
        ),
        risk_sku_count=KPI(
            label="결품 위험 SKU",
            value=f"{risk_count}건",
            value_raw=float(risk_count),
            delta_pp=None,
            delta_label=(
                "이번 주 발주 검토 필요" if risk_count > 0
                else f"목표 {RISK_TARGET}건 달성"
            ),
            delta_tone="bad" if risk_count > 5 else ("neutral" if risk_count > 0 else "good"),
            unit="count",
            direction=_direction(risk_count, good=5, bad=15, lower_is_better=True),
        ),
        cash_trapped=KPI(
            label="과잉재고 묶인 현금",
            value=f"₩{cash_trapped:,.0f}",
            value_raw=cash_trapped,
            delta_pp=None,
            delta_label=(
                "할인/생산조정으로 회수 가능" if cash_trapped > 1_000_000
                else "건강한 수준"
            ),
            delta_tone="bad" if cash_trapped > 5_000_000 else (
                "neutral" if cash_trapped > 1_000_000 else "good"
            ),
            unit="won",
            direction=_direction(
                cash_trapped, good=1_000_000, bad=10_000_000, lower_is_better=True
            ),
        ),
    )


# ── Forecasts (per-SKU history + quantiles + scenarios) ────────────
def _build_forecasts(
    *,
    train: pd.DataFrame,
    test: pd.DataFrame,
    predictions: pd.DataFrame,
    p50_no_promo: pd.DataFrame,
    p50_with_promo: pd.DataFrame,
    has_promo_history: dict[str, bool],
    sku_meta: dict[str, SKUMeta],
    historical_days: int,
    horizon: int,
) -> ForecastsJSON:
    # Recent history per SKU
    recent_cutoff = train["ds"].max() - pd.Timedelta(days=historical_days - 1)
    recent = train[train["ds"] >= recent_cutoff][["unique_id", "ds", "y"]]

    # Quantile predictions: pivot to wide for cleaner per-day fetching
    quant = predictions[predictions["model"].isin(["lightgbm_p10", "lightgbm", "lightgbm_p90"])]
    wide_q = quant.pivot_table(
        index=["unique_id", "ds"], columns="model", values="y_hat"
    ).reset_index()

    series_out: list[ForecastSeries] = []
    for sku, hist_group in recent.groupby("unique_id", sort=False):
        meta = sku_meta[sku]
        hist_group = hist_group.sort_values("ds")
        q_group = wide_q[wide_q["unique_id"] == sku].sort_values("ds")
        no_promo_group = p50_no_promo[p50_no_promo["unique_id"] == sku].sort_values("ds")
        with_promo_group = p50_with_promo[p50_with_promo["unique_id"] == sku].sort_values("ds")

        # Date union: historical dates + forecast dates
        all_dates = pd.concat([hist_group["ds"], q_group["ds"]]).drop_duplicates().sort_values()
        date_strs = [d.strftime("%Y-%m-%d") for d in all_dates]

        # Vectors aligned to all_dates with None where not applicable
        hist_map = dict(zip(hist_group["ds"], hist_group["y"]))
        p10_map = dict(zip(q_group["ds"], q_group["lightgbm_p10"]))
        p50_map = dict(zip(q_group["ds"], q_group["lightgbm"]))
        p90_map = dict(zip(q_group["ds"], q_group["lightgbm_p90"]))
        no_map = dict(zip(no_promo_group["ds"], no_promo_group["y_hat"]))
        on_map = dict(zip(with_promo_group["ds"], with_promo_group["y_hat"]))

        hist = np.array(
            [hist_map.get(d, np.nan) for d in all_dates], dtype="float64"
        )
        p10 = np.array([p10_map.get(d, np.nan) for d in all_dates], dtype="float64")
        p50 = np.array([p50_map.get(d, np.nan) for d in all_dates], dtype="float64")
        p90 = np.array([p90_map.get(d, np.nan) for d in all_dates], dtype="float64")
        no_p = np.array([no_map.get(d, np.nan) for d in all_dates], dtype="float64")
        on_p = np.array([on_map.get(d, np.nan) for d in all_dates], dtype="float64")

        series_out.append(
            ForecastSeries(
                sku=meta,
                dates=date_strs,
                historical=_clean(hist),
                p10=_clean(p10),
                p50=_clean(p50),
                p90=_clean(p90),
                p50_no_promo=_clean(no_p),
                p50_with_promo=_clean(on_p),
                has_promo_history=has_promo_history.get(sku, False),
            )
        )

    return ForecastsJSON(
        horizon_days=horizon,
        historical_days=historical_days,
        skus=series_out,
    )


# ── Model comparison ──────────────────────────────────────────────
def _build_model_comparison(
    metrics: list[Metrics], horizon: int, train_seconds: float
) -> ModelComparisonJSON:
    name_map = {
        "naive": "Naive (지난 주)",
        "moving_average": "Moving Average (28일)",
        "lightgbm": "LightGBM (P50)",
    }
    # Filter to the three "headline" models (skip p10/p90 from the bar chart)
    filtered = [m for m in metrics if m.model in name_map]
    out: list[ModelMetrics] = []
    for m in filtered:
        out.append(
            ModelMetrics(
                model=m.model,  # type: ignore[arg-type]
                display_name=name_map[m.model],
                mape=round(float(m.mape), 4),
                wape=round(float(m.wape), 4),
                bias=round(float(m.bias), 4),
                training_seconds=train_seconds if m.model == "lightgbm" else None,
            )
        )
    return ModelComparisonJSON(holdout_days=horizon, models=out)


# ── Inventory signals ──────────────────────────────────────────────
def _to_inventory_signal(row: InventoryRow, sku_meta: dict[str, SKUMeta]) -> InventorySignal:
    return InventorySignal(
        sku=sku_meta[row.sku_id],
        current_stock=row.current_stock,
        forecast_28d_demand=round(row.forecast_28d_demand, 2),
        forecast_28d_p90=round(row.forecast_28d_p90, 2),
        safety_stock=round(row.safety_stock, 2),
        reorder_point=round(row.reorder_point, 2),
        stockout_probability=round(row.stockout_probability, 4),
        stockout_probability_lead=round(row.stockout_probability_lead, 4),
        days_until_stockout=row.days_until_stockout,
        recommended_order=row.recommended_order,
        turnover_rate_annual=round(row.turnover_rate_annual, 2),
    )


def _build_inventory(
    signals: list[InventoryRow],
    risk: list[InventoryRow],
    excess: list[InventoryRow],
    sku_meta: dict[str, SKUMeta],
) -> InventorySignalsJSON:
    return InventorySignalsJSON(
        risk_top5=[_to_inventory_signal(r, sku_meta) for r in risk],
        excess_top5=[_to_inventory_signal(r, sku_meta) for r in excess],
        estimated_revenue_loss_krw=round(estimated_revenue_loss(risk), 0),
        estimated_cash_trapped_krw=round(estimated_cash_trapped(excess), 0),
    )


# ── SHAP ───────────────────────────────────────────────────────────
def _build_shap(shap_result, sku_meta: dict[str, SKUMeta]) -> SHAPJSON:
    summary = [
        SHAPFeatureSummary(
            name=s.name, name_kr=s.name_kr, mean_abs_shap=round(s.mean_abs_shap, 4)
        )
        for s in shap_result.summary
    ]
    forces: list[SHAPForce] = []
    for f in shap_result.top_sku_forces:
        forces.append(
            SHAPForce(
                sku=sku_meta[f.sku_id],
                base_value=round(f.base_value, 4),
                prediction=round(f.prediction, 4),
                top_features=[
                    SHAPForceFeature(
                        name=ff.name,
                        name_kr=ff.name_kr,
                        feature_value=round(ff.feature_value, 4),
                        shap_contribution=round(ff.shap_contribution, 4),
                    )
                    for ff in f.top_features
                ],
            )
        )
    return SHAPJSON(
        feature_count=shap_result.feature_count,
        sample_size=shap_result.sample_size,
        summary=summary,
        top_sku_forces=forces,
    )


# ── Orchestration ──────────────────────────────────────────────────
def build() -> Path:
    log.info("=== Pipeline start ===")

    # 1. Data + features
    ff = load_and_build()

    # 2. Models
    baselines = run_baselines(ff.train, horizon=ff.horizon)
    tr = train_quantiles(
        ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon
    )
    all_preds = pd.concat([baselines, tr.predictions], ignore_index=True)
    assert_quantile_monotonicity(all_preds)

    # 3. What-if scenarios
    sc = run_scenarios(
        tr.forecaster, ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon
    )

    # 4. Evaluation
    metrics = compute_metrics(ff.test, all_preds)

    # 5. Inventory
    signals = compute_signals(tr.predictions)
    risk, excess = top_risk_excess(signals)

    # 6. SHAP
    shap_result = compute_shap(tr.forecaster, ff.train)

    # 7. SKU meta (display labels)
    subset_path = PROJECT_ROOT / "data" / "processed" / "subset.parquet"
    subset = pd.read_parquet(subset_path)
    sku_meta = _make_sku_meta_lookup(subset)

    # 8. Aggregate into pydantic models — validation gates the build
    bundle = DashboardBundle(
        kpis=_build_kpis(metrics, signals, risk, excess),
        forecasts=_build_forecasts(
            train=ff.train,
            test=ff.test,
            predictions=tr.predictions,
            p50_no_promo=sc.p50_no_promo,
            p50_with_promo=sc.p50_with_promo,
            has_promo_history=sc.has_promo_history,
            sku_meta=sku_meta,
            historical_days=HISTORICAL_DAYS_SHOWN,
            horizon=ff.horizon,
        ),
        model_comparison=_build_model_comparison(
            metrics, ff.horizon, tr.train_seconds
        ),
        inventory_signals=_build_inventory(signals, risk, excess, sku_meta),
        shap=_build_shap(shap_result, sku_meta),
    )

    # 9. Write JSON
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = {
        "kpis.json": bundle.kpis,
        "forecasts.json": bundle.forecasts,
        "model_comparison.json": bundle.model_comparison,
        "inventory_signals.json": bundle.inventory_signals,
        "shap.json": bundle.shap,
    }
    for name, model in files.items():
        out_path = OUT_DIR / name
        out_path.write_text(
            model.model_dump_json(indent=2), encoding="utf-8"
        )
        size_kb = out_path.stat().st_size / 1024
        log.info("✅ %s (%.1f KB)", out_path.name, size_kb)

    log.info("=== Pipeline done → %s ===", OUT_DIR)
    return OUT_DIR


if __name__ == "__main__":
    build()
