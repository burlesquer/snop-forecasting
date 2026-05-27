"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Executive", caption: "경영자" },
  { href: "/analyst", label: "Analyst", caption: "분석가" },
] as const;

/**
 * Top tab nav. Active tab gets a rose underline + text-strong.
 * Inactive tabs stay muted to keep visual weight on content, not chrome.
 */
export function TabNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="대시보드 뷰" className="flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-4 py-2 text-sm font-medium transition-colors duration-fast ease-out-expo",
              active ? "text-text-strong" : "text-muted hover:text-text"
            )}
          >
            <span>{tab.label}</span>
            <span className="ml-1.5 text-xs text-muted">{tab.caption}</span>
            {active && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-accent rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
