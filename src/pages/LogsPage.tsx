import * as React from "react";
import { Search, Download } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/store-context";
import type { LogType } from "@/store/types";
import { downloadCsv } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const typeTint: Record<LogType, string> = {
  auth: "bg-chart-4/10 text-chart-4",
  employee: "bg-primary/10 text-primary",
  user: "bg-chart-2/10 text-chart-2",
  payroll: "bg-chart-5/10 text-chart-5",
  attendance: "bg-chart-3/10 text-chart-3",
  report: "bg-amber-500/10 text-amber-500",
  document: "bg-secondary text-secondary-foreground",
  role: "bg-destructive/10 text-destructive",
  settings: "bg-muted text-muted-foreground",
  system: "bg-muted text-muted-foreground",
};

const TYPES: (LogType | "all")[] = [
  "all", "auth", "employee", "user", "payroll", "attendance", "report", "document", "role", "settings", "system",
];

export function LogsPage() {
  const { logs } = useStore();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState<LogType | "all">("all");

  const filtered = logs.filter((l) => {
    const matchesType = type === "all" || l.type === type;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      l.actor.toLowerCase().includes(q) ||
      (l.actorEmail ?? "").toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.target.toLowerCase().includes(q) ||
      (l.ip ?? "").toLowerCase().includes(q) ||
      (l.device ?? "").toLowerCase().includes(q);
    return matchesType && matchesQuery;
  });

  return (
    <>
      <PageHeader
        title="System Logs"
        description="Audit trail of system and user events."
        actions={
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              downloadCsv(
                "audit-logs",
                filtered.map((l) => ({ time: l.time, type: l.type, actor: l.actor, actorEmail: l.actorEmail ?? "", action: l.action, target: l.target, ip: l.ip ?? "", device: l.device ?? "" })),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events…"
              className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:shadow-focus"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select value={type} onChange={(e) => setType(e.target.value as LogType | "all")} className="h-10 capitalize">
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {["Time", "Type", "Actor", "Action", "Target", "IP Address", "Device"].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                  <td className="whitespace-nowrap px-4 py-3 pl-5 text-sm text-muted-foreground">{formatDateTime(l.time)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize", typeTint[l.type])}>
                      {l.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{l.actor}</div>
                    {l.actorEmail && <div className="text-xs text-muted-foreground">{l.actorEmail}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{l.action}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{l.target}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{l.ip || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 pr-5 text-xs text-muted-foreground">{l.device || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-sm text-muted-foreground">
                    No log entries match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
