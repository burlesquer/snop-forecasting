import Link from "next/link";

/**
 * Footer: subtle build attribution + data source disclosure + methodology link.
 * Honesty signal — tells the viewer this is a portfolio demo on public data,
 * and links to the full methodology doc for credibility.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-muted">
          <div>
            데이터: Kaggle M5 Forecasting-Accuracy (Walmart) · 화장품 시나리오는
            표시 레이어에서 매핑 ·{" "}
            <Link
              href="/methodology"
              className="text-accent hover:underline underline-offset-2"
            >
              방법론 전체 보기 →
            </Link>
          </div>
          <div className="flex gap-4">
            <span>LightGBM · SHAP · Next.js · Vercel</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
