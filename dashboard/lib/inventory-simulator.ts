/**
 * Client-side stockout simulator.
 *
 * Mirror of ml/inventory.py:stockout_probability — keep them in sync.
 * The Python version is the authority; this TS version exists so the
 * Executive simulator widget feels instant (no API round-trip).
 *
 * Formulas:
 *   stockout_prob ≈ 1 - Φ((stock - μ_lead) / σ_lead)
 *                    where σ_lead = (sum(P90_lead) - sum(P10_lead)) / 2.5631
 *   projected_inventory[t] = stock - cumulative_sum(p50[:t+1])
 *                           + (order_qty if t == lead_time else 0)
 *   days_until_stockout = first t where projected[t] < 0
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

  // Normal-approx stockout probability over the lead time window
  const leadEnd = Math.min(orderLeadTime, horizon);
  const sumSlice = (arr: number[], end: number) => {
    let s = 0;
    for (let i = 0; i < end; i++) s += arr[i];
    return s;
  };
  const muLead = sumSlice(p50Daily, leadEnd);
  const lowerLead = sumSlice(p10Daily, leadEnd);
  const upperLead = sumSlice(p90Daily, leadEnd);
  const sigmaLead = (upperLead - lowerLead) / P10_P90_TO_SIGMA;

  let prob: number;
  if (sigmaLead <= 0) {
    prob = currentStock < muLead ? 1.0 : 0.0;
  } else {
    const z = (currentStock - muLead) / sigmaLead;
    prob = 1.0 - normalCdf(z);
  }
  prob = Math.max(0, Math.min(1, prob));

  return {
    stockoutProbability: prob,
    daysUntilStockout,
    projectedInventory,
  };
}
