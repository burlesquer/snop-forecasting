import { ImageResponse } from "next/og";
import { loadKPIs } from "@/lib/data";

/**
 * Dynamic Open Graph image for LinkedIn / Slack / Twitter previews.
 *
 * Satori (the engine next/og uses) only supports a subset of CSS:
 *   - no OKLCH (hex/rgb only)
 *   - no `transform` (use margin / position)
 *   - no shorthand `border` (split into width/style/color)
 *   - no function-component children
 * Keep this file boring.
 *
 * Hex approximations of the DESIGN.md OKLCH tokens (close-but-not-identical):
 */
const TOKENS = {
  bg: "#FAF8F6",              // surface background
  text: "#2E2C2A",            // body text
  textStrong: "#1F1D1C",      // headings
  muted: "#8A8380",           // labels
  border: "#E0DDD9",          // dividers
  accent: "#C97B82",          // muted rose 500
  accentStrong: "#B35A5D",    // muted rose 600
} as const;

export const alt = "Forecast Studio · Interactive S&OP decision support tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const kpis = await loadKPIs();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: TOKENS.bg,
          color: TOKENS.text,
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        {/* Wordmark — dot accent rendered as inline circle (no transform) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: TOKENS.textStrong,
          }}
        >
          <span style={{ display: "flex" }}>Forecast</span>
          <div
            style={{
              display: "flex",
              width: 10,
              height: 10,
              borderRadius: 999,
              background: TOKENS.accent,
              marginLeft: 8,
              marginRight: 8,
            }}
          />
          <span style={{ display: "flex" }}>Studio</span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 60,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: TOKENS.textStrong,
            }}
          >
            S&OP 의사결정 도구
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              marginTop: 24,
              color: TOKENS.text,
              maxWidth: 900,
            }}
          >
            예측 신뢰구간 · What-if 시나리오 · SHAP · 재고 시뮬레이터
          </div>
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            paddingTop: 40,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: TOKENS.border,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginRight: 60,
            }}
          >
            <span style={{ display: "flex", fontSize: 16, color: TOKENS.muted }}>
              {kpis.forecast_accuracy.label}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.accentStrong,
                marginTop: 6,
              }}
            >
              {kpis.forecast_accuracy.value}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginRight: 60,
            }}
          >
            <span style={{ display: "flex", fontSize: 16, color: TOKENS.muted }}>
              {kpis.inventory_turnover.label}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.textStrong,
                marginTop: 6,
              }}
            >
              {kpis.inventory_turnover.value}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ display: "flex", fontSize: 16, color: TOKENS.muted }}>
              {kpis.service_level.label}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.textStrong,
                marginTop: 6,
              }}
            >
              {kpis.service_level.value}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              marginLeft: "auto",
              color: TOKENS.muted,
              fontSize: 20,
            }}
          >
            <span style={{ display: "flex" }}>LightGBM · SHAP · Next.js</span>
            <span
              style={{
                display: "flex",
                marginTop: 6,
                fontWeight: 600,
                color: TOKENS.accentStrong,
              }}
            >
              snop-forecasting.vercel.app
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
