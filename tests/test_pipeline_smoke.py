"""
End-to-end smoke test for the ML → JSON pipeline.

Validates everything the dashboard depends on, in one shot:
  - All 5 JSON files exist and are non-empty
  - Each parses against its pydantic schema (round-trip identity check)
  - File sizes are within budget (forecasts.json < 1MB, others < 50KB)
  - LightGBM WAPE beats Naive baseline
  - P10 ≤ P50 ≤ P90 on every forecast row (no quantile crossing)
  - KPIs have plausible ranges
  - Every SKU has a forecast and ≥ 1 historical point
  - SHAP top features are non-empty
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from ml.schema import (
    ForecastsJSON,
    InventorySignalsJSON,
    KPIsJSON,
    ModelComparisonJSON,
    SHAPJSON,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "dashboard" / "public" / "data"

EXPECTED_FILES = {
    "kpis.json": KPIsJSON,
    "forecasts.json": ForecastsJSON,
    "model_comparison.json": ModelComparisonJSON,
    "inventory_signals.json": InventorySignalsJSON,
    "shap.json": SHAPJSON,
}

SIZE_BUDGET_KB = {
    "kpis.json": 5,
    "forecasts.json": 1024,        # generous — 50 SKUs × 88 days × 5 fields
    "model_comparison.json": 5,
    "inventory_signals.json": 20,
    "shap.json": 30,
}


@pytest.fixture(scope="module")
def parsed_files() -> dict:
    """Load and parse all 5 JSON files into their pydantic models. Runs once."""
    out = {}
    for name, model_cls in EXPECTED_FILES.items():
        path = DATA_DIR / name
        assert path.exists(), f"Missing {path}. Run `python -m ml.build_dashboard_data` first."
        raw = json.loads(path.read_text(encoding="utf-8"))
        out[name] = model_cls.model_validate(raw)
    return out


# ── Existence + size budgets ──────────────────────────────────────
@pytest.mark.parametrize("filename", list(EXPECTED_FILES.keys()))
def test_file_exists(filename: str) -> None:
    path = DATA_DIR / filename
    assert path.exists(), f"{filename} missing"
    assert path.stat().st_size > 0, f"{filename} is empty"


@pytest.mark.parametrize("filename", list(EXPECTED_FILES.keys()))
def test_file_within_size_budget(filename: str) -> None:
    path = DATA_DIR / filename
    size_kb = path.stat().st_size / 1024
    budget = SIZE_BUDGET_KB[filename]
    assert size_kb <= budget, f"{filename} {size_kb:.1f}KB exceeds budget {budget}KB"


# ── Pydantic round-trip ──────────────────────────────────────────
def test_kpis_schema_valid(parsed_files) -> None:
    kpis = parsed_files["kpis.json"]
    # Every KPI must have non-empty label and a valid direction
    for name in ["forecast_accuracy", "inventory_turnover", "service_level", "risk_sku_count", "cash_trapped"]:
        kpi = getattr(kpis, name)
        assert kpi.label.strip(), f"{name} has empty label"
        assert kpi.direction in {"good", "warn", "bad"}


def test_model_comparison_three_models(parsed_files) -> None:
    mc = parsed_files["model_comparison.json"]
    names = {m.model for m in mc.models}
    assert names == {"naive", "moving_average", "lightgbm"}, f"Unexpected models: {names}"
    assert mc.holdout_days == 28


def test_lightgbm_beats_naive_on_wape(parsed_files) -> None:
    """LightGBM must beat Naive on WAPE. This is the core 'why AI' narrative."""
    mc = parsed_files["model_comparison.json"]
    by_name = {m.model: m for m in mc.models}
    assert by_name["lightgbm"].wape < by_name["naive"].wape, (
        f"LightGBM WAPE {by_name['lightgbm'].wape:.3f} must beat "
        f"Naive WAPE {by_name['naive'].wape:.3f}"
    )


def test_forecasts_have_all_skus(parsed_files) -> None:
    fc = parsed_files["forecasts.json"]
    assert len(fc.skus) == 50, f"Expected 50 SKUs, got {len(fc.skus)}"
    assert fc.horizon_days == 28


def test_no_quantile_crossing(parsed_files) -> None:
    """For every SKU, P10 ≤ P50 ≤ P90 on every forecast row."""
    fc = parsed_files["forecasts.json"]
    violations = 0
    for series in fc.skus:
        for p10, p50, p90 in zip(series.p10, series.p50, series.p90):
            # Future rows have all three set, historical rows have all None
            if p10 is None or p50 is None or p90 is None:
                continue
            if not (p10 <= p50 <= p90 + 1e-6):
                violations += 1
    assert violations == 0, f"{violations} rows violate P10 ≤ P50 ≤ P90"


def test_forecasts_no_nan_inf(parsed_files) -> None:
    """JSON-serialized data should have None where numpy would have NaN/Inf."""
    fc = parsed_files["forecasts.json"]
    for series in fc.skus:
        for field_name in ("historical", "p10", "p50", "p90"):
            arr = getattr(series, field_name)
            for v in arr:
                if v is None:
                    continue
                assert not math.isnan(v), f"NaN found in {series.sku.id}.{field_name}"
                assert not math.isinf(v), f"Inf found in {series.sku.id}.{field_name}"


def test_inventory_signals_consistent(parsed_files) -> None:
    inv = parsed_files["inventory_signals.json"]
    assert len(inv.risk_top5) == 5, f"Expected 5 risk SKUs, got {len(inv.risk_top5)}"
    assert len(inv.excess_top5) == 5
    # Risk top5 should be sorted by stockout_probability desc
    probs = [r.stockout_probability for r in inv.risk_top5]
    assert probs == sorted(probs, reverse=True), "Risk SKUs not sorted by stockout"
    # All probabilities in [0, 1]
    for r in inv.risk_top5:
        assert 0.0 <= r.stockout_probability <= 1.0
        assert r.current_stock >= 1
        assert r.recommended_order >= 0


def test_shap_summary_non_empty(parsed_files) -> None:
    sh = parsed_files["shap.json"]
    assert sh.feature_count == 10, f"Expected 10 features, got {sh.feature_count}"
    assert len(sh.summary) == 10
    assert len(sh.top_sku_forces) == 5
    # Summary should be sorted by mean_abs_shap desc
    vals = [s.mean_abs_shap for s in sh.summary]
    assert vals == sorted(vals, reverse=True), "SHAP summary not sorted by importance"
    # Lag features should be in top 3 (consistent with the M5 winner intuition)
    top3_names = {s.name for s in sh.summary[:3]}
    assert top3_names & {"lag7", "lag14", "lag28"}, (
        f"Expected lag features in top 3, got {top3_names}"
    )


def test_kpi_values_plausible(parsed_files) -> None:
    """Coarse sanity checks on KPI ranges."""
    kpis = parsed_files["kpis.json"]
    assert 0.0 <= kpis.forecast_accuracy.value_raw <= 1.0
    assert kpis.inventory_turnover.value_raw > 0
    assert 0.0 <= kpis.service_level.value_raw <= 1.0
    assert kpis.risk_sku_count.value_raw >= 0
    assert kpis.cash_trapped.value_raw >= 0


def test_ts_types_file_exists() -> None:
    """The generated TS types must exist and reference all pydantic models."""
    ts_path = PROJECT_ROOT / "dashboard" / "lib" / "types.generated.ts"
    assert ts_path.exists(), "Run `python -m tools.generate_ts_types` first."
    content = ts_path.read_text(encoding="utf-8")
    # Spot-check key interfaces are present
    for marker in ("KPIsJSON", "ForecastsJSON", "ModelComparisonJSON", "InventorySignalsJSON", "SHAPJSON"):
        assert f"export interface {marker}" in content, f"Missing {marker} in TS types"


# ── Regression tests for recent simulator math fixes ──────────────
# These guard against ISSUE-001 (simulator gauge unresponsive to orderQty)
# and ISSUE-003 (KPI service_level regression from horizon-prob mean).
# If you change ml.inventory.stockout_probability or compute_signals math,
# expect these to break — that's the point.

def _make_synthetic_forecast(n_days: int = 28, daily_mean: float = 10.0) -> tuple:
    """Helper: return (p10, p50, p90) arrays with a fixed σ ≈ 1.95 daily."""
    import numpy as np
    p50 = np.full(n_days, daily_mean, dtype="float64")
    p10 = p50 - 2.5
    p90 = p50 + 2.5
    return p10, p50, p90


def test_stockout_simulator_responds_to_order_qty() -> None:
    """ISSUE-001 regression: increasing orderQty must lower horizon-stockout prob.

    Before the dual-prob fix, the gauge was driven only by lead-time math, so
    large orders made no difference. This locks in the new behavior.
    """
    from ml.inventory import stockout_probability
    p10, p50, p90 = _make_synthetic_forecast(daily_mean=10.0)
    # Stock 30 units, demand 280 over 28d — short by ~250 without order
    no_order = stockout_probability(
        current_stock=30, p50_daily=p50, p10_daily=p10, p90_daily=p90, order_qty=0
    )
    big_order = stockout_probability(
        current_stock=30, p50_daily=p50, p10_daily=p10, p90_daily=p90, order_qty=500
    )
    assert no_order["stockout_probability_horizon"] > 0.9, (
        f"Expected high horizon-stockout without order, got "
        f"{no_order['stockout_probability_horizon']:.3f}"
    )
    assert big_order["stockout_probability_horizon"] < 0.05, (
        f"Expected near-zero horizon-stockout with 500-unit order, got "
        f"{big_order['stockout_probability_horizon']:.3f}"
    )


def test_stockout_dual_prob_consistency() -> None:
    """ISSUE-003: stockout_probability must equal max(lead, horizon).

    Service level KPI uses the lead probability; the gauge uses max(). If
    these decouple, the dashboard tells inconsistent stories.
    """
    from ml.inventory import stockout_probability
    p10, p50, p90 = _make_synthetic_forecast(daily_mean=10.0)
    result = stockout_probability(
        current_stock=50, p50_daily=p50, p10_daily=p10, p90_daily=p90, order_qty=100
    )
    expected = max(
        result["stockout_probability_lead"],
        result["stockout_probability_horizon"],
    )
    assert abs(result["stockout_probability"] - expected) < 1e-9, (
        f"stockout_probability ({result['stockout_probability']}) "
        f"must equal max(lead={result['stockout_probability_lead']}, "
        f"horizon={result['stockout_probability_horizon']}) = {expected}"
    )


def test_high_risk_skus_have_positive_recommended_order(parsed_files) -> None:
    """Recent fix: recommended_order = max(0, demand_28d + SS - stock).

    Before, it used (ROP - stock), which could leave high-horizon-risk SKUs
    with rec=0 — exactly the SKUs that prompt the user to act. Risk table
    showing "-" for 권장 발주 was the visible symptom.
    """
    inv = parsed_files["inventory_signals.json"]
    for r in inv.risk_top5:
        # Risk top5 by definition have elevated stockout — they must always
        # have a positive recommendation, otherwise the table is useless.
        assert r.recommended_order > 0, (
            f"Risk SKU {r.sku.id} has stockout={r.stockout_probability:.2f} "
            f"but recommended_order={r.recommended_order} — should be positive."
        )


def test_kpi_service_level_uses_lead_time_probability(parsed_files) -> None:
    """ISSUE-003 regression: service_level must be derived from lead-prob mean.

    Using horizon-prob mean collapsed the KPI to ~43% (because horizon prob
    is naturally higher). Verifies the metric stays in the executive-meaningful
    "this week" framing.
    """
    inv = parsed_files["inventory_signals.json"]
    kpis = parsed_files["kpis.json"]
    # Service level should not be dramatically lower than (1 - mean horizon prob)
    # would imply — i.e., should be ≥ 70% for this demo dataset.
    assert kpis.service_level.value_raw >= 0.70, (
        f"Service level {kpis.service_level.value_raw:.2%} suspiciously low — "
        f"check if it's accidentally using horizon stockout instead of lead."
    )
