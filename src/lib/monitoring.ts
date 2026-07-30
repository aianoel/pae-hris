/**
 * Live monitoring helpers for the Settings → System / Database tabs.
 *
 * Everything here reflects REAL runtime state — there are no faked metrics:
 *   • System info comes from the browser (Navigator, Performance, memory).
 *   • Database health/latency/counts come from actual Supabase requests
 *     (a lightweight HEAD `count` query per table over the authenticated
 *     session), or report "offline" when the app runs on in-memory seed data.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** The tables the app owns; mirrors db/schema.supabase.sql. */
export const MONITORED_TABLES = [
  "roles",
  "users",
  "departments",
  "agencies",
  "employees",
  "attendance_records",
  "payroll_runs",
  "payroll_approvals",
  "payroll_entries",
  "contribution_rates",
  "reports",
  "documents",
  "notifications",
  "log_entries",
  "settings",
] as const;

export type MonitoredTable = (typeof MONITORED_TABLES)[number];

export interface TableStat {
  table: MonitoredTable;
  /** Exact row count, or null when the query failed. */
  count: number | null;
  /** Per-table round-trip latency in ms. */
  ms: number;
  error?: string;
}

export type HealthStatus = "healthy" | "degraded" | "down" | "offline";

export interface DbHealth {
  /** Overall status derived from the probe. */
  status: HealthStatus;
  /** Round-trip latency of the health ping in ms (null when offline/failed). */
  latencyMs: number | null;
  /** True when a Supabase Auth session is currently active. */
  authenticated: boolean;
  /** Signed-in user's email, when available. */
  sessionEmail: string | null;
  /** ISO timestamp the probe ran (caller stamps it; we return performance ms). */
  checkedAt: string;
  error?: string;
}

/** Monotonic clock; falls back to Date for very old runtimes. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : new Date().getTime();
}

/**
 * Ping the database with a tiny, RLS-respecting request and measure latency.
 * Uses a HEAD-style count against `settings` (single-row table) so we transfer
 * almost nothing. Classifies latency into healthy/degraded.
 */
export async function checkDbHealth(): Promise<DbHealth> {
  const checkedAt = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) {
    return {
      status: "offline",
      latencyMs: null,
      authenticated: false,
      sessionEmail: null,
      checkedAt,
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  const start = now();
  const { error, count } = await supabase
    .from("settings")
    .select("id", { count: "exact", head: true });
  const latencyMs = Math.round(now() - start);

  if (error) {
    return {
      status: "down",
      latencyMs,
      authenticated: Boolean(session),
      sessionEmail: session?.user?.email ?? null,
      checkedAt,
      error: error.message,
    };
  }

  // Reachable. Degraded if the round-trip is slow, or if we can't read rows
  // (typically means no auth session, so RLS returns 0).
  const status: HealthStatus =
    latencyMs > 1200 || count === null || count === 0 ? "degraded" : "healthy";

  return {
    status,
    latencyMs,
    authenticated: Boolean(session),
    sessionEmail: session?.user?.email ?? null,
    checkedAt,
  };
}

/** Fetch exact row counts + per-table latency for every monitored table. */
export async function fetchTableStats(): Promise<TableStat[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const sb = supabase;

  return Promise.all(
    MONITORED_TABLES.map(async (table): Promise<TableStat> => {
      const start = now();
      const { count, error } = await sb
        .from(table)
        .select("*", { count: "exact", head: true });
      const ms = Math.round(now() - start);
      return { table, count: error ? null : count ?? 0, ms, error: error?.message };
    }),
  );
}

/** On-disk size of a single table (table heap + indexes + TOAST). */
export interface TableStorage {
  table: string;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
}

export interface StorageStats {
  /** Total size of the database on disk, in bytes. */
  databaseBytes: number;
  /** Per-table breakdown, largest first. */
  tables: TableStorage[];
}

/**
 * Fetch database storage usage via the `db_storage_stats` RPC (a SECURITY
 * DEFINER function; see db/migrations/007_db_storage_stats_rpc.sql). Returns
 * null when offline (in-memory mode) or if the RPC is unavailable — e.g. the
 * migration hasn't been applied yet — so callers can degrade gracefully.
 */
export async function fetchStorageStats(): Promise<StorageStats | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.rpc("db_storage_stats");
  if (error || !data) return null;
  const raw = data as { databaseBytes?: number; tables?: TableStorage[] };
  return {
    databaseBytes: raw.databaseBytes ?? 0,
    tables: Array.isArray(raw.tables) ? raw.tables : [],
  };
}

/** Human-friendly byte size, e.g. 1536 → "1.5 KB", 0 → "0 B". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Snapshot of browser/runtime health for the System tab. */
export interface SystemInfo {
  online: boolean;
  /** Page uptime in seconds since first paint of this session. */
  uptimeSec: number;
  /** JS heap usage (Chromium only); null elsewhere. */
  memoryUsedMB: number | null;
  memoryLimitMB: number | null;
  viewport: string;
  /** Logical CPU cores, when exposed. */
  cores: number | null;
  /** Effective network type from the Network Information API, when exposed. */
  connection: string | null;
  language: string;
  platform: string;
}

/** Marks when the module first loaded — used as a proxy for page uptime. */
const bootedAt = now();

export function readSystemInfo(): SystemInfo {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  // performance.memory is non-standard (Chromium); guarded read.
  const mem = (typeof performance !== "undefined"
    ? (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    : undefined);
  const conn = (nav as unknown as { connection?: { effectiveType?: string } } | undefined)?.connection;

  return {
    online: nav?.onLine ?? true,
    uptimeSec: Math.max(0, Math.round((now() - bootedAt) / 1000)),
    memoryUsedMB: mem ? Math.round(mem.usedJSHeapSize / 1_048_576) : null,
    memoryLimitMB: mem ? Math.round(mem.jsHeapSizeLimit / 1_048_576) : null,
    viewport:
      typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "—",
    cores: nav?.hardwareConcurrency ?? null,
    connection: conn?.effectiveType ?? null,
    language: nav?.language ?? "—",
    platform: nav?.platform ?? "—",
  };
}

/** Human-friendly duration, e.g. 3725 → "1h 2m 5s". */
export function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : "", `${s}s`].filter(Boolean).join(" ");
}
