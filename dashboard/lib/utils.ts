import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional className merger. shadcn convention — `cn(base, condition && extra)`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
