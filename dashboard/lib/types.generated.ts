// AUTO-GENERATED from ml/schema.py via tools/generate_ts_types.py
// Do NOT edit by hand — regenerate with: python -m tools.generate_ts_types
// Last generated: 2026-05-27T17:58:47
// Schema drift between Python and TypeScript will fail the build.

export interface KPI {
  label: string;
  /** Pre-formatted display string (₩, %, etc) */
  value: string;
  /** Raw number for sorting/threshold */
  value_raw: number;
  /** Change vs prior period in percentage points (kept for legacy) */
  delta_pp: number | null;
  /** Pre-formatted contextual comparison line shown under the KPI value. Each KPI gets one — e.g., 'Naive 대비 ▲11.4%p' or '목표 12회 대비 ▲10.4회'. */
  delta_label: string | null;
  /** Color of the delta label text */
  delta_tone: "good" | "bad" | "neutral";
  unit: "pct" | "won" | "count" | "ratio";
  /** Drives KPI card border tint */
  direction: "good" | "warn" | "bad";
}

export interface KPIsJSON {
  forecast_accuracy: KPI;
  inventory_turnover: KPI;
  service_level: KPI;
  risk_sku_count: KPI;
  cash_trapped: KPI;
}

export interface ModelMetrics {
  model: "naive" | "moving_average" | "lightgbm";
  display_name: string;
  /** Mean Absolute Percentage Error (0-1) */
  mape: number;
  /** Weighted Absolute Percentage Error */
  wape: number;
  /** Signed mean error, negative = under-forecast */
  bias: number;
  training_seconds: number | null;
}

export interface ModelComparisonJSON {
  holdout_days: number;
  models: ModelMetrics[];
}

export interface SHAPFeatureSummary {
  /** Internal feature name */
  name: string;
  /** Korean display label */
  name_kr: string;
  /** Global importance */
  mean_abs_shap: number;
}

export interface SHAPForceFeature {
  name: string;
  name_kr: string;
  /** Raw feature value for this SKU */
  feature_value: number;
  /** Signed SHAP value (push toward / away from prediction) */
  shap_contribution: number;
}

export interface SKUMeta {
  /** M5 item_id, stable */
  id: string;
  /** Korean cosmetics display name */
  name: string;
  /** Korean display category */
  category: string;
  /** Original M5 cat (FOODS_1 etc) */
  category_raw: string;
}

export interface ForecastSeries {
  sku: SKUMeta;
  /** ISO yyyy-mm-dd */
  dates: string[];
  historical: (number | null)[];
  /** Quantile 0.1 */
  p10: (number | null)[];
  /** Quantile 0.5 (point) */
  p50: (number | null)[];
  /** Quantile 0.9 */
  p90: (number | null)[];
  p50_no_promo: (number | null)[];
  p50_with_promo: (number | null)[];
  /** False → What-if toggle disabled with tooltip */
  has_promo_history: boolean;
}

export interface ForecastsJSON {
  /** Forecast horizon, M5 standard */
  horizon_days: number;
  /** Lookback window shown in UI */
  historical_days: number;
  skus: ForecastSeries[];
}

export interface InventorySignal {
  sku: SKUMeta;
  current_stock: number;
  forecast_28d_demand: number;
  /** Upper bound, used for excess detection */
  forecast_28d_p90: number;
  safety_stock: number;
  reorder_point: number;
  /** Worst case = max(lead, horizon). Used for badge display. */
  stockout_probability: number;
  /** Stockout risk during lead time only (orderQty would not help). Used for 'urgent this week' KPI counting + service level. */
  stockout_probability_lead: number;
  /** None = no stockout in horizon */
  days_until_stockout: number | null;
  recommended_order: number;
  turnover_rate_annual: number;
}

export interface InventorySignalsJSON {
  risk_top5: InventorySignal[];
  excess_top5: InventorySignal[];
  /** Stockout-driven monthly loss estimate */
  estimated_revenue_loss_krw: number;
  /** Excess-inventory cash */
  estimated_cash_trapped_krw: number;
}

export interface SHAPForce {
  sku: SKUMeta;
  /** Model E[f(x)] */
  base_value: number;
  prediction: number;
  /** Top 10 features by |contribution| */
  top_features: SHAPForceFeature[];
}

export interface SHAPJSON {
  feature_count: number;
  /** N rows used for global summary */
  sample_size: number;
  summary: SHAPFeatureSummary[];
  /** Top 5 SKUs by absolute prediction magnitude */
  top_sku_forces: SHAPForce[];
}

export interface DashboardBundle {
  kpis: KPIsJSON;
  forecasts: ForecastsJSON;
  model_comparison: ModelComparisonJSON;
  inventory_signals: InventorySignalsJSON;
  shap: SHAPJSON;
}
