"""
Model evaluation: MAPE / WAPE / bias on the 28-day holdout.

Three classic metrics:
  MAPE  — Mean Absolute Percentage Error. Masks y_true=0 rows to avoid div-by-zero.
  WAPE  — Weighted Absolute Percentage Error = Σ|err| / Σ|y_true|. Robust to zeros,
          the M5 contest's preferred proxy.
  bias  — Mean signed error. Negative = under-forecast on average.

Output feeds the Analyst-tab "model comparison" bar chart.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.evaluate")


@dataclass(frozen=True)
class Metrics:
    model: str
    mape: float
    wape: float
    bias: float
    n_rows: int


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """MAPE with masking — exclude y_true == 0 rows."""
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def _wape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = float(np.sum(np.abs(y_true)))
    if denom == 0:
        return float("nan")
    return float(np.sum(np.abs(y_true - y_pred)) / denom)


def _bias(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(y_pred - y_true))


def compute_metrics(
    test: pd.DataFrame, predictions: pd.DataFrame
) -> list[Metrics]:
    """Evaluate every distinct model in `predictions` against `test.y`.

    Arguments
    ---------
    test : columns = unique_id, ds, y
    predictions : columns = unique_id, ds, model, y_hat
    """
    # Inner join on (unique_id, ds) — keeps only rows we have ground truth for.
    merged = predictions.merge(
        test[["unique_id", "ds", "y"]], on=["unique_id", "ds"], how="inner"
    )
    assert len(merged) > 0, "No overlap between predictions and test set"

    results: list[Metrics] = []
    for model_name, group in merged.groupby("model", sort=False):
        y_true = group["y"].to_numpy()
        y_pred = group["y_hat"].to_numpy()
        results.append(
            Metrics(
                model=str(model_name),
                mape=_mape(y_true, y_pred),
                wape=_wape(y_true, y_pred),
                bias=_bias(y_true, y_pred),
                n_rows=len(group),
            )
        )

    log.info("Evaluated %d model(s)", len(results))
    for m in results:
        log.info(
            "  %-15s | MAPE=%.3f  WAPE=%.3f  bias=%+.3f  (n=%d)",
            m.model,
            m.mape,
            m.wape,
            m.bias,
            m.n_rows,
        )
    return results


def assert_quantile_monotonicity(predictions: pd.DataFrame) -> None:
    """Raise if any P10 > P50 or P50 > P90 row exists in the predictions.

    The training step already enforces monotone sort, but this is a paranoid
    re-check before publishing to the dashboard.
    """
    needed = {"lightgbm_p10", "lightgbm", "lightgbm_p90"}
    if not needed.issubset(set(predictions["model"].unique())):
        log.warning("Skipping monotonicity check — missing model(s)")
        return

    wide = predictions[predictions["model"].isin(needed)].pivot_table(
        index=["unique_id", "ds"], columns="model", values="y_hat"
    )
    bad = (wide["lightgbm_p10"] > wide["lightgbm"]) | (
        wide["lightgbm"] > wide["lightgbm_p90"]
    )
    n_bad = int(bad.sum())
    assert n_bad == 0, f"{n_bad} rows violate P10 ≤ P50 ≤ P90 (should be 0)"
    log.info("Quantile monotonicity: PASS (%d rows)", len(wide))


if __name__ == "__main__":
    from ml.baseline import run_baselines
    from ml.features import load_and_build
    from ml.train import train_quantiles

    ff = load_and_build()
    base = run_baselines(ff.train, horizon=ff.horizon)
    tr = train_quantiles(ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon)
    all_preds = pd.concat([base, tr.predictions], ignore_index=True)

    assert_quantile_monotonicity(all_preds)
    metrics = compute_metrics(ff.test, all_preds)
    for m in metrics:
        print(m)
