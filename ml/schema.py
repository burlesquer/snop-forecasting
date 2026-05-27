"""
Pydantic models for dashboard JSON contracts.

Single source of truth: Python pydantic here, TypeScript types generated
from this file via tools/generate_ts_types.py. Schema drift between
Python and TypeScript is impossible by construction.

ASCII contract:
    ml/schema.py  ──►  ml/build_dashboard_data.py  ──►  *.json
            │                                              ▲
            └──►  tools/generate_ts_types.py  ──►  types.generated.ts ──►  Next.js fetch
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Common ─────────────────────────────────────────────────────────
class SKUMeta(BaseModel):
    """Identity + display labels for one SKU. The 'cosmetics reframing'
    happens here — `name` and `category` are user-facing; `*_raw` is the
    original M5 identifier preserved for traceability.
    """

    id: str = Field(..., description="M5 item_id, stable")
    name: str = Field(..., description="Korean cosmetics display name")
    category: str = Field(..., description="Korean display category")
    category_raw: str = Field(..., description="Original M5 cat (FOODS_1 etc)")


# ── Forecasts ──────────────────────────────────────────────────────
class ForecastSeries(BaseModel):
    """One SKU's history + 28-day forecast across quantiles and scenarios.

    Array length convention:
        - historical: only past values (length = historical_days)
        - pXX:        only future values (length = horizon_days)
        - dates:      historical_days + horizon_days (the union)
    """

    sku: SKUMeta
    dates: list[str] = Field(..., description="ISO yyyy-mm-dd")
    historical: list[float | None]
    p10: list[float | None] = Field(..., description="Quantile 0.1")
    p50: list[float | None] = Field(..., description="Quantile 0.5 (point)")
    p90: list[float | None] = Field(..., description="Quantile 0.9")
    p50_no_promo: list[float | None]
    p50_with_promo: list[float | None]
    has_promo_history: bool = Field(
        ..., description="False → What-if toggle disabled with tooltip"
    )


class ForecastsJSON(BaseModel):
    """Top-level forecasts.json contract."""

    horizon_days: int = Field(28, description="Forecast horizon, M5 standard")
    historical_days: int = Field(..., description="Lookback window shown in UI")
    skus: list[ForecastSeries]


# ── KPIs (Executive header) ────────────────────────────────────────
KPIUnit = Literal["pct", "won", "count", "ratio"]


class KPI(BaseModel):
    label: str
    value: str = Field(..., description="Pre-formatted display string (₩, %, etc)")
    value_raw: float = Field(..., description="Raw number for sorting/threshold")
    delta_pp: float | None = Field(
        None, description="Change vs prior period in percentage points (kept for legacy)"
    )
    delta_label: str | None = Field(
        None,
        description=(
            "Pre-formatted contextual comparison line shown under the KPI value. "
            "Each KPI gets one — e.g., 'Naive 대비 ▲11.4%p' or '목표 12회 대비 ▲10.4회'."
        ),
    )
    delta_tone: Literal["good", "bad", "neutral"] = Field(
        "neutral", description="Color of the delta label text"
    )
    unit: KPIUnit
    direction: Literal["good", "warn", "bad"] = Field(
        ..., description="Drives KPI card border tint"
    )


class KPIsJSON(BaseModel):
    forecast_accuracy: KPI
    inventory_turnover: KPI
    service_level: KPI
    risk_sku_count: KPI
    cash_trapped: KPI


# ── Model Comparison (Analyst tab) ─────────────────────────────────
ModelId = Literal["naive", "moving_average", "lightgbm"]


class ModelMetrics(BaseModel):
    model: ModelId
    display_name: str
    mape: float = Field(..., description="Mean Absolute Percentage Error (0-1)")
    wape: float = Field(..., description="Weighted Absolute Percentage Error")
    bias: float = Field(..., description="Signed mean error, negative = under-forecast")
    training_seconds: float | None = None


class ModelComparisonJSON(BaseModel):
    holdout_days: int
    models: list[ModelMetrics]


# ── Inventory Signals (Executive: risk/excess tables + simulator) ──
class InventorySignal(BaseModel):
    sku: SKUMeta
    current_stock: int
    forecast_28d_demand: float
    forecast_28d_p90: float = Field(
        ..., description="Upper bound, used for excess detection"
    )
    safety_stock: float
    reorder_point: float
    stockout_probability: float = Field(
        ..., ge=0.0, le=1.0,
        description="Worst case = max(lead, horizon). Used for badge display.",
    )
    stockout_probability_lead: float = Field(
        ..., ge=0.0, le=1.0,
        description=(
            "Stockout risk during lead time only (orderQty would not help)."
            " Used for 'urgent this week' KPI counting + service level."
        ),
    )
    days_until_stockout: int | None = Field(
        None, description="None = no stockout in horizon"
    )
    recommended_order: int = Field(..., ge=0)
    turnover_rate_annual: float


class InventorySignalsJSON(BaseModel):
    risk_top5: list[InventorySignal]
    excess_top5: list[InventorySignal]
    estimated_revenue_loss_krw: float = Field(
        ..., description="Stockout-driven monthly loss estimate"
    )
    estimated_cash_trapped_krw: float = Field(
        ..., description="Excess-inventory cash"
    )


# ── SHAP (Analyst tab) ─────────────────────────────────────────────
class SHAPFeatureSummary(BaseModel):
    name: str = Field(..., description="Internal feature name")
    name_kr: str = Field(..., description="Korean display label")
    mean_abs_shap: float = Field(..., description="Global importance")


class SHAPForceFeature(BaseModel):
    name: str
    name_kr: str
    feature_value: float = Field(..., description="Raw feature value for this SKU")
    shap_contribution: float = Field(
        ..., description="Signed SHAP value (push toward / away from prediction)"
    )


class SHAPForce(BaseModel):
    sku: SKUMeta
    base_value: float = Field(..., description="Model E[f(x)]")
    prediction: float
    top_features: list[SHAPForceFeature] = Field(
        ..., description="Top 10 features by |contribution|"
    )


class SHAPJSON(BaseModel):
    feature_count: int
    sample_size: int = Field(..., description="N rows used for global summary")
    summary: list[SHAPFeatureSummary]
    top_sku_forces: list[SHAPForce] = Field(
        ..., description="Top 5 SKUs by absolute prediction magnitude"
    )


# ── Top-level export bundle (for build_dashboard_data) ─────────────
class DashboardBundle(BaseModel):
    """Internal aggregate. Each field maps 1:1 to a JSON file on disk."""

    kpis: KPIsJSON
    forecasts: ForecastsJSON
    model_comparison: ModelComparisonJSON
    inventory_signals: InventorySignalsJSON
    shap: SHAPJSON


__all__ = [
    "SKUMeta",
    "ForecastSeries",
    "ForecastsJSON",
    "KPI",
    "KPIUnit",
    "KPIsJSON",
    "ModelId",
    "ModelMetrics",
    "ModelComparisonJSON",
    "InventorySignal",
    "InventorySignalsJSON",
    "SHAPFeatureSummary",
    "SHAPForceFeature",
    "SHAPForce",
    "SHAPJSON",
    "DashboardBundle",
]
