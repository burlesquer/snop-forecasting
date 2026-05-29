import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Section-level title used between major dashboard widgets.
 *
 * - subtitle: optional context for the analyst persona
 * - action: right-side slot (chips, badges, controls)
 * - methodologyAnchor: appends a small "방법론 →" link to subtitle that
 *   deep-links into /methodology#{anchor}. Credibility signal — every
 *   non-trivial value should explain itself.
 */
export function SectionHeader({
  title,
  subtitle,
  className,
  action,
  methodologyAnchor,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  action?: React.ReactNode;
  methodologyAnchor?: string;
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
        {(subtitle || methodologyAnchor) && (
          <p className="text-xs text-muted mt-0.5">
            {subtitle}
            {methodologyAnchor && (
              <>
                {subtitle && <span className="mx-1.5">·</span>}
                <Link
                  href={`/methodology${methodologyAnchor}`}
                  className="text-accent hover:underline underline-offset-2"
                >
                  방법론 →
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
