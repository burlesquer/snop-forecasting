import { cn } from "@/lib/utils";
import { formatPct, formatInt, formatKRW } from "@/lib/format";
import type { InventorySignal } from "@/lib/types.generated";

/**
 * Top-5 SKU table. Two modes:
 *   - "risk":   sort by stockout_probability desc, highlight prob + days_until
 *   - "excess": sort by turnover asc, highlight days_of_supply / cash impact
 *
 * No icons in colored circles. No purple gradients. Just type + tabular numbers
 * and a left accent that says "this row needs attention" in the right tone.
 */
export function SkuTable({
  mode,
  signals,
}: {
  mode: "risk" | "excess";
  signals: InventorySignal[];
}) {
  return (
    <div className="overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-muted uppercase tracking-wide">
            <th className="text-left pb-2 font-medium">SKU</th>
            {mode === "risk" ? (
              <>
                <th className="text-right pb-2 font-medium">결품 확률</th>
                <th className="text-right pb-2 font-medium">소진까지</th>
                <th className="text-right pb-2 font-medium">권장 발주</th>
              </>
            ) : (
              <>
                <th className="text-right pb-2 font-medium">현재고</th>
                <th className="text-right pb-2 font-medium">회전율</th>
                <th className="text-right pb-2 font-medium">권장 조치</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr
              key={s.sku.id}
              className="border-t border-border hover:bg-surface-2 transition-colors duration-fast"
            >
              <td className="py-3 pr-3 align-top">
                <div className="text-text-strong font-medium">
                  {s.sku.name}
                </div>
                <div className="text-xs text-muted">{s.sku.category}</div>
              </td>
              {mode === "risk" ? (
                <RiskCells s={s} />
              ) : (
                <ExcessCells s={s} />
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskCells({ s }: { s: InventorySignal }) {
  const danger = s.stockout_probability >= 0.4;
  return (
    <>
      <td className="py-3 text-right align-top font-tabular">
        <span
          className={cn(
            "inline-block px-2 py-0.5 rounded-md text-xs font-medium",
            danger
              ? "bg-danger/10 text-danger"
              : "bg-warn/10 text-warn"
          )}
        >
          {formatPct(s.stockout_probability, 0)}
        </span>
      </td>
      <td className="py-3 text-right align-top font-tabular text-text">
        {s.days_until_stockout !== null
          ? `${s.days_until_stockout}일`
          : "—"}
      </td>
      <td className="py-3 text-right align-top font-tabular text-text-strong">
        {s.recommended_order > 0 ? `+${formatInt(s.recommended_order)}` : "—"}
      </td>
    </>
  );
}

function ExcessCells({ s }: { s: InventorySignal }) {
  const lowTurnover = s.turnover_rate_annual < 12;
  return (
    <>
      <td className="py-3 text-right align-top font-tabular text-text">
        {formatInt(s.current_stock)}
      </td>
      <td className="py-3 text-right align-top font-tabular">
        <span
          className={cn(
            "inline-block px-2 py-0.5 rounded-md text-xs font-medium",
            lowTurnover
              ? "bg-warn/10 text-warn"
              : "bg-safe/10 text-safe"
          )}
        >
          {s.turnover_rate_annual.toFixed(1)}회
        </span>
      </td>
      <td className="py-3 text-right align-top text-muted text-xs">
        {lowTurnover ? "할인/생산조정" : "유지"}
      </td>
    </>
  );
}
