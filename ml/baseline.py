"""
Statistical baselines for forecast comparison.

  Naive(7)     — forecast[t] = actual[t-7] (weekly seasonality)
  MA(28)       — forecast[t] = mean of last 28 days

These are the floor that LightGBM must beat in the model_comparison chart.
If LightGBM doesn't materially improve MAPE over these, that's a red flag
about feature engineering, not a clever architectural insight.

Returned DataFrame shape matches nixtla convention:
  unique_id | ds | model | y_hat
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.baseline")

NAIVE_SEASON = 7
MA_WINDOW = 28


def _future_dates(train: pd.DataFrame, horizon: int) -> pd.DatetimeIndex:
    """Continuous daily index for the horizon, anchored to last train date + 1."""
    last = train["ds"].max()
    return pd.date_range(last + pd.Timedelta(days=1), periods=horizon, freq="D")


def naive_seasonal(train: pd.DataFrame, *, horizon: int = 28) -> pd.DataFrame:
    """For each SKU: take last `NAIVE_SEASON` observed values and tile to horizon.

    Example with horizon=28, season=7: repeat the last 7 days four times.
    """
    rows: list[pd.DataFrame] = []
    future_idx = _future_dates(train, horizon)

    for sku, group in train.groupby("unique_id", sort=False):
        last_week = group.tail(NAIVE_SEASON)["y"].to_numpy()
        # Tile to horizon length, then trim
        tiled = np.tile(last_week, (horizon // NAIVE_SEASON) + 1)[:horizon]
        rows.append(
            pd.DataFrame(
                {
                    "unique_id": sku,
                    "ds": future_idx,
                    "model": "naive",
                    "y_hat": tiled,
                }
            )
        )
    out = pd.concat(rows, ignore_index=True)
    log.info("Naive(%d) forecast: %d rows × %d SKUs", NAIVE_SEASON, len(out), train["unique_id"].nunique())
    return out


def moving_average(train: pd.DataFrame, *, horizon: int = 28) -> pd.DataFrame:
    """For each SKU: forecast = constant mean of last MA_WINDOW days."""
    rows: list[pd.DataFrame] = []
    future_idx = _future_dates(train, horizon)

    for sku, group in train.groupby("unique_id", sort=False):
        last_window = group.tail(MA_WINDOW)["y"]
        mean = float(last_window.mean()) if len(last_window) else 0.0
        rows.append(
            pd.DataFrame(
                {
                    "unique_id": sku,
                    "ds": future_idx,
                    "model": "moving_average",
                    "y_hat": np.full(horizon, mean, dtype="float32"),
                }
            )
        )
    out = pd.concat(rows, ignore_index=True)
    log.info("MA(%d) forecast: %d rows × %d SKUs", MA_WINDOW, len(out), train["unique_id"].nunique())
    return out


def run_baselines(train: pd.DataFrame, *, horizon: int = 28) -> pd.DataFrame:
    """Return long-format predictions for all baselines.

    Columns: unique_id, ds, model, y_hat
    """
    parts = [naive_seasonal(train, horizon=horizon), moving_average(train, horizon=horizon)]
    out = pd.concat(parts, ignore_index=True)
    # Clip negatives — sales can't go below zero
    out["y_hat"] = out["y_hat"].clip(lower=0)
    return out


if __name__ == "__main__":
    from ml.features import load_and_build

    ff = load_and_build()
    preds = run_baselines(ff.train, horizon=ff.horizon)
    print(preds.head())
    print(f"\nTotal predictions: {len(preds)}")
    print(f"Per-model row counts:\n{preds['model'].value_counts()}")
    print(f"\nSample SKU naive forecast:")
    sample = preds[(preds["unique_id"] == preds["unique_id"].iloc[0]) & (preds["model"] == "naive")]
    print(sample.head(10))
