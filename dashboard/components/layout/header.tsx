import Link from "next/link";
import { TabNav } from "./tab-nav";

/**
 * Header: wordmark (left) + tab navigation (center) + builder credit (right).
 * The dot accent after "Forecast" is the brand marker — DESIGN.md decision.
 */
export function Header() {
  return (
    <header className="border-b border-border bg-bg/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-6">
          {/* Wordmark */}
          <Link
            href="/"
            className="flex items-baseline gap-0.5 group"
            aria-label="Forecast Studio home"
          >
            <span className="text-xl font-bold tracking-tight text-text-strong">
              Forecast
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-accent translate-y-[-2px]" />
            <span className="text-xl font-bold tracking-tight text-text-strong">
              Studio
            </span>
          </Link>

          {/* Tab nav */}
          <TabNav />

          {/* Builder credit (desktop only) */}
          <div className="hidden md:block text-xs text-muted">
            Built with M5 · 2026
          </div>
        </div>
      </div>
    </header>
  );
}
