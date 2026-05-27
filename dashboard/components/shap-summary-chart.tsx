"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SHAPJSON } from "@/lib/types.generated";

/**
 * Global SHAP importance — horizontal bars sorted by mean |SHAP|.
 * Korean feature labels (name_kr) drive readability for a Korean audience.
 */
export function ShapSummaryChart({ data }: { data: SHAPJSON }) {
  const rows = [...data.summary]
    .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
    .map((s) => ({
      name: s.name_kr,
      raw: s.name,
      value: Number(s.mean_abs_shap.toFixed(3)),
    }));

  return (
    <div>
      <div className="text-xs text-muted mb-2">
        Background sample: {data.sample_size.toLocaleString()} rows · {data.feature_count} features
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 20, bottom: 4, left: 60 }}
          >
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-muted)" }}
              label={{
                value: "mean |SHAP|",
                position: "insideBottom",
                offset: -2,
                fontSize: 10,
                fill: "var(--color-muted)",
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-text)" }}
              width={60}
            />
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)" }}
              formatter={(v) => [typeof v === "number" ? v : String(v), "mean |SHAP|"]}
            />
            <Bar
              dataKey="value"
              fill="var(--color-accent)"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
