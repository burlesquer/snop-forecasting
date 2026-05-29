"""
Build a worked example JSON tracing one SKU end-to-end:
  raw data → engineered features → LightGBM prediction → inventory math → 권장 발주

Output: dashboard/public/data/worked_example.json

The methodology page renders this as a fully-numerical proof that every formula
in the doc was actually applied to produce the dashboard's recommendations.
The "ledger_check" section cross-references inventory_signals.json so the
viewer can verify nothing was hand-waved.

Picks the top-risk SKU (highest stockout_probability) since that's the most
illustrative case — it produces a non-trivial recommendation and showcases
how each part of the math drives the final number.
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("tools.build_worked_example")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SUBSET = PROJECT_ROOT / "data" / "processed" / "subset.parquet"
DATA_DIR = PROJECT_ROOT / "dashboard" / "public" / "data"

P10_P90_TO_SIGMA = 2.5631
LEAD_TIME = 7
HORIZON = 28
Z_95 = 1.6449
KRW_PER_UNIT = 12_000.0


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def build() -> Path:
    inv = json.loads((DATA_DIR / "inventory_signals.json").read_text(encoding="utf-8"))
    top_risk = inv["risk_top5"][0]
    sku_id = top_risk["sku"]["id"]
    sku_meta = top_risk["sku"]
    log.info("Worked example SKU: %s (%s)", sku_id, sku_meta["name"])

    subset = pd.read_parquet(SUBSET)
    subset["date"] = pd.to_datetime(subset["date"])
    sku_raw = (
        subset[subset["item_id"] == sku_id].sort_values("date").reset_index(drop=True)
    )

    # M5 standard: last 28 days are holdout
    max_date = subset["date"].max()
    train_end = max_date - pd.Timedelta(days=HORIZON)
    test_start = train_end + pd.Timedelta(days=1)

    # ── 1. Raw sample: last 14 train days ──────────────────────────
    sample = (
        sku_raw[sku_raw["date"] <= train_end]
        .tail(14)[["date", "sales", "sell_price", "promotion", "snap", "event_type_1"]]
    )
    raw_rows = []
    for row in sample.itertuples(index=False):
        raw_rows.append(
            [
                row.date.strftime("%Y-%m-%d"),
                int(row.sales),
                float(row.sell_price) if not pd.isna(row.sell_price) else None,
                int(row.promotion),
                int(row.snap),
                str(row.event_type_1) if not pd.isna(row.event_type_1) else None,
            ]
        )

    # ── 2. Feature snapshot at the train-end boundary ─────────────
    history = sku_raw[sku_raw["date"] <= train_end]["sales"].to_numpy()
    lag7 = float(history[-7])
    lag14 = float(history[-14])
    lag28 = float(history[-28])
    rolling_mean_7 = float(history[-7:].mean())
    rolling_mean_28 = float(history[-28:].mean())
    rolling_std_7 = float(history[-7:].std(ddof=1))
    weekday_names = ["월", "화", "수", "목", "금", "토", "일"]

    features = [
        {
            "name": "lag7",
            "description": "7일 전 실적 (요일 효과 포착)",
            "value": lag7,
        },
        {
            "name": "lag14",
            "description": "14일 전 실적",
            "value": lag14,
        },
        {
            "name": "lag28",
            "description": "28일 전 실적 (4주 주기성)",
            "value": lag28,
        },
        {
            "name": "rolling_mean_7",
            "description": "최근 7일 평균",
            "value": round(rolling_mean_7, 2),
        },
        {
            "name": "rolling_mean_28",
            "description": "최근 28일 평균 (수요 레벨)",
            "value": round(rolling_mean_28, 2),
        },
        {
            "name": "rolling_std_7",
            "description": "최근 7일 표준편차 (최근 변동성)",
            "value": round(rolling_std_7, 2),
        },
        {
            "name": "wday",
            "description": f"요일 ({weekday_names[test_start.weekday()]}요일)",
            "value": int(test_start.weekday()),
        },
        {
            "name": "month",
            "description": f"월 ({test_start.month}월)",
            "value": int(test_start.month),
        },
    ]

    # ── 3. Predictions from forecasts.json ────────────────────────
    forecasts = json.loads((DATA_DIR / "forecasts.json").read_text(encoding="utf-8"))
    series = next(s for s in forecasts["skus"] if s["sku"]["id"] == sku_id)
    p10 = series["p10"]
    p50 = series["p50"]
    p90 = series["p90"]
    first_idx = next(i for i, v in enumerate(p50) if v is not None)

    p10_arr = [v for v in p10 if v is not None]
    p50_arr = [v for v in p50 if v is not None]
    p90_arr = [v for v in p90 if v is not None]

    prediction = {
        "description": f"LightGBM 3-모델 inference 결과 (예측 시작일: {test_start.strftime('%Y-%m-%d')})",
        "day1": {
            "date": test_start.strftime("%Y-%m-%d"),
            "p10": round(p10[first_idx], 2),
            "p50": round(p50[first_idx], 2),
            "p90": round(p90[first_idx], 2),
        },
        "horizon_total": {
            "p10": round(sum(p10_arr), 1),
            "p50": round(sum(p50_arr), 1),
            "p90": round(sum(p90_arr), 1),
        },
    }

    # ── 4. Inventory math chain (mirrors ml/inventory.py) ──────────
    current_stock = int(top_risk["current_stock"])
    demand_28d = sum(p50_arr)
    horizon_p10 = sum(p10_arr)
    horizon_p90 = sum(p90_arr)

    # Daily σ averaged across the horizon, then scaled to lead time
    daily_sigmas = [
        (p90_arr[i] - p10_arr[i]) / P10_P90_TO_SIGMA for i in range(len(p50_arr))
    ]
    sigma_daily_mean = sum(daily_sigmas) / len(daily_sigmas)
    sigma_lead_for_ss = sigma_daily_mean * math.sqrt(LEAD_TIME)
    ss = Z_95 * sigma_lead_for_ss

    # Phase 1: lead-time stockout prob (no order arrival yet)
    lead_p50 = sum(p50_arr[:LEAD_TIME])
    lead_p10 = sum(p10_arr[:LEAD_TIME])
    lead_p90 = sum(p90_arr[:LEAD_TIME])
    sigma_lead_actual = (lead_p90 - lead_p10) / P10_P90_TO_SIGMA
    z_lead = (current_stock - lead_p50) / sigma_lead_actual
    p_lead = max(0.0, min(1.0, 1.0 - _normal_cdf(z_lead)))

    # Phase 2: full-horizon stockout prob (no order)
    sigma_horizon = (horizon_p90 - horizon_p10) / P10_P90_TO_SIGMA
    z_horizon = (current_stock - demand_28d) / sigma_horizon
    p_horizon = max(0.0, min(1.0, 1.0 - _normal_cdf(z_horizon)))

    p_stockout = max(p_lead, p_horizon)

    rec = max(0, int(math.ceil(demand_28d + ss - current_stock)))
    revenue_loss = p_stockout * demand_28d * KRW_PER_UNIT

    math_steps = [
        {
            "step": 1,
            "label": "28일 총 수요 추정",
            "expression": "demand_28d = Σ P50[0:28]",
            "value": round(demand_28d, 1),
            "unit": "units",
        },
        {
            "step": 2,
            "label": "Lead-time(7일) 평균 수요",
            "expression": "μ_lead = Σ P50[0:7]",
            "value": round(lead_p50, 1),
            "unit": "units",
        },
        {
            "step": 3,
            "label": "Lead-time σ (P90-P10 spread에서 역산)",
            "expression": f"σ_lead = (Σ P90[0:7] − Σ P10[0:7]) / 2.5631 = ({round(lead_p90,1)} − {round(lead_p10,1)}) / 2.5631",
            "value": round(sigma_lead_actual, 2),
            "unit": "units",
        },
        {
            "step": 4,
            "label": "안전재고 (Z=1.6449, 95% 서비스)",
            "expression": f"SS = Z × σ_daily × √L = 1.6449 × {round(sigma_daily_mean,2)} × √7",
            "value": round(ss, 1),
            "unit": "units",
        },
        {
            "step": 5,
            "label": "현재고 (해시 합성치)",
            "expression": "round(daily_demand × stock_days_hash)",
            "value": current_stock,
            "unit": "units",
        },
        {
            "step": 6,
            "label": "Lead-time 결품 확률",
            "expression": (
                f"P_lead = 1 − Φ(({current_stock} − {round(lead_p50,1)}) / "
                f"{round(sigma_lead_actual,2)}) = 1 − Φ({round(z_lead,2)})"
            ),
            "value": round(p_lead, 3),
            "unit": "probability",
        },
        {
            "step": 7,
            "label": "28일 horizon 결품 확률 (무발주)",
            "expression": (
                f"P_horizon = 1 − Φ(({current_stock} − {round(demand_28d,1)}) / "
                f"{round(sigma_horizon,2)}) = 1 − Φ({round(z_horizon,2)})"
            ),
            "value": round(p_horizon, 3),
            "unit": "probability",
        },
        {
            "step": 8,
            "label": "최종 결품 확률 (worst case)",
            "expression": (
                f"P_stockout = max(P_lead, P_horizon) = max({round(p_lead,3)}, "
                f"{round(p_horizon,3)})"
            ),
            "value": round(p_stockout, 3),
            "unit": "probability",
        },
        {
            "step": 9,
            "label": "권장 발주",
            "expression": (
                f"rec = max(0, ⌈demand_28d + SS − stock⌉) = "
                f"⌈{round(demand_28d,1)} + {round(ss,1)} − {current_stock}⌉"
            ),
            "value": rec,
            "unit": "units",
        },
        {
            "step": 10,
            "label": "예상 매출 손실 (이 SKU만)",
            "expression": f"P_stockout × demand_28d × ₩{int(KRW_PER_UNIT):,}",
            "value": round(revenue_loss, 0),
            "unit": "KRW",
        },
    ]

    # ── 5. Ledger check: cross-reference inventory_signals.json ────
    ledger = {
        "description": (
            "위 계산이 inventory_signals.json에 저장된 값과 일치하는지 검증. "
            "수치가 일치한다면 backend(Python)와 worked example이 같은 공식을 적용하고 있다는 증거."
        ),
        "computed_stockout_probability": round(p_stockout, 3),
        "stored_stockout_probability": round(top_risk["stockout_probability"], 3),
        "computed_recommended_order": rec,
        "stored_recommended_order": int(top_risk["recommended_order"]),
        "computed_safety_stock": round(ss, 1),
        "stored_safety_stock": round(top_risk["safety_stock"], 1),
        "match": (
            abs(round(p_stockout, 3) - round(top_risk["stockout_probability"], 3)) < 0.01
            and rec == int(top_risk["recommended_order"])
        ),
    }

    output = {
        "sku": sku_meta,
        "train_end_date": train_end.strftime("%Y-%m-%d"),
        "prediction_start_date": test_start.strftime("%Y-%m-%d"),
        "raw_sample": {
            "description": "원천 데이터 — M5 일별 매출 + 가격 + 프로모션 + SNAP + 이벤트",
            "columns": ["date", "sales", "sell_price", "promotion", "snap", "event"],
            "rows": raw_rows,
        },
        "features": {
            "description": (
                f"학습 끝 시점 ({train_end.strftime('%Y-%m-%d')})에서 추출한 feature snapshot — "
                "이 값들로 LightGBM이 다음 28일을 예측"
            ),
            "items": features,
        },
        "prediction": prediction,
        "inventory_math": math_steps,
        "ledger_check": ledger,
    }

    output_path = DATA_DIR / "worked_example.json"
    output_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log.info("✅ Written %s — ledger match: %s", output_path.name, ledger["match"])
    return output_path


if __name__ == "__main__":
    build()
