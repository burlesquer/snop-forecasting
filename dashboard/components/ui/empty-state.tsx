import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Shared empty state across all widgets. The icon + warm copy turns
 * "no data" from a failure mode into an intentional design moment —
 * specifically the positive-empty case ("위험 SKU 없음 🌿") is a strong
 * thoughtfulness signal in the demo.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "good";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        "border border-dashed border-border rounded-md",
        tone === "good" && "border-safe/40 bg-safe/[0.04]",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "h-8 w-8 mb-3",
            tone === "good" ? "text-safe" : "text-muted"
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <h4 className="text-sm font-medium text-text-strong">{title}</h4>
      {description && (
        <p className="text-xs text-muted mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
