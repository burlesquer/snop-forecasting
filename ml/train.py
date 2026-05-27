"""
LightGBM × 3 quantiles via nixtla mlforecast.

Three separately-trained LightGBM models:
  P10 — objective='quantile', alpha=0.1
  P50 — objective='tweedie' (M5-winner recipe for sparse count data)
  P90 — objective='quantile', alpha=0.9

mlforecast handles lag features and date features internally based on
configuration. Exogenous features (price, promotion, snap, event_code)
are passed through as columns.

ASCII flow:

    FeatureFrame (train+test, exog cols, horizon)
            │
            ▼   MLForecast(models, lags=[7,14,28], date_features=...)
        .fit(train, static_features=[])
            │
            ▼   .predict(h=28, X_df=test[exog])
    Long-format predictions per model
            │
            ▼   quantile crossing guardrail (P10 ≤ P50 ≤ P90, monotone sort if violated)
            ▼
    TrainResult(predictions, fitted_forecaster)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from mlforecast import MLForecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.train")

# Quantile config — names map to dashboard p10/p50/p90 fields
QUANTILE_MODELS: dict[str, dict[str, Any]] = {
    "lgb_p10": {"objective": "quantile", "alpha": 0.1},
    "lgb_p50": {"objective": "tweedie", "tweedie_variance_power": 1.1},
    "lgb_p90": {"objective": "quantile", "alpha": 0.9},
}

# Shared LightGBM hyper-params. Conservative defaults — this is a portfolio
# demo, not a contest entry. CPU only, deterministic seed.
LGB_BASE = {
    "n_estimators": 200,
    "learning_rate": 0.05,
    "num_leaves": 64,
    "min_child_samples": 20,
    "verbosity": -1,
    "random_state": 42,
    "n_jobs": -1,
}

LAGS = [7, 14, 28]
DATE_FEATURES = ["dayofweek", "day", "month"]


@dataclass
class TrainResult:
    predictions: pd.DataFrame          # unique_id, ds, model, y_hat (long)
    forecaster: MLForecast              # fitted, retained for SHAP + scenarios
    feature_names: list[str]            # final feature columns used by LightGBM
    train_seconds: float


def _build_models() -> dict[str, LGBMRegressor]:
    return {
        name: LGBMRegressor(**LGB_BASE, **kw) for name, kw in QUANTILE_MODELS.items()
    }


def _enforce_monotonic_quantiles(wide_preds: pd.DataFrame) -> pd.DataFrame:
    """Fix quantile crossing if P10 > P50 or P50 > P90 on any row.

    LightGBM quantile regression can violate ordering. The standard
    remedy is sorting per-row across (P10, P50, P90).
    """
    arr = wide_preds[["lgb_p10", "lgb_p50", "lgb_p90"]].to_numpy()
    n_violations = int(((arr[:, 0] > arr[:, 1]) | (arr[:, 1] > arr[:, 2])).sum())
    if n_violations > 0:
        sorted_arr = np.sort(arr, axis=1)
        wide_preds[["lgb_p10", "lgb_p50", "lgb_p90"]] = sorted_arr
        log.warning(
            "Fixed quantile crossing on %d/%d rows via monotone sort",
            n_violations,
            len(wide_preds),
        )
    else:
        log.info("Quantile order OK on all %d rows", len(wide_preds))
    # Clip floor at 0 — sales can't be negative
    wide_preds[["lgb_p10", "lgb_p50", "lgb_p90"]] = (
        wide_preds[["lgb_p10", "lgb_p50", "lgb_p90"]].clip(lower=0)
    )
    return wide_preds


def train_quantiles(
    train: pd.DataFrame,
    test: pd.DataFrame,
    *,
    exog_cols: tuple[str, ...],
    horizon: int = 28,
) -> TrainResult:
    """Fit LightGBM × 3 quantiles, return long-format predictions + forecaster."""
    import time

    log.info(
        "Training LightGBM × 3 quantiles | train=%d, test=%d, horizon=%d, exog=%s",
        len(train),
        len(test),
        horizon,
        list(exog_cols),
    )

    fcst = MLForecast(
        models=_build_models(),
        freq="D",
        lags=LAGS,
        date_features=DATE_FEATURES,
    )

    t0 = time.time()
    # Empty static_features so all exog cols are treated as dynamic (time-varying)
    fcst.fit(train, static_features=[])
    train_dt = time.time() - t0
    log.info("Training done in %.1fs", train_dt)

    # Future exogenous values come from the test split (known calendar/price/etc)
    x_future = test[["unique_id", "ds", *exog_cols]].copy()
    wide_preds = fcst.predict(h=horizon, X_df=x_future)
    wide_preds = _enforce_monotonic_quantiles(wide_preds)

    # Wide → long: one row per (sku, date, model)
    long = wide_preds.melt(
        id_vars=["unique_id", "ds"],
        value_vars=["lgb_p10", "lgb_p50", "lgb_p90"],
        var_name="model",
        value_name="y_hat",
    )
    # Rename model column for dashboard consistency
    long["model"] = long["model"].map(
        {"lgb_p10": "lightgbm_p10", "lgb_p50": "lightgbm", "lgb_p90": "lightgbm_p90"}
    )

    # Extract feature names from the fitted forecaster for SHAP later
    sample_model = fcst.models_["lgb_p50"]
    feature_names = list(sample_model.feature_name_)
    log.info("Model features (%d): %s", len(feature_names), feature_names)

    return TrainResult(
        predictions=long,
        forecaster=fcst,
        feature_names=feature_names,
        train_seconds=train_dt,
    )


if __name__ == "__main__":
    from ml.features import load_and_build

    ff = load_and_build()
    result = train_quantiles(
        ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon
    )
    print("\n=== Predictions (head) ===")
    print(result.predictions.head(15))
    print("\n=== Per-model counts ===")
    print(result.predictions.groupby("model")["y_hat"].agg(["count", "mean", "min", "max"]))
    print(f"\n=== Training time: {result.train_seconds:.1f}s ===")
