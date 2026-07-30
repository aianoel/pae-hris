import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts intelligently.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract a human-readable message from an unknown thrown value. Handles native
 * Errors, Supabase/PostgREST error objects (plain objects carrying `message`,
 * and optional `details`/`hint`/`code`), and falls back to JSON so a caught
 * value never renders as the useless "[object Object]".
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) {
      const code = typeof e.code === "string" && e.code ? ` (${e.code})` : "";
      return parts.join(" — ") + code;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}
