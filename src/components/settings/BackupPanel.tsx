import * as React from "react";
import { Clock, Download, FileJson, FileSpreadsheet, HardDriveDownload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import {
  backupStamp,
  downloadJson,
  downloadTableCsv,
  fetchBackup,
} from "@/lib/backup";
import { MONITORED_TABLES, type MonitoredTable } from "@/lib/monitoring";
import { isSupabaseConfigured } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";

export function BackupPanel() {
  const store = useStore();
  const { addLog } = store;
  const { toast } = useToast();

  const [busy, setBusy] = React.useState<"json" | "csv" | null>(null);
  const [table, setTable] = React.useState<MonitoredTable>("employees");
  const [lastBackup, setLastBackup] = React.useState<{ at: string; rows: number; source: string } | null>(null);

  // Full JSON snapshot of every table.
  const backupAll = async () => {
    setBusy("json");
    try {
      const doc = await fetchBackup(store);
      downloadJson(`aurora-backup-${backupStamp()}.json`, doc);
      setLastBackup({ at: doc.meta.createdAt, rows: doc.meta.totalRows, source: doc.meta.source });
      addLog("system", `database backup exported (${doc.meta.totalRows} rows)`, doc.meta.source);
      toast({
        variant: "success",
        title: "Backup downloaded",
        description: `${doc.meta.totalRows.toLocaleString()} rows across ${Object.keys(doc.tables).length} tables.`,
      });
    } catch (e) {
      toast({
        variant: "error",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "Could not read the database.",
      });
    } finally {
      setBusy(null);
    }
  };

  // Single-table CSV export.
  const exportCsv = async () => {
    setBusy("csv");
    try {
      const rows = await downloadTableCsv(table);
      addLog("system", `exported table "${table}" to CSV`, `${rows} rows`);
      toast({
        variant: "success",
        title: "CSV downloaded",
        description: `${rows.toLocaleString()} rows from "${table}".`,
      });
    } catch (e) {
      toast({
        variant: "error",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not read the table.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Full backup */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HardDriveDownload className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Full database backup</p>
                  <Badge variant={isSupabaseConfigured ? "success" : "secondary"}>
                    {isSupabaseConfigured ? "Live snapshot" : "In-memory"}
                  </Badge>
                </div>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  Download a complete JSON snapshot of every table
                  {isSupabaseConfigured ? " straight from Supabase" : " from the current session"}.
                  Keep it somewhere safe — it can be re-imported to restore the workspace.
                </p>
              </div>
            </div>
            <Button onClick={backupAll} loading={busy === "json"}>
              <FileJson className="mr-1.5 h-4 w-4" />
              Download backup (.json)
            </Button>
          </div>

          {lastBackup && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Last backup {formatDateTime(lastBackup.at)} · {lastBackup.rows.toLocaleString()} rows · {lastBackup.source}
            </div>
          )}

          {isSupabaseConfigured && (
            <p className="mt-3 text-xs text-muted-foreground">
              Note: backups respect Row Level Security — sign in first so every row is included.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-table CSV export */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Export a single table (CSV)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Grab one table as a spreadsheet-friendly CSV of the raw database columns.
              </p>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bk-table">Table</Label>
                  <Select
                    id="bk-table"
                    value={table}
                    onChange={(e) => setTable(e.target.value as MonitoredTable)}
                    className="min-w-[16rem]"
                    disabled={!isSupabaseConfigured}
                  >
                    {MONITORED_TABLES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={exportCsv}
                  loading={busy === "csv"}
                  disabled={!isSupabaseConfigured}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              {!isSupabaseConfigured && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Connect a Supabase backend to export individual tables.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
