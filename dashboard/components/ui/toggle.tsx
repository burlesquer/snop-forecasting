"use client";
import { cn } from "@/lib/utils";

/**
 * Inline toggle pill. Used for 신뢰구간 on/off and What-if 프로모션 on/off.
 * Keyboard-accessible — Tab to focus, Space/Enter to flip.
 */
export function Toggle({
  pressed,
  onPressedChange,
  children,
  disabled = false,
  title,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={typeof children === "string" ? children : undefined}
      disabled={disabled}
      title={title}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium",
        "border transition-all duration-fast ease-out-expo",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && pressed && "bg-accent-bg border-accent text-accent-strong",
        !disabled && !pressed && "bg-surface border-border text-muted hover:text-text hover:border-border-strong"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors duration-fast",
          pressed ? "bg-accent" : "bg-border-strong"
        )}
      />
      {children}
    </button>
  );
}
