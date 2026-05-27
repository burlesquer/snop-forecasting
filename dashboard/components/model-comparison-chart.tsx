"use client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ModelComparisonJSON } from "@/lib/types.generated";

/**
 * Side-by-side bar chart of WAPE per model. Lower is better.
 * The LightGBM bar gets the accent rose so the eye lands on "the AI model".
 */
export function ModelComparisonChart({ data }: { data: ModelComparisonJSON }) {
  const rows = data.models.map((m) => ({
    name: m.display_name,
    wape: Number((m.wape * 100).toFixed(1)),
    mape: Number((m.mape * 100).toFixed(1)),
    bias: Number(m.bias.toFixed(2)),
    model: m.model,
  }));

  const bestModel = data.models.reduce((best, m) => (m.wape < best.wape ? m : best), data.models[0]);

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-xs text-muted">최고 성능 (낮은 WAPE):</span>
        <span className="text-sm font-medium text-accent-strong">
          {bestModel.display_name}
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 20, left: -10 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              width={40}
              label={{
                value: "WAPE (%)",
                angle: -90,
                position: "insideLeft",
                fontSize: 10,
                fill: "var(--color-muted)",
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)" }}
              formatter={(v, name) => {
                const n = String(name);
                const val = typeof v === "number" ? v : Number(v);
                if (n === "wape") return [`${val}%`, "WAPE"];
                if (n === "mape") return [`${val}%`, "MAPE"];
                return [String(val), n];
              }}
            />
            <Bar dataKey="wape" radius={[6, 6, 0, 0]} maxBarSize={64}>
              {rows.map((r) => (
                <Cell
                  key={r.model}
                  fill={
                    r.model === bestModel.model
                      ? "var(--color-accent-strong)"
                      : "var(--color-border-strong)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Metrics table */}
      <table className="w-full mt-4 text-xs font-tabular">
        <thead className="text-muted uppercase tracking-wide">
          <tr>
            <th className="text-left py-1 font-medium">모델</th>
            <th className="text-right py-1 font-medium">MAPE</th>
            <th className="text-right py-1 font-medium">WAPE</th>
            <th className="text-right py-1 font-medium">Bias</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model} className="border-t border-border">
              <td className="py-2 text-text">{r.name}</td>
              <td className="py-2 text-right text-text">{r.mape}%</td>
              <td className="py-2 text-right text-text">{r.wape}%</td>
              <td className="py-2 text-right text-text">{r.bias >= 0 ? `+${r.bias}` : r.bias}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
