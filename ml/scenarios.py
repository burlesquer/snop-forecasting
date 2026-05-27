"""
What-if scenarios: predict twice with promotion=0 vs promotion=1 forced.

This powers the dashboard "What-if 토글" — flipping the promotion switch
shows the user how the P50 forecast changes if a promotion is run during
the next 28 days.

Caveats:
  - SKUs with zero promotion history in training data will see ~identical
    predictions either way (the model has no signal to differentiate).
    We flag these so the UI can disable the toggle with a tooltip.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from mlforecast import MLForecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.scenarios")

# Minimum total daily-level diff between scenarios for a SKU to be "meaningful"
SCENARIO_DIFF_THRESHOLD = 0.5  # ≥0.5 units total over 28 days


@dataclass
class ScenarioResult:
    """Per-SKU P50 under each promotion regime."""

    p50_no_promo: pd.DataFrame    # unique_id, ds, y_hat
    p50_with_promo: pd.DataFrame  # unique_id, ds, y_hat
    has_promo_history: dict[str, bool]


def _predict_with_forced_promo(
    forecaster: MLForecast,
    test: pd.DataFrame,
    exog_cols: tuple[str, ...],
    *,
    promotion_value: int,
    horizon: int,
) -> pd.DataFrame:
    """Predict with the `promotion` column overridden to a constant value."""
    x_df = test[["unique_id", "ds", *exog_cols]].copy()
    x_df["promotion"] = np.int8(promotion_value)
    preds = forecaster.predict(h=horizon, X_df=x_df)
    return preds[["unique_id", "ds", "lgb_p50"]].rename(columns={"lgb_p50": "y_hat"})


def run_scenarios(
    forecaster: MLForecast,
    train: pd.DataFrame,
    test: pd.DataFrame,
    *,
    exog_cols: tuple[str, ...],
    horizon: int = 28,
) -> ScenarioResult:
    """Two predictions, one with promo forced off, one with promo forced on."""
    log.info("Generating What-if scenarios (promo=0 vs promo=1)")

    p50_off = _predict_with_forced_promo(
        forecaster, test, exog_cols, promotion_value=0, horizon=horizon
    )
    p50_on = _predict_with_forced_promo(
        forecaster, test, exog_cols, promotion_value=1, horizon=horizon
    )

    # Flag SKUs with no promotion variation in training — model can't learn
    promo_history = (
        train.groupby("unique_id")["promotion"].sum().to_dict()
    )
    # Also check whether the two scenarios produce a meaningfully different forecast
    diff = (
        p50_on.groupby("unique_id")["y_hat"].sum()
        - p50_off.groupby("unique_id")["y_hat"].sum()
    )
    has_history = {
        sku: bool(promo_history.get(sku, 0) > 0 and abs(diff.get(sku, 0)) > SCENARIO_DIFF_THRESHOLD)
        for sku in train["unique_id"].unique()
    }

    n_with = sum(has_history.values())
    log.info(
        "Meaningful What-if signal: %d/%d SKUs (others: promotion=N/A in UI)",
        n_with,
        len(has_history),
    )

    # Clip negatives
    p50_off["y_hat"] = p50_off["y_hat"].clip(lower=0)
    p50_on["y_hat"] = p50_on["y_hat"].clip(lower=0)

    return ScenarioResult(
        p50_no_promo=p50_off,
        p50_with_promo=p50_on,
        has_promo_history=has_history,
    )


if __name__ == "__main__":
    from ml.features import load_and_build
    from ml.train import train_quantiles

    ff = load_and_build()
    tr = train_quantiles(ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon)
    sc = run_scenarios(
        tr.forecaster, ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon
    )
    print("\n=== promo=off head ===")
    print(sc.p50_no_promo.head())
    print("\n=== promo=on head ===")
    print(sc.p50_with_promo.head())
    print("\n=== SKUs with meaningful What-if signal ===")
    n = sum(sc.has_promo_history.values())
    print(f"{n} / {len(sc.has_promo_history)} SKUs")
