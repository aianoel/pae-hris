import * as React from "react";
import { Activity, Database, Gauge, Wifi, WifiOff } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useStore } from "@/store/store-context";
import { formatUptime, readSystemInfo, type SystemInfo } from "@/lib/monitoring";
import { cn } from "@/lib/utils";

/** A compact system-metric stat card. */
function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg bg-secondary",
            accent,
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/**
 * Live system-monitoring stat cards for the dashboard. Mirrors the Settings →
 * System tiles but condensed: reads real runtime state and refreshes every 3s.
 */
export function SystemStats() {
  const {
    backed,
    employees,
    users,
    departments,
    attendance,
    payrollRuns,
    reports,
    documents,
    roles,
    notifications,
    logs,
    contributionRates,
  } = useStore();
  const [info, setInfo] = React.useState<SystemInfo>(() => readSystemInfo());

  // Live-refresh the runtime snapshot every 3s.
  React.useEffect(() => {
    const id = window.setInterval(() => setInfo(readSystemInfo()), 3000);
    return () => window.clearInterval(id);
  }, []);

  const totalRecords =
    employees.length + users.length + departments.length + attendance.length +
    payrollRuns.length + reports.length + documents.length + roles.length +
    notifications.length + logs.length + contributionRates.length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={info.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        label="System status"
        value={info.online ? "Online" : "Offline"}
        hint={backed ? "Supabase backend" : "In-memory mode"}
        accent={info.online ? "text-success" : "text-destructive"}
      />
      <StatCard
        icon={<Gauge className="h-4 w-4" />}
        label="Session uptime"
        value={formatUptime(info.uptimeSec)}
        hint="Since this tab was loaded"
        accent="text-primary"
      />
      <StatCard
        icon={<Database className="h-4 w-4" />}
        label="Records loaded"
        value={totalRecords.toLocaleString()}
        hint="Rows held in the client store"
        accent="text-primary"
      />
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="JS heap"
        value={info.memoryUsedMB != null ? `${info.memoryUsedMB} MB` : "N/A"}
        hint={info.memoryLimitMB ? `of ${info.memoryLimitMB} MB limit` : "Not exposed by browser"}
        accent="text-primary"
      />
    </div>
  );
}
