"""
Feature engineering for nixtla MLForecast.

mlforecast computes lags, rolling means, and date features internally given
configuration. This module's job is to:
  1. Rename columns to nixtla convention (unique_id, ds, y)
  2. Select and encode exogenous features (price, promotion, event, snap)
  3. Provide a clean train/test split utility (last N days = holdout)

ASCII flow:

    data/processed/subset.parquet
            │
            ▼  rename: item_id→unique_id, date→ds, sales→y
            │  encode: event_type_1 → label code
            │  select: y + exogenous columns
            ▼
    DataFrame ready for MLForecast.fit(...)

    split_train_test(df, holdout_days=28) → (train, test)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.features")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"

# Holdout window matches M5 contest standard and our forecast horizon
HOLDOUT_DAYS = 28

# Exogenous (known-future) features used by MLForecast
EXOG_COLS: tuple[str, ...] = ("sell_price", "promotion", "snap", "event_code")


@dataclass(frozen=True)
class FeatureFrame:
    """Bundle of train/test frames + holdout horizon. Immutable for clarity."""

    train: pd.DataFrame
    test: pd.DataFrame
    exog_cols: tuple[str, ...]
    horizon: int


def _encode_events(df: pd.DataFrame) -> pd.DataFrame:
    """event_type_1 is a sparse categorical ('Sporting', 'Cultural', 'National',
    'Religious', NaN). Convert to a small integer code so LightGBM can use it
    without pandas Categorical dtype quirks at predict-time.
    """
    df = df.copy()
    df["event_type_1"] = df["event_type_1"].fillna("none")
    # Stable order so codes are reproducible across runs
    mapping = {name: idx for idx, name in enumerate(sorted(df["event_type_1"].unique()))}
    df["event_code"] = df["event_type_1"].map(mapping).astype("int8")
    log.info("Event encoding: %s", mapping)
    return df


def build_features(subset_df: pd.DataFrame) -> pd.DataFrame:
    """Convert the M5 subset into a nixtla-ready DataFrame.

    Output columns:
        unique_id (str) — SKU identifier
        ds        (datetime) — daily date
        y         (float)    — target sales count
        sell_price, promotion, snap, event_code — exogenous features
    """
    df = subset_df.copy()
    df = _encode_events(df)

    df = df.rename(columns={"item_id": "unique_id", "date": "ds", "sales": "y"})
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = df["y"].astype("float32")
    df["sell_price"] = df["sell_price"].astype("float32")
    df["promotion"] = df["promotion"].astype("int8")
    df["snap"] = df["snap"].astype("int8")

    keep = ["unique_id", "ds", "y", *EXOG_COLS]
    df = df[keep].sort_values(["unique_id", "ds"]).reset_index(drop=True)

    n_skus = df["unique_id"].nunique()
    log.info("Features built: %d rows, %d SKUs", len(df), n_skus)
    return df


def split_train_test(
    df: pd.DataFrame, *, holdout_days: int = HOLDOUT_DAYS
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split by date: last `holdout_days` per SKU go to test set.

    M5 series share a common end date so a global cutoff works. We compute
    it from the data rather than hardcoding.
    """
    cutoff = df["ds"].max() - pd.Timedelta(days=holdout_days - 1)
    train = df[df["ds"] < cutoff].reset_index(drop=True)
    test = df[df["ds"] >= cutoff].reset_index(drop=True)
    log.info(
        "Split @ %s: train=%d (%s..%s), test=%d (%s..%s)",
        cutoff.date(),
        len(train),
        train["ds"].min().date(),
        train["ds"].max().date(),
        len(test),
        test["ds"].min().date(),
        test["ds"].max().date(),
    )
    assert (
        test.groupby("unique_id").size().unique().tolist() == [holdout_days]
    ), "Test split should have exactly holdout_days rows per SKU"
    return train, test


def load_and_build(parquet_path: Path | None = None) -> FeatureFrame:
    """Convenience: load subset.parquet from disk, build features, split."""
    path = parquet_path or (DATA_PROCESSED / "subset.parquet")
    assert path.exists(), f"Run prepare_data first; missing {path}"
    log.info("Loading %s", path)
    subset = pd.read_parquet(path)

    features = build_features(subset)
    train, test = split_train_test(features)
    return FeatureFrame(
        train=train, test=test, exog_cols=EXOG_COLS, horizon=HOLDOUT_DAYS
    )


if __name__ == "__main__":
    ff = load_and_build()
    print(ff.train.head())
    print("\nDtypes:")
    print(ff.train.dtypes)
    print(f"\nTrain shape: {ff.train.shape}, Test shape: {ff.test.shape}")
    print(f"Horizon: {ff.horizon} days, exog: {ff.exog_cols}")
