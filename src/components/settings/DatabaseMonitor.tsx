import * as React from "react";
import {
  CheckCircle2,
  Database,
  Gauge,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  XCircle,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  checkDbHealth,
  fetchTableStats,
  fetchStorageStats,
  formatBytes,
  type DbHealth,
  type HealthStatus,
  type StorageStats,
  type TableStat,
} from "@/lib/monitoring";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const STATUS_META: Record<HealthStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary"; dot: string }> = {
  healthy: { label: "Healthy", variant: "success", dot: "bg-success" },
  degraded: { label: "Degraded", variant: "warning", dot: "bg-amber-500" },
  down: { label: "Down", variant: "destructive", dot: "bg-destructive" },
  offline: { label: "Offline (in-memory)", variant: "secondary", dot: "bg-muted-foreground" },
};

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function latencyLabel(ms: number | null): string {
  if (ms == null) return "—";
  return `${ms} ms`;
}

export function DatabaseMonitor() {
  const { toast } = useToast();
  const [health, setHealth] = React.useState<DbHealth | null>(null);
  const [stats, setStats] = React.useState<TableStat[]>([]);
  const [storage, setStorage] = React.useState<StorageStats | null>(null);
  const [loading, setLoading] = React.useState(false);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, st] = await Promise.all([
        checkDbHealth(),
        fetchTableStats(),
        fetchStorageStats(),
      ]);
      setHealth(h);
      setStats(s);
      setStorage(st);
    } catch (e) {
      toast({
        variant: "error",
        title: "Health check failed",
        description: e instanceof Error ? e.message : "Could not reach the database.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Probe once on mount.
  React.useEffect(() => {
    void run();
  }, [run]);

  const meta = health ? STATUS_META[health.status] : STATUS_META.offline;
  const totalRows = stats.reduce((sum, s) => sum + (s.count ?? 0), 0);
  // Per-table on-disk size, keyed by table name for the breakdown below.
  const sizeByTable = React.useMemo(
    () => new Map((storage?.tables ?? []).map((t) => [t.table, t.totalBytes])),
    [storage],
  );

  return (
    <div className="space-y-4">
      {/* Connection header */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground")}>
              <Database className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Supabase PostgreSQL</p>
                <Badge variant={meta.variant}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isSupabaseConfigured
                  ? "Live connection · Row Level Security enforced"
                  : "No backend configured — running on in-memory seed data"}
              </p>
            </div>
          </div>
          <Button variant="outline" className="h-9 px-3 text-xs" onClick={run} loading={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
            Run health check
          </Button>
        </CardContent>
      </Card>

      {/* Health metric tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          icon={<Gauge className="h-4 w-4" />}
          label="Status"
          value={meta.label}
          hint={health ? `Checked ${new Date(health.checkedAt).toLocaleTimeString()}` : "—"}
        />
        <Stat
          icon={<HardDrive className="h-4 w-4" />}
          label="Storage used"
          value={
            !isSupabaseConfigured
              ? "—"
              : storage
                ? formatBytes(storage.databaseBytes)
                : "N/A"
          }
          hint={
            !isSupabaseConfigured
              ? "In-memory mode"
              : storage
                ? "Total database on disk"
                : "Apply migration 007 to enable"
          }
        />
        <Stat
          icon={<Zap className="h-4 w-4" />}
          label="Latency"
          value={latencyLabel(health?.latencyMs ?? null)}
          hint="Round-trip to the database"
        />
        <Stat
          icon={health?.authenticated ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          label="Auth session"
          value={health?.authenticated ? "Active" : "None"}
          hint={health?.sessionEmail ?? "Not signed in to Supabase"}
        />
        <Stat
          icon={<Database className="h-4 w-4" />}
          label="Total rows"
          value={isSupabaseConfigured ? totalRows.toLocaleString() : "—"}
          hint={`${stats.length} tables`}
        />
      </div>

      {/* Per-table breakdown */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <p className="text-sm font-semibold text-foreground">Tables</p>
            <p className="text-xs text-muted-foreground">Live row counts &amp; query latency</p>
          </div>

          {!isSupabaseConfigured ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Connect a Supabase backend (set <code className="rounded bg-secondary px-1">VITE_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-secondary px-1">VITE_SUPABASE_ANON_KEY</code>) to see table metrics.
            </div>
          ) : stats.length === 0 && loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Probing tables…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Table</th>
                    <th className="px-6 py-3 text-right font-medium">Rows</th>
                    <th className="px-6 py-3 text-right font-medium">Size</th>
                    <th className="px-6 py-3 text-right font-medium">Latency</th>
                    <th className="px-6 py-3 text-right font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => {
                    const ok = s.error == null;
                    return (
                      <tr key={s.table} className="border-b border-border last:border-0 hover:bg-secondary/40">
                        <td className="px-6 py-3 font-mono text-[0.8rem] text-foreground">{s.table}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-foreground">
                          {s.count?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                          {sizeByTable.has(s.table) ? formatBytes(sizeByTable.get(s.table)!) : "—"}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{s.ms} ms</td>
                        <td className="px-6 py-3 text-right">
                          {ok ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-4 w-4" /> OK
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-destructive"
                              title={s.error}
                            >
                              <XCircle className="h-4 w-4" /> Error
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {health?.error && (
        <p className="text-xs text-destructive">Last error: {health.error}</p>
      )}
    </div>
  );
}
