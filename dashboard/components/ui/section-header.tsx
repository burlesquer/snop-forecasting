import { cn } from "@/lib/utils";

/**
 * Section-level title used between major dashboard widgets.
 * Subtitle is optional context for the analyst persona.
 */
export function SectionHeader({
  title,
  subtitle,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 mb-3",
        className
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-text-strong tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
