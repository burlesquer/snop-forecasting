"""
SHAP explanations on the P50 LightGBM model.

Two outputs feed the Analyst tab:
  1. Global summary — mean |SHAP| per feature → bar chart (feature importance
     but causal-direction-aware, unlike LightGBM's split-count importance).
  2. Top 5 SKU force breakdowns — individual prediction decomposition for
     the user to click through and understand "why did the model predict X
     for this SKU?".

SHAP TreeExplainer is fast on LightGBM (no sampling needed); we limit the
background sample to MAX_BACKGROUND_ROWS for memory safety as scale grows.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
import shap

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ml.explain")

MAX_BACKGROUND_ROWS = 1000
TOP_K_SKUS = 5
TOP_K_FEATURES = 10

# Korean display labels for raw feature names
FEATURE_NAME_KR: dict[str, str] = {
    "sell_price": "판매가",
    "promotion": "프로모션",
    "snap": "SNAP",
    "event_code": "이벤트",
    "lag7": "지난 주 판매",
    "lag14": "2주 전 판매",
    "lag28": "지난 달 판매",
    "dayofweek": "요일",
    "day": "월중일",
    "month": "월",
}


@dataclass
class ShapSummaryRow:
    name: str
    name_kr: str
    mean_abs_shap: float


@dataclass
class ShapForceFeature:
    name: str
    name_kr: str
    feature_value: float
    shap_contribution: float


@dataclass
class ShapForce:
    sku_id: str
    base_value: float
    prediction: float
    top_features: list[ShapForceFeature]


@dataclass
class ShapResult:
    feature_count: int
    sample_size: int
    summary: list[ShapSummaryRow]
    top_sku_forces: list[ShapForce]


def _build_explain_frame(
    forecaster, test: pd.DataFrame
) -> tuple[pd.DataFrame, np.ndarray, list[str]]:
    """Reconstruct the design matrix used at predict time for SHAP input.

    mlforecast doesn't expose the predict-time feature matrix directly, so
    we approximate using the last in-sample row per SKU (the row whose lags
    are derived from the most recent training observations).
    """
    # The forecaster's stored series have lags computed already.
    # We recover the design matrix by calling forecaster.preprocess on a
    # one-step horizon over the test window.
    sample = forecaster.preprocess(test, static_features=[])
    # preprocess returns df with all features. Filter to feature_name_ order.
    sample_model = forecaster.models_["lgb_p50"]
    feature_names = list(sample_model.feature_name_)

    # Some lag columns may be NaN for the very first rows; drop those
    X = sample.dropna(subset=feature_names).copy()
    return X, X[feature_names].to_numpy(dtype="float32"), feature_names


def compute_shap(forecaster, train: pd.DataFrame) -> ShapResult:
    """Run SHAP TreeExplainer on the P50 model.

    `train` is used as the SHAP background dataset — sampled down to
    MAX_BACKGROUND_ROWS for speed.
    """
    p50_model = forecaster.models_["lgb_p50"]
    feature_names = list(p50_model.feature_name_)

    # Reconstruct training design matrix via mlforecast's preprocess
    preprocessed = forecaster.preprocess(train, static_features=[])
    available = preprocessed.dropna(subset=feature_names)
    bg = available.sample(
        n=min(MAX_BACKGROUND_ROWS, len(available)),
        random_state=42,
    )
    X_bg = bg[feature_names].to_numpy(dtype="float32")

    log.info(
        "SHAP background: %d rows × %d features", len(bg), len(feature_names)
    )

    explainer = shap.TreeExplainer(p50_model)
    shap_values_bg = explainer.shap_values(X_bg)
    base_value = float(explainer.expected_value)

    # ── Global summary ─────────────────────────────────────────
    mean_abs = np.abs(shap_values_bg).mean(axis=0)
    summary = [
        ShapSummaryRow(
            name=name,
            name_kr=FEATURE_NAME_KR.get(name, name),
            mean_abs_shap=float(mean_abs[i]),
        )
        for i, name in enumerate(feature_names)
    ]
    summary.sort(key=lambda r: r.mean_abs_shap, reverse=True)
    log.info(
        "SHAP top-5 global features: %s",
        [f"{r.name}={r.mean_abs_shap:.2f}" for r in summary[:5]],
    )

    # ── Top-K SKU force breakdowns ─────────────────────────────
    # Pick the 5 SKUs with the highest mean P50 (most "interesting" volumes)
    sku_p50 = (
        preprocessed.dropna(subset=feature_names)
        .groupby("unique_id")
        .tail(1)  # last-row per SKU is the most recent state
    )
    sku_p50["__pred__"] = p50_model.predict(sku_p50[feature_names].to_numpy(dtype="float32"))
    top_skus = sku_p50.nlargest(TOP_K_SKUS, "__pred__")

    forces: list[ShapForce] = []
    X_top = top_skus[feature_names].to_numpy(dtype="float32")
    shap_top = explainer.shap_values(X_top)

    for i, (_, row) in enumerate(top_skus.iterrows()):
        contributions = shap_top[i]
        order = np.argsort(np.abs(contributions))[::-1][:TOP_K_FEATURES]
        feats = [
            ShapForceFeature(
                name=feature_names[j],
                name_kr=FEATURE_NAME_KR.get(feature_names[j], feature_names[j]),
                feature_value=float(row[feature_names[j]]),
                shap_contribution=float(contributions[j]),
            )
            for j in order
        ]
        forces.append(
            ShapForce(
                sku_id=str(row["unique_id"]),
                base_value=base_value,
                prediction=float(row["__pred__"]),
                top_features=feats,
            )
        )

    return ShapResult(
        feature_count=len(feature_names),
        sample_size=len(bg),
        summary=summary,
        top_sku_forces=forces,
    )


if __name__ == "__main__":
    from ml.features import load_and_build
    from ml.train import train_quantiles

    ff = load_and_build()
    tr = train_quantiles(ff.train, ff.test, exog_cols=ff.exog_cols, horizon=ff.horizon)
    sh = compute_shap(tr.forecaster, ff.train)

    print(f"\nSHAP background: {sh.sample_size} rows × {sh.feature_count} features")
    print("\n=== Global summary (top 5) ===")
    for s in sh.summary[:5]:
        print(f"  {s.name:14s} ({s.name_kr}) mean |SHAP| = {s.mean_abs_shap:.3f}")
    print("\n=== First SKU force breakdown ===")
    f = sh.top_sku_forces[0]
    print(f"  SKU={f.sku_id} base={f.base_value:.2f} pred={f.prediction:.2f}")
    for ff_ in f.top_features[:5]:
        print(
            f"  {ff_.name:14s} value={ff_.feature_value:.2f} SHAP={ff_.shap_contribution:+.3f}"
        )
