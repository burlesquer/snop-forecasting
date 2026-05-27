/**
 * Client-side stockout simulator.
 *
 * Mirror of ml/inventory.py:stockout_probability — keep them in sync.
 * The Python version is the authority; this TS version exists so the
 * Executive simulator widget feels instant (no API round-trip).
 *
 * Formulas — two-phase stockout probability, takes the worse of:
 *   P_lead    = P(demand > current_stock) over [0, lead_time)
 *                — order not yet arrived, so orderQty does NOT help
 *   P_horizon = P(demand_28d > current_stock + orderQty) over full horizon
 *                — order has arrived by then
 *   stockout_prob = max(P_lead, P_horizon)
 *
 * This makes the simulator gauge respond meaningfully to orderQty:
 * placing a big enough order drives P_horizon → 0, so the gauge falls
 * to the (fixed) P_lead floor. With a tiny order, P_horizon dominates.
 *
 * Both σ values come from the P90-P10 spread / 2.5631 (80% interval ≈ ±1.28σ).
 */

const P10_P90_TO_SIGMA = 2.5631;
const DEFAULT_LEAD_TIME = 7;

/** Standard normal CDF via erf (browser-safe — no Math.erf in spec). */
function erf(x: number): number {
  // Abramowitz & Stegun approximation, max error ≈ 1.5e-7
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

export interface SimulationInput {
  currentStock: number;
  p50Daily: number[];
  p10Daily: number[];
  p90Daily: number[];
  orderQty?: number;
  orderLeadTime?: number;
}

export interface SimulationResult {
  stockoutProbability: number; // ∈ [0, 1]
  daysUntilStockout: number | null;
  projectedInventory: number[]; // length = horizon
}

export function simulateStockout({
  currentStock,
  p50Daily,
  p10Daily,
  p90Daily,
  orderQty = 0,
  orderLeadTime = DEFAULT_LEAD_TIME,
}: SimulationInput): SimulationResult {
  const horizon = p50Daily.length;
  const projectedInventory: number[] = new Array(horizon);
  let stock = currentStock;
  let daysUntilStockout: number | null = null;

  for (let t = 0; t < horizon; t++) {
    if (t === orderLeadTime) {
      stock += orderQty;
    }
    stock -= p50Daily[t];
    if (stock < 0 && daysUntilStockout === null) {
      daysUntilStockout = t + 1;
    }
    projectedInventory[t] = stock;
  }

  // Two-phase probability — order quantity only helps AFTER lead time
  const leadEnd = Math.min(orderLeadTime, horizon);
  const sumSlice = (arr: number[], end: number) => {
    let s = 0;
    for (let i = 0; i < end; i++) s += arr[i];
    return s;
  };
  const sumAll = (arr: number[]) => sumSlice(arr, arr.length);

  // Phase 1: lead-time stockout — orderQty has not arrived yet
  const muLead = sumSlice(p50Daily, leadEnd);
  const sigmaLead =
    (sumSlice(p90Daily, leadEnd) - sumSlice(p10Daily, leadEnd)) / P10_P90_TO_SIGMA;
  const probLead =
    sigmaLead <= 0
      ? currentStock < muLead ? 1.0 : 0.0
      : 1.0 - normalCdf((currentStock - muLead) / sigmaLead);

  // Phase 2: horizon stockout — order has arrived, total demand vs total stock
  const muHorizon = sumAll(p50Daily);
  const sigmaHorizon =
    (sumAll(p90Daily) - sumAll(p10Daily)) / P10_P90_TO_SIGMA;
  const totalStock = currentStock + orderQty;
  const probHorizon =
    sigmaHorizon <= 0
      ? totalStock < muHorizon ? 1.0 : 0.0
      : 1.0 - normalCdf((totalStock - muHorizon) / sigmaHorizon);

  // Worse of the two phases — guardrails clip to [0, 1]
  let prob = Math.max(probLead, probHorizon);
  prob = Math.max(0, Math.min(1, prob));

  return {
    stockoutProbability: prob,
    daysUntilStockout,
    projectedInventory,
  };
}
