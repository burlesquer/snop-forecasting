"""
Inventory signals: safety stock, reorder point, stockout probability per SKU.

Formulas used (S&OP textbook):
  Safety stock:    SS = Z * σ_demand * √L
  Reorder point:   ROP = mean_demand_during_lead * L + SS
  Stockout prob:   Φ(-(current_stock - μ_lead) / σ_lead)   normal approx

Where:
  Z          = 1.6449 for 95% service level
  σ_demand   = derived from (P90 - P10) / 2.56 ≈ 1 std-dev of forecast spread
  L          = LEAD_TIME_DAYS (assumed constant)
  μ_lead     = mean(P50) over the lead time window
  σ_lead     = σ_demand * √L

The simulator function exposed at the bottom is the math the frontend
must replicate in TypeScript for the interactive 시뮬레이터 widget.
Keep both implementations in sync — there is a snapshot test.
"""
from __future__ import annotations

import hashlib
import logging
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.inventory")

# ── Config ───────────────────────────────────────────────────────
Z_95 = 1.6449                    # Service level 95% one-sided
LEAD_TIME_DAYS = 7               # Replenishment lead time assumption
HORIZON_DAYS = 28
KRW_PER_UNIT = 12_000.0          # Avg cosmetics unit price (₩) for revenue calc
INITIAL_STOCK_DAYS_MEAN = 21.0   # Synthesized current stock midpoint (days of P50 demand)
INITIAL_STOCK_DAYS_SPREAD = 18.0 # ± half-range applied via SKU-id hash → realistic mix
                                  #   of under-stocked (risk) and over-stocked (excess) SKUs
P10_P90_TO_SIGMA = 2.5631        # 80% interval / 2 to convert to σ


@dataclass(frozen=True)
class InventoryRow:
    sku_id: str
    current_stock: int
    forecast_28d_demand: float
    forecast_28d_p90: float
    safety_stock: float
    reorder_point: float
    # Two probabilities — semantically distinct, computed separately:
    #   _lead     = P(stockout during lead time, before any reorder arrives)
    #               → drives "this week's urgent SKUs" + service level KPIs
    #   _horizon  = P(stockout in 28d given current_stock + recommended_order)
    #               → matches the interactive simulator's gauge baseline
    stockout_probability_lead: float
    stockout_probability: float  # horizon — kept this name to match schema
    days_until_stockout: int | None
    recommended_order: int
    turnover_rate_annual: float


def _normal_cdf(x: float) -> float:
    """Φ(x) via erf for portability. Matches scipy's norm.cdf to 6 decimals."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def stockout_probability(
    *,
    current_stock: float,
    p50_daily: np.ndarray,
    p10_daily: np.ndarray,
    p90_daily: np.ndarray,
    order_qty: float = 0.0,
    order_lead_time: int = LEAD_TIME_DAYS,
) -> dict[str, float | int | list[float]]:
    """Single-SKU stockout simulator. Replicated client-side in TypeScript.

    Inputs are 28-day daily forecasts. Returns:
      stockout_probability — normal-CDF estimate over the lead time window
      days_until_stockout  — first day cumulative P50 demand > current_stock + arriving order
      projected_inventory  — list[float], end-of-day inventory across 28 days
    """
    horizon = len(p50_daily)
    # Inventory trajectory: stock arrives at day `order_lead_time`
    inventory = np.empty(horizon, dtype="float64")
    stock = float(current_stock)
    days_until: int | None = None
    for t in range(horizon):
        # Order arrives at the start of day == order_lead_time
        if t == order_lead_time:
            stock += order_qty
        stock -= float(p50_daily[t])
        if stock < 0 and days_until is None:
            days_until = t + 1
        inventory[t] = stock

    # Two-phase stockout probability — mirrors TS lib/inventory-simulator.ts
    # Phase 1: lead time (order has not arrived) — orderQty does NOT help
    lead_p50 = float(np.sum(p50_daily[:order_lead_time]))
    lead_p10 = float(np.sum(p10_daily[:order_lead_time]))
    lead_p90 = float(np.sum(p90_daily[:order_lead_time]))
    sigma_lead = (lead_p90 - lead_p10) / P10_P90_TO_SIGMA
    if sigma_lead <= 0:
        prob_lead = 1.0 if current_stock < lead_p50 else 0.0
    else:
        prob_lead = 1.0 - _normal_cdf((current_stock - lead_p50) / sigma_lead)

    # Phase 2: full horizon (order has arrived) — current + orderQty vs total demand
    horizon_p50 = float(np.sum(p50_daily))
    horizon_p10 = float(np.sum(p10_daily))
    horizon_p90 = float(np.sum(p90_daily))
    sigma_horizon = (horizon_p90 - horizon_p10) / P10_P90_TO_SIGMA
    total_stock = current_stock + float(order_qty)
    if sigma_horizon <= 0:
        prob_horizon = 1.0 if total_stock < horizon_p50 else 0.0
    else:
        prob_horizon = 1.0 - _normal_cdf((total_stock - horizon_p50) / sigma_horizon)

    prob_lead = max(0.0, min(1.0, prob_lead))
    prob_horizon = max(0.0, min(1.0, prob_horizon))
    prob = max(prob_lead, prob_horizon)

    return {
        "stockout_probability": prob,           # max(lead, horizon)
        "stockout_probability_lead": prob_lead, # exposed separately for KPIs
        "stockout_probability_horizon": prob_horizon,
        "days_until_stockout": days_until,
        "projected_inventory": inventory.tolist(),
    }


def _pivot_quantiles(predictions: pd.DataFrame) -> pd.DataFrame:
    """Long → wide on (unique_id, ds) with p10/p50/p90 columns."""
    needed = {"lightgbm_p10", "lightgbm", "lightgbm_p90"}
    sub = predictions[predictions["model"].isin(needed)]
    wide = sub.pivot_table(
        index=["unique_id", "ds"], columns="model", values="y_hat"
    ).reset_index()
    wide = wide.rename(
        columns={"lightgbm_p10": "p10", "lightgbm": "p50", "lightgbm_p90": "p90"}
    )
    return wide.sort_values(["unique_id", "ds"]).reset_index(drop=True)


def compute_signals(predictions: pd.DataFrame) -> list[InventoryRow]:
    """Per-SKU inventory metrics. Returns list of InventoryRow."""
    wide = _pivot_quantiles(predictions)
    rows: list[InventoryRow] = []

    for sku, group in wide.groupby("unique_id", sort=False):
        p10 = group["p10"].to_numpy()
        p50 = group["p50"].to_numpy()
        p90 = group["p90"].to_numpy()

        demand_28d = float(p50.sum())
        p90_28d = float(p90.sum())
        # Daily σ estimate from quantile spread, then SS over lead time
        sigma_daily = float(np.mean((p90 - p10) / P10_P90_TO_SIGMA))
        sigma_lead = sigma_daily * math.sqrt(LEAD_TIME_DAYS)
        ss = Z_95 * sigma_lead
        mu_lead = float(p50[:LEAD_TIME_DAYS].sum())
        rop = mu_lead + ss

        # Synthesize current stock — deterministic per SKU but with realistic variance.
        # Some SKUs will be under-stocked (→ risk table), others over-stocked (→ excess
        # table). The hash makes the choice reproducible across runs.
        sku_digest = hashlib.sha256(str(sku).encode("utf-8")).digest()
        hash_pct = int.from_bytes(sku_digest[:4], "big") / 0xFFFFFFFF  # ∈ [0, 1)
        stock_days = (
            INITIAL_STOCK_DAYS_MEAN
            + (hash_pct - 0.5) * 2 * INITIAL_STOCK_DAYS_SPREAD
        )
        daily_demand_estimate = max(1e-3, demand_28d / HORIZON_DAYS)
        current_stock = max(1, int(round(daily_demand_estimate * stock_days)))

        sim = stockout_probability(
            current_stock=current_stock,
            p50_daily=p50,
            p10_daily=p10,
            p90_daily=p90,
        )

        # Recommended order — cover full 28-day horizon demand + safety stock.
        # Previously used (ROP - current_stock) which ignores horizon stockout:
        # a SKU could have 80% horizon-stockout risk but ROP-rec = 0 because
        # current stock happened to exceed the lead-time reorder point.
        target_inventory = demand_28d + ss
        rec = max(0, int(math.ceil(target_inventory - current_stock)))

        # Turnover (annual) = 365 / days_of_supply, days_of_supply = stock / daily_demand
        daily_demand = max(1e-6, demand_28d / HORIZON_DAYS)
        days_of_supply = current_stock / daily_demand
        turnover = 365.0 / max(days_of_supply, 1.0)

        rows.append(
            InventoryRow(
                sku_id=str(sku),
                current_stock=current_stock,
                forecast_28d_demand=demand_28d,
                forecast_28d_p90=p90_28d,
                safety_stock=ss,
                reorder_point=rop,
                stockout_probability_lead=float(sim["stockout_probability_lead"]),
                stockout_probability=float(sim["stockout_probability"]),
                days_until_stockout=sim["days_until_stockout"],  # int | None
                recommended_order=rec,
                turnover_rate_annual=turnover,
            )
        )

    log.info("Computed inventory signals for %d SKUs", len(rows))
    return rows


def top_risk_excess(
    signals: list[InventoryRow], *, n: int = 5
) -> tuple[list[InventoryRow], list[InventoryRow]]:
    """Sort signals → top N risk (highest stockout prob) + top N excess (lowest turnover)."""
    by_risk = sorted(signals, key=lambda r: r.stockout_probability, reverse=True)[:n]
    by_excess = sorted(signals, key=lambda r: r.turnover_rate_annual)[:n]
    return by_risk, by_excess


def estimated_revenue_loss(risk_top: list[InventoryRow]) -> float:
    """Rough estimate: stockout_prob × forecast_28d_demand × KRW_PER_UNIT."""
    return float(
        sum(r.stockout_probability * r.forecast_28d_demand * KRW_PER_UNIT for r in risk_top)
    )


def estimated_cash_trapped(excess_top: list[InventoryRow]) -> float:
    """Rough estimate: max(0, current_stock - demand_28d) × KRW_PER_UNIT."""
    return float(
        sum(max(0, r.current_stock - r.forecast_28d_demand) * KRW_PER_UNIT for r in excess_top)
    )


if __name__ == "__main__":
    from ml.baseline import run_baselines
    from ml.features import load_and_build
    from ml.train import train_quantiles

    ff = load_and_build()
    tr = train_quantiles(ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon)
    signals = compute_signals(tr.predictions)
    risk, excess = top_risk_excess(signals)

    print("\n=== TOP 5 RISK (stockout) ===")
    for r in risk:
        print(
            f"  {r.sku_id} stockout={r.stockout_probability:.2f} "
            f"days_until={r.days_until_stockout} rec_order={r.recommended_order}"
        )
    print("\n=== TOP 5 EXCESS (low turnover) ===")
    for r in excess:
        print(f"  {r.sku_id} turnover={r.turnover_rate_annual:.1f}x")
    print(f"\nEstimated revenue loss: ₩{estimated_revenue_loss(risk):,.0f}")
    print(f"Estimated cash trapped: ₩{estimated_cash_trapped(excess):,.0f}")
