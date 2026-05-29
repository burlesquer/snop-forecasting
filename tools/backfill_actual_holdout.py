"""
One-shot backfill: inject `actual_holdout` into the existing forecasts.json.

Why this exists:
  The Python pipeline (ml.build_dashboard_data) is the source of truth, but
  rebuilding it requires `shap` which may not be installed locally during
  iterative dashboard work. This script reads the subset parquet directly,
  matches actuals to existing forecast dates per SKU, and patches
  forecasts.json in place. Idempotent.

  After running, regenerate TS types with:
    python -m tools.generate_ts_types

Usage:
  python -m tools.backfill_actual_holdout
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("tools.backfill_actual_holdout")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SUBSET_PARQUET = PROJECT_ROOT / "data" / "processed" / "subset.parquet"
FORECASTS_JSON = PROJECT_ROOT / "dashboard" / "public" / "data" / "forecasts.json"


def backfill() -> None:
    if not SUBSET_PARQUET.exists():
        raise FileNotFoundError(f"Missing {SUBSET_PARQUET}")
    if not FORECASTS_JSON.exists():
        raise FileNotFoundError(f"Missing {FORECASTS_JSON}")

    subset = pd.read_parquet(SUBSET_PARQUET)
    # subset has raw M5 columns (date, sales) not the renamed pipeline columns
    # (ds, y). Build a (item_id, date_str) -> sales lookup. Same SKUs can have
    # multiple rows per date if the subset spans stores — group + sum so we get
    # total demand per SKU-date (mirrors what ml.features does).
    subset["date_str"] = pd.to_datetime(subset["date"]).dt.strftime("%Y-%m-%d")
    grouped = subset.groupby(["item_id", "date_str"], as_index=False)["sales"].sum()
    actual_lookup: dict[tuple[str, str], float] = {
        (row.item_id, row.date_str): float(row.sales)
        for row in grouped.itertuples(index=False)
    }
    log.info("Loaded %d (item_id, date) → sales rows from subset", len(actual_lookup))

    with FORECASTS_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)

    horizon = data.get("horizon_days", 28)
    skus = data.get("skus", [])
    if not skus:
        raise ValueError("forecasts.json has no SKUs")

    patched = 0
    for series in skus:
        sku_id = series["sku"]["id"]
        dates = series["dates"]
        p50 = series["p50"]
        # actual_holdout aligned to dates: non-null only where p50 is non-null
        # (i.e., the forecast/holdout window). Train dates stay None.
        actual_holdout: list[float | None] = []
        for date_str, p in zip(dates, p50):
            if p is None:
                actual_holdout.append(None)
                continue
            val = actual_lookup.get((sku_id, date_str))
            actual_holdout.append(round(val, 4) if val is not None else None)
        series["actual_holdout"] = actual_holdout
        patched += 1

    with FORECASTS_JSON.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    log.info(
        "Patched %d SKUs with actual_holdout (horizon %d) → %s",
        patched,
        horizon,
        FORECASTS_JSON.name,
    )


if __name__ == "__main__":
    backfill()
