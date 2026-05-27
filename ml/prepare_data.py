"""
M5 subset extraction → long-format parquet for downstream feature engineering.

The full M5 dataset is ~30K SKUs × 1941 days. For a portfolio demo we use a
focused subset: 1 store (CA_1) × 50 SKUs distributed across 4 cosmetics
narrative buckets (스킨케어 / 메이크업 / 프래그런스 / 바디케어).

ASCII flow:

    sales_train_evaluation.csv (wide, ~30K rows × 1947 cols)
            │
            ▼  filter store_id=CA_1, dept_id ∈ SELECTED_DEPTS
    [~2.5K rows]
            │
            ▼  rank by mean daily sales within each dept, take top 13/13/12/12
    [50 rows, still wide]
            │
            ▼  melt d_1..d_1941 → long format
    [50 × 1941 ≈ 97K rows: item, date, sales]
            │
            ▼  join calendar.csv (date, events, snap, weekday)
            ▼  join sell_prices.csv (weekly price)
            ▼  derive promotion flag (price drop || event || snap)
            │
            ▼
    data/processed/subset.parquet

Usage:
    python -m ml.prepare_data
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ml.scenario_mapping import SELECTED_DEPTS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.prepare_data")

# ── Constants ─────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"

STORE_ID = "CA_1"
# 50 SKUs total across 4 depts.
SKUS_PER_DEPT: dict[str, int] = {
    "FOODS_1": 13,      # 스킨케어
    "FOODS_2": 13,      # 메이크업
    "HOBBIES_1": 12,    # 프래그런스
    "HOUSEHOLD_1": 12,  # 바디케어
}
PRICE_DROP_THRESHOLD = 0.05  # 5% drop week-over-week → flag as promo


def _read_sales(path: Path) -> pd.DataFrame:
    """Load wide sales, filter to store + selected depts."""
    log.info("Reading sales_train_evaluation.csv (this may take ~5s)")
    df = pd.read_csv(path)
    n_total = len(df)

    df = df[(df["store_id"] == STORE_ID) & (df["dept_id"].isin(SELECTED_DEPTS))]
    log.info(
        "Filtered: %d → %d rows (store=%s, depts=%s)",
        n_total,
        len(df),
        STORE_ID,
        list(SELECTED_DEPTS),
    )
    assert len(df) > 0, (
        f"No rows after filter. Check STORE_ID={STORE_ID} exists "
        f"and SELECTED_DEPTS={SELECTED_DEPTS} match M5 dept_id values."
    )
    return df


def _pick_top_skus(wide: pd.DataFrame) -> pd.DataFrame:
    """Rank by mean daily sales within each dept, keep top N per SKUS_PER_DEPT."""
    day_cols = [c for c in wide.columns if c.startswith("d_")]
    wide = wide.copy()
    wide["_mean_sales"] = wide[day_cols].mean(axis=1)

    picks: list[pd.DataFrame] = []
    for dept, n in SKUS_PER_DEPT.items():
        sub = wide[wide["dept_id"] == dept]
        if len(sub) < n:
            log.warning(
                "Only %d SKUs available in %s, requested %d", len(sub), dept, n
            )
        top = sub.nlargest(n, "_mean_sales")
        log.info(
            "  %s: picked %d/%d (mean sales: %.2f .. %.2f)",
            dept,
            len(top),
            len(sub),
            top["_mean_sales"].min(),
            top["_mean_sales"].max(),
        )
        picks.append(top)

    result = pd.concat(picks, ignore_index=True).drop(columns=["_mean_sales"])
    log.info("Total subset: %d SKUs", len(result))
    assert len(result) == sum(SKUS_PER_DEPT.values()), "SKU count mismatch"
    return result


def _melt_long(wide: pd.DataFrame) -> pd.DataFrame:
    """Wide (d_1..d_1941) → long (item_id × d × sales)."""
    id_cols = ["id", "item_id", "dept_id", "cat_id", "store_id", "state_id"]
    day_cols = [c for c in wide.columns if c.startswith("d_")]

    long = wide.melt(
        id_vars=id_cols,
        value_vars=day_cols,
        var_name="d",
        value_name="sales",
    )
    long["sales"] = long["sales"].astype("int32")
    log.info("Melted to long format: %d rows", len(long))
    return long


def _join_calendar(long: pd.DataFrame, cal_path: Path) -> pd.DataFrame:
    """Attach date + events + SNAP flag (CA only since STORE_ID=CA_1)."""
    cal = pd.read_csv(cal_path)
    cal = cal[
        [
            "d",
            "date",
            "wm_yr_wk",
            "wday",
            "month",
            "year",
            "event_name_1",
            "event_type_1",
            "snap_CA",
        ]
    ].rename(columns={"snap_CA": "snap"})

    merged = long.merge(cal, on="d", how="left")
    assert merged["date"].notna().all(), "calendar join produced NaN dates"
    merged["date"] = pd.to_datetime(merged["date"])
    log.info("Joined calendar: %d rows", len(merged))
    return merged


def _join_prices(long_cal: pd.DataFrame, prices_path: Path) -> pd.DataFrame:
    """Attach weekly sell_price for each (item × wm_yr_wk).

    sell_prices.csv is large (~200MB). We filter to STORE_ID and only items
    in the subset BEFORE merge, to keep memory bounded.
    """
    log.info("Reading sell_prices.csv (this may take ~10s)")
    items_in_subset = set(long_cal["item_id"].unique())

    prices = pd.read_csv(prices_path)
    prices = prices[
        (prices["store_id"] == STORE_ID) & (prices["item_id"].isin(items_in_subset))
    ]
    log.info("Filtered prices to %d rows", len(prices))

    merged = long_cal.merge(
        prices[["item_id", "wm_yr_wk", "sell_price"]],
        on=["item_id", "wm_yr_wk"],
        how="left",
    )
    # First weeks of an item's life can have NaN prices → forward fill within SKU,
    # then back-fill for any leading gaps. Items with no price ever get 0
    # (will be filtered downstream if sales are also 0).
    merged = merged.sort_values(["item_id", "date"]).reset_index(drop=True)
    merged["sell_price"] = (
        merged.groupby("item_id")["sell_price"].ffill().bfill().fillna(0.0)
    )
    log.info("Joined prices, NaN sell_prices: %d", merged["sell_price"].isna().sum())
    return merged


def _derive_promotion_flag(df: pd.DataFrame) -> pd.DataFrame:
    """Promotion = sustained price drop OR event day OR SNAP day.

    Heuristic — M5 doesn't have an explicit promo column. The proxy:
    a week with sell_price ≤ (1 - threshold) × rolling 4-week median is
    likely a promotional discount.
    """
    df = df.sort_values(["item_id", "date"]).copy()

    # Weekly rolling baseline price (28 days = 4 wm weeks of trailing context)
    baseline = (
        df.groupby("item_id")["sell_price"]
        .transform(lambda s: s.rolling(window=28, min_periods=7).median())
    )
    price_drop = (
        (df["sell_price"] < baseline * (1 - PRICE_DROP_THRESHOLD))
        & (df["sell_price"] > 0)
    )
    event = df["event_type_1"].notna()
    snap = df["snap"].astype(bool)

    df["promotion"] = (price_drop | event | snap).astype("int8")
    log.info(
        "Promotion flag: %d/%d rows (%.1f%%)",
        int(df["promotion"].sum()),
        len(df),
        100 * df["promotion"].mean(),
    )
    return df


def prepare_subset(
    *, raw_dir: Path = DATA_RAW, out_dir: Path = DATA_PROCESSED
) -> Path:
    """End-to-end pipeline. Returns path to the written parquet."""
    out_dir.mkdir(parents=True, exist_ok=True)

    sales_path = raw_dir / "sales_train_evaluation.csv"
    cal_path = raw_dir / "calendar.csv"
    prices_path = raw_dir / "sell_prices.csv"

    for p in (sales_path, cal_path, prices_path):
        assert p.exists(), f"Missing M5 file: {p}. Run kaggle download first."

    wide = _read_sales(sales_path)
    subset_wide = _pick_top_skus(wide)
    long = _melt_long(subset_wide)
    long_cal = _join_calendar(long, cal_path)
    full = _join_prices(long_cal, prices_path)
    full = _derive_promotion_flag(full)

    # Final tidy: drop M5 internal d column, keep useful cols
    keep_cols = [
        "item_id",
        "dept_id",
        "store_id",
        "date",
        "sales",
        "sell_price",
        "wday",
        "month",
        "year",
        "event_name_1",
        "event_type_1",
        "snap",
        "promotion",
    ]
    full = full[keep_cols]

    out_path = out_dir / "subset.parquet"
    full.to_parquet(out_path, index=False, compression="snappy")
    size_mb = out_path.stat().st_size / 1024 / 1024
    log.info(
        "✅ Written: %s (%.1f MB, %d rows, %d SKUs)",
        out_path,
        size_mb,
        len(full),
        full["item_id"].nunique(),
    )
    return out_path


if __name__ == "__main__":
    prepare_subset()
