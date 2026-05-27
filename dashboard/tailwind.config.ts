import type { Config } from "tailwindcss";

/**
 * Tailwind theme reads from CSS variables defined in app/globals.css.
 * This keeps tokens as the single source of truth (DESIGN.md).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        muted: "var(--color-muted)",
        text: "var(--color-text)",
        "text-strong": "var(--color-text-strong)",
        accent: "var(--color-accent)",
        "accent-strong": "var(--color-accent-strong)",
        "accent-bg": "var(--color-accent-bg)",
        safe: "var(--color-safe)",
        warn: "var(--color-warn)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out-expo)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
      },
    },
  },
  plugins: [],
};

export default config;
