/**
 * Database backup / export.
 *
 * `fetchBackup()` pulls a faithful raw snapshot of every table straight from
 * Supabase (snake_case columns, exactly as stored — including tables the client
 * store doesn't keep, e.g. payroll_entries). When no backend is configured it
 * falls back to serialising the in-memory store via the row mappers so a demo
 * session can still export something.
 *
 * The result is a single JSON document with metadata + one array per table,
 * suitable for re-import or offsite backup. `downloadJson` / CSV helpers trigger
 * real browser downloads.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MONITORED_TABLES, type MonitoredTable } from "@/lib/monitoring";
import { downloadCsv } from "@/lib/export";
import * as M from "@/lib/db/mappers";
import type { StoreValue } from "@/store";

export interface BackupFile {
  meta: {
    app: "aurora";
    kind: "database-backup";
    version: 1;
    createdAt: string;
    source: "supabase" | "in-memory";
    projectUrl: string | null;
    tableCounts: Record<string, number>;
    totalRows: number;
  };
  tables: Record<string, Record<string, unknown>[]>;
}

/** Fetch every row of one table, paging past PostgREST's 1000-row cap. */
async function fetchTable(table: string): Promise<Record<string, unknown>[]> {
  const sb = supabase!;
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Build the in-memory fallback snapshot from the live store (row-shaped). */
function backupFromStore(store: StoreValue): Record<string, Record<string, unknown>[]> {
  return {
    roles: store.roles.map(M.roleToRow),
    users: store.users.map(M.userToRow),
    departments: store.departments.map(M.departmentToRow),
    agencies: store.agencies.map(M.agencyToRow),
    employees: store.employees.map(M.employeeToRow),
    attendance_records: store.attendance.map(M.attendanceToRow),
    payroll_runs: store.payrollRuns.map(M.payrollRunToRow),
    payroll_approvals: store.payrollApprovals.map(M.payrollApprovalToRow),
    payroll_entries: [], // not held client-side
    contribution_rates: store.contributionRates.map(M.contributionToRow),
    reports: store.reports.map(M.reportToRow),
    documents: store.documents.map(M.documentToRow),
    notifications: store.notifications.map(M.notificationToRow),
    log_entries: store.logs.map(M.logToRow),
    settings: [{ id: 1, ...M.settingsToRow(store.settings) }],
  };
}

/**
 * Assemble a full backup document. Pulls live from Supabase when configured
 * (requires an authenticated session for RLS to return rows), otherwise
 * serialises the passed-in store snapshot.
 */
export async function fetchBackup(store: StoreValue): Promise<BackupFile> {
  const createdAt = new Date().toISOString();
  let tables: Record<string, Record<string, unknown>[]>;
  let source: "supabase" | "in-memory";

  if (isSupabaseConfigured && supabase) {
    source = "supabase";
    const entries = await Promise.all(
      MONITORED_TABLES.map(async (t) => [t, await fetchTable(t)] as const),
    );
    tables = Object.fromEntries(entries);
  } else {
    source = "in-memory";
    tables = backupFromStore(store);
  }

  const tableCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const [name, rows] of Object.entries(tables)) {
    tableCounts[name] = rows.length;
    totalRows += rows.length;
  }

  return {
    meta: {
      app: "aurora",
      kind: "database-backup",
      version: 1,
      createdAt,
      source,
      projectUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
      tableCounts,
      totalRows,
    },
    tables,
  };
}

/** Trigger a browser download of any JSON-serialisable value. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** A yyyymmdd-hhmm stamp for backup filenames. */
export function backupStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Fetch one table and download it as CSV (raw DB columns). */
export async function downloadTableCsv(table: MonitoredTable): Promise<number> {
  if (!isSupabaseConfigured || !supabase) throw new Error("No backend configured.");
  const rows = await fetchTable(table);
  downloadCsv(`aurora-${table}-${backupStamp()}.csv`, rows);
  return rows.length;
}
