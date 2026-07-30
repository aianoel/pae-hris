/**
 * Supabase client, created from Vite env vars (see .env.example):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *
 * If either is missing the client is `null` and the app falls back to its
 * in-memory seed data (offline/demo mode) — so it still builds and runs with no
 * backend configured. Consumers must null-check `supabase` before use, or call
 * `requireSupabase()` where a backend is mandatory.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both connection env vars are present. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Opt-in demo seeding of empty tables on first load. */
export const shouldSeed =
  (import.meta.env.VITE_SUPABASE_SEED as string | undefined)?.toLowerCase() === "true";

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "[aurora] Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). " +
      "Running on in-memory seed data.",
  );
}

/** Assert a configured client; throws a clear error if not. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.",
    );
  }
  return supabase;
}
