import * as React from "react";
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  MonitorSmartphone,
  RefreshCw,
  Signal,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/store/store-context";
import {
  formatUptime,
  readSystemInfo,
  type SystemInfo,
} from "@/lib/monitoring";
import { cn } from "@/lib/utils";

/** A labelled stat tile. */
function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SystemMonitor() {
  const { backed, ready, employees, users, departments, attendance, payrollRuns, reports, documents, roles, notifications, logs, contributionRates } = useStore();
  const [info, setInfo] = React.useState<SystemInfo>(() => readSystemInfo());
  const [auto, setAuto] = React.useState(true);

  const refresh = React.useCallback(() => setInfo(readSystemInfo()), []);

  // Live-refresh the runtime snapshot every 3s while auto is on.
  React.useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [auto, refresh]);

  // Total records currently held in the client store.
  const totalRecords =
    employees.length + users.length + departments.length + attendance.length +
    payrollRuns.length + reports.length + documents.length + roles.length +
    notifications.length + logs.length + contributionRates.length;

  const memPct =
    info.memoryUsedMB != null && info.memoryLimitMB
      ? Math.min(100, Math.round((info.memoryUsedMB / info.memoryLimitMB) * 100))
      : null;

  return (
    <div className="space-y-4">
      {/* Header row: overall app status + controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl",
                info.online ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
              )}
            >
              {info.online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Application runtime</p>
                <Badge variant={info.online ? "success" : "destructive"}>
                  {info.online ? "Online" : "Offline"}
                </Badge>
                <Badge variant={backed ? "default" : "secondary"}>
                  {backed ? "Supabase backend" : "In-memory mode"}
                </Badge>
                <Badge variant={ready ? "success" : "warning"}>
                  {ready ? "Data ready" : "Loading…"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uptime {formatUptime(info.uptimeSec)} · {info.platform} · {info.language}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={auto ? "default" : "outline"}
              className="h-9 px-3 text-xs"
              onClick={() => setAuto((a) => !a)}
            >
              <Activity className="mr-1.5 h-4 w-4" />
              {auto ? "Live" : "Paused"}
            </Button>
            <Button variant="outline" className="h-9 px-3 text-xs" onClick={refresh}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Runtime metric tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          icon={<Gauge className="h-4 w-4" />}
          label="Session uptime"
          value={formatUptime(info.uptimeSec)}
          hint="Since this tab was loaded"
        />
        <Stat
          icon={<Database className="h-4 w-4" />}
          label="Records loaded"
          value={totalRecords.toLocaleString()}
          hint="Rows held in the client store"
        />
        <Stat
          icon={<Signal className="h-4 w-4" />}
          label="Network"
          value={info.connection ? info.connection.toUpperCase() : info.online ? "Online" : "Offline"}
          hint={info.connection ? "Effective connection type" : "navigator.onLine"}
        />
        <Stat
          icon={<Cpu className="h-4 w-4" />}
          label="CPU cores"
          value={info.cores ?? "—"}
          hint="Logical processors"
        />
        <Stat
          icon={<MonitorSmartphone className="h-4 w-4" />}
          label="Viewport"
          value={info.viewport}
          hint="Current window size"
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="JS heap"
          value={info.memoryUsedMB != null ? `${info.memoryUsedMB} MB` : "N/A"}
          hint={info.memoryLimitMB ? `of ${info.memoryLimitMB} MB limit` : "Not exposed by this browser"}
        />
      </div>

      {/* Memory bar (Chromium only) */}
      {memPct != null && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">JavaScript heap usage</span>
              <span className="tabular-nums text-muted-foreground">
                {info.memoryUsedMB} / {info.memoryLimitMB} MB ({memPct}%)
              </span>
            </div>
            <Progress
              value={memPct}
              indicatorClassName={cn(
                memPct > 85 ? "bg-destructive" : memPct > 60 ? "bg-amber-500" : "bg-success",
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
