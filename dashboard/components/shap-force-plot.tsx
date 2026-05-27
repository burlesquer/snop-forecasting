"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { SHAPJSON } from "@/lib/types.generated";

/**
 * Per-SKU SHAP force plot — explains a single prediction by decomposing
 * the contribution of each feature relative to the model's base value.
 *
 * Visual: horizontal bar split by signed contribution. Positive (red-ish)
 * features push the prediction up; negative (sage) push down.
 */
export function ShapForcePlot({ data }: { data: SHAPJSON }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const force = data.top_sku_forces[selectedIdx];

  const { maxAbs, total } = useMemo(() => {
    let maxAbs = 0;
    let total = 0;
    for (const f of force?.top_features ?? []) {
      maxAbs = Math.max(maxAbs, Math.abs(f.shap_contribution));
      total += f.shap_contribution;
    }
    return { maxAbs, total };
  }, [force]);

  if (!force) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <label className="text-xs text-muted uppercase tracking-wide font-medium">
            SKU 선택
          </label>
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className={cn(
              "ml-2 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            )}
          >
            {data.top_sku_forces.map((f, idx) => (
              <option key={f.sku.id} value={idx}>
                {f.sku.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-muted font-tabular">
          baseline {force.base_value.toFixed(2)} · 예측{" "}
          <span className="text-text-strong font-medium">{force.prediction.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {force.top_features.map((f) => {
          const pct = maxAbs > 0 ? Math.abs(f.shap_contribution) / maxAbs : 0;
          const positive = f.shap_contribution > 0;
          return (
            <div key={f.name} className="grid grid-cols-12 items-center gap-2 text-sm">
              <div className="col-span-3 text-text-strong text-xs truncate" title={f.name}>
                {f.name_kr}
              </div>
              <div className="col-span-2 text-right text-muted text-xs font-tabular">
                {f.feature_value.toFixed(2)}
              </div>
              <div className="col-span-5 flex items-center">
                <div className="w-1/2 flex justify-end pr-1">
                  {!positive && (
                    <div
                      className="h-3 bg-safe/70 rounded-sm"
                      style={{ width: `${pct * 100}%` }}
                    />
                  )}
                </div>
                <div className="w-px h-4 bg-border-strong" />
                <div className="w-1/2 pl-1">
                  {positive && (
                    <div
                      className="h-3 bg-accent/80 rounded-sm"
                      style={{ width: `${pct * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "col-span-2 text-right text-xs font-tabular",
                  positive ? "text-accent-strong" : "text-safe"
                )}
              >
                {positive ? "+" : ""}
                {f.shap_contribution.toFixed(3)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-muted">
        파란 막대(우): 예측을 끌어올리는 feature · 초록 막대(좌): 끌어내리는 feature ·
        총 SHAP 합 {total >= 0 ? "+" : ""}
        {total.toFixed(3)}
      </div>
    </div>
  );
}
