/**
 * Thin data-access layer over Supabase. The store loads everything once on
 * mount via `loadAll()`, then uses the per-table `upsert*`/`delete*`/`insert*`
 * helpers as write-through side effects (React state stays the source of truth
 * for the UI; these persist the change). Every write throws on error so the
 * store can surface a toast and (optionally) roll back.
 */
import { requireSupabase, supabase } from "@/lib/supabase";
import type {
  Employee,
  User,
  Department,
  Agency,
  AttendanceRecord,
  PayrollRun,
  PayrollApproval,
  Report,
  Document,
  Role,
  Settings,
  Notification,
  LogEntry,
} from "@/store/types";
import type { ContributionRate } from "@/lib/contributions";
import type { LeaveType } from "@/lib/leave";
import type { LeaveRecord } from "@/lib/leaveRecords";
import type { Loan } from "@/lib/loans";
import type { LoanEntry } from "@/lib/employeeLoans";
import type { PayrollRow } from "@/lib/payroll";
import * as M from "./mappers";

export interface AllData {
  employees: Employee[];
  users: User[];
  departments: Department[];
  agencies: Agency[];
  attendance: AttendanceRecord[];
  payrollRuns: PayrollRun[];
  payrollApprovals: PayrollApproval[];
  reports: Report[];
  documents: Document[];
  roles: Role[];
  settings: Settings | null;
  notifications: Notification[];
  logs: LogEntry[];
  contributionRates: ContributionRate[];
  loans: Loan[];
  employeeLoanEntries: LoanEntry[];
  leaveTypes: LeaveType[];
  leaveRecords: LeaveRecord[];
}

/** Fetch a whole table (paged past the 1000-row default cap). */
async function fetchAll<T>(table: string, map: (r: unknown) => T): Promise<T[]> {
  const sb = requireSupabase();
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []).map(map));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Like {@link fetchAll} but resolves to `[]` instead of throwing when the table
 * is missing/unreadable. Used for tables added by a later migration that a given
 * backend may not have run yet, so their absence can't break the whole load.
 */
async function fetchAllSoft<T>(table: string, map: (r: unknown) => T): Promise<T[]> {
  try {
    return await fetchAll(table, map);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[aurora] optional table "${table}" not loaded (run the migration?)`, err);
    return [];
  }
}

/** Load every table in parallel. Attendance names/departments are hydrated
 *  from the employees list so the domain object stays complete. */
export async function loadAll(): Promise<AllData> {
  const [
    employees, users, departments, agencies, attendanceRows, payrollRuns,
    payrollApprovals, reports, documents, roles, settingsRows, notifications,
    logs, contributionRates, loans, employeeLoanEntries, leaveTypes, leaveRecords,
  ] = await Promise.all([
    fetchAll("employees", M.employeeFromRow),
    fetchAll("users", M.userFromRow),
    fetchAll("departments", M.departmentFromRow),
    fetchAll("agencies", M.agencyFromRow),
    fetchAll("attendance_records", M.attendanceFromRow),
    fetchAll("payroll_runs", M.payrollRunFromRow),
    fetchAll("payroll_approvals", M.payrollApprovalFromRow),
    fetchAll("reports", M.reportFromRow),
    fetchAll("documents", M.documentFromRow),
    fetchAll("roles", M.roleFromRow),
    fetchAll("settings", M.settingsFromRow),
    fetchAll("notifications", M.notificationFromRow),
    fetchAll("log_entries", M.logFromRow),
    fetchAll("contribution_rates", M.contributionFromRow),
    fetchAllSoft("loans", M.loanFromRow),
    fetchAllSoft("employee_loan_entries", M.employeeLoanEntryFromRow),
    fetchAllSoft("leave_types", M.leaveTypeFromRow),
    fetchAllSoft("leave_records", M.leaveRecordFromRow),
  ]);

  const empById = new Map(employees.map((e) => [e.id, e]));
  const attendance = attendanceRows.map((a) => {
    const e = empById.get(a.employeeId);
    return e ? { ...a, employeeName: e.name, department: e.department, bioId: e.bioId } : a;
  });

  return {
    employees, users, departments, agencies, attendance, payrollRuns,
    payrollApprovals, reports, documents, roles,
    settings: settingsRows[0] ?? null,
    notifications, logs, contributionRates, loans, employeeLoanEntries, leaveTypes,
    leaveRecords,
  };
}

// ---- Generic helpers ------------------------------------------------------
async function upsert(table: string, row: Record<string, unknown>, onConflict?: string) {
  const sb = requireSupabase();
  const q = sb.from(table).upsert(row, onConflict ? { onConflict } : undefined);
  const { error } = await q;
  if (error) throw error;
}
async function upsertMany(table: string, rows: Record<string, unknown>[], onConflict?: string) {
  if (!rows.length) return;
  const sb = requireSupabase();
  const { error } = await sb.from(table).upsert(rows, onConflict ? { onConflict } : undefined);
  if (error) throw error;
}
async function remove(table: string, id: string | number) {
  const sb = requireSupabase();
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw error;
}

// ---- Per-entity write-through --------------------------------------------
export const db = {
  configured: () => Boolean(supabase),

  // Employees
  upsertEmployee: (e: Employee) => upsert("employees", M.employeeToRow(e)),
  deleteEmployee: (id: string) => remove("employees", id),
  upsertEmployees: (es: Employee[]) => upsertMany("employees", es.map(M.employeeToRow)),

  // Users
  upsertUser: (u: User) => upsert("users", M.userToRow(u)),
  deleteUser: (id: string) => remove("users", id),
  upsertUsers: (us: User[]) => upsertMany("users", us.map(M.userToRow)),

  // Departments
  upsertDepartment: (d: Department) => upsert("departments", M.departmentToRow(d)),
  deleteDepartment: (id: string) => remove("departments", id),
  upsertDepartments: (ds: Department[]) => upsertMany("departments", ds.map(M.departmentToRow)),

  // Agencies (keyed on `name`, not `id`)
  upsertAgency: (a: Agency) => upsert("agencies", M.agencyToRow(a), "name"),
  upsertAgencies: (as: Agency[]) => upsertMany("agencies", as.map(M.agencyToRow), "name"),
  deleteAgency: async (name: string) => {
    const sb = requireSupabase();
    const { error } = await sb.from("agencies").delete().eq("name", name);
    if (error) throw error;
  },

  // Attendance (unique on employee_id+date)
  upsertAttendance: (a: AttendanceRecord) => upsert("attendance_records", M.attendanceToRow(a)),
  upsertAttendanceMany: (as: AttendanceRecord[]) =>
    upsertMany("attendance_records", as.map(M.attendanceToRow), "employee_id,date"),
  deleteAttendance: (id: string) => remove("attendance_records", id),

  // Payroll
  upsertPayrollRun: (p: PayrollRun) => upsert("payroll_runs", M.payrollRunToRow(p)),
  upsertPayrollRuns: (ps: PayrollRun[]) => upsertMany("payroll_runs", ps.map(M.payrollRunToRow)),
  deletePayrollRun: (id: string) => remove("payroll_runs", id),

  // Payroll approvals
  upsertPayrollApproval: (a: PayrollApproval) =>
    upsert("payroll_approvals", M.payrollApprovalToRow(a)),
  deletePayrollApproval: (id: string) => remove("payroll_approvals", id),

  // Payroll entries (per-employee data-entry lines for a run; keyed run+employee)
  upsertPayrollEntries: (runId: string, rows: PayrollRow[]) =>
    upsertMany(
      "payroll_entries",
      rows.map((r) => M.payrollEntryToRow(runId, r)),
      "run_id,employee_id",
    ),

  // Reports
  upsertReport: (r: Report) => upsert("reports", M.reportToRow(r)),
  deleteReport: (id: string) => remove("reports", id),
  upsertReports: (rs: Report[]) => upsertMany("reports", rs.map(M.reportToRow)),

  // Documents
  upsertDocument: (d: Document) => upsert("documents", M.documentToRow(d)),
  deleteDocument: (id: string) => remove("documents", id),
  upsertDocuments: (ds: Document[]) => upsertMany("documents", ds.map(M.documentToRow)),

  // Roles
  upsertRole: (r: Role) => upsert("roles", M.roleToRow(r)),
  deleteRole: (id: string) => remove("roles", id),
  upsertRoles: (rs: Role[]) => upsertMany("roles", rs.map(M.roleToRow)),

  // Settings (single row id=1)
  upsertSettings: (s: Settings) => upsert("settings", { id: 1, ...M.settingsToRow(s) }),

  // Notifications
  upsertNotification: (n: Notification) => upsert("notifications", M.notificationToRow(n)),
  deleteNotification: (id: string) => remove("notifications", id),
  upsertNotifications: (ns: Notification[]) => upsertMany("notifications", ns.map(M.notificationToRow)),

  // Logs
  insertLog: (l: LogEntry) => upsert("log_entries", M.logToRow(l)),
  upsertLogs: (ls: LogEntry[]) => upsertMany("log_entries", ls.map(M.logToRow)),

  // Contribution rates
  upsertContributionRate: (c: ContributionRate) =>
    upsert("contribution_rates", M.contributionToRow(c)),
  deleteContributionRate: (id: string) => remove("contribution_rates", id),
  upsertContributionRates: (cs: ContributionRate[]) =>
    upsertMany("contribution_rates", cs.map(M.contributionToRow)),
  deleteContributionRates: async (ids: string[]) => {
    if (!ids.length) return;
    const sb = requireSupabase();
    const { error } = await sb.from("contribution_rates").delete().in("id", ids);
    if (error) throw error;
  },

  // Leave types
  upsertLeaveType: (t: LeaveType) => upsert("leave_types", M.leaveTypeToRow(t)),
  upsertLeaveTypes: (ts: LeaveType[]) =>
    upsertMany("leave_types", ts.map(M.leaveTypeToRow)),
  deleteLeaveType: (id: string) => remove("leave_types", id),

  // Leave records (filed applications)
  upsertLeaveRecord: (r: LeaveRecord) => upsert("leave_records", M.leaveRecordToRow(r)),
  upsertLeaveRecords: (rs: LeaveRecord[]) =>
    upsertMany("leave_records", rs.map(M.leaveRecordToRow)),
  deleteLeaveRecord: (id: string) => remove("leave_records", id),

  // Loans
  upsertLoan: (l: Loan) => upsert("loans", M.loanToRow(l)),
  deleteLoan: (id: string) => remove("loans", id),
  upsertLoans: (ls: Loan[]) => upsertMany("loans", ls.map(M.loanToRow)),
  deleteLoans: async (ids: string[]) => {
    if (!ids.length) return;
    const sb = requireSupabase();
    const { error } = await sb.from("loans").delete().in("id", ids);
    if (error) throw error;
  },

  // Employee loan entries (per-employee, tabbed ledger)
  upsertEmployeeLoanEntry: (l: LoanEntry) =>
    upsert("employee_loan_entries", M.employeeLoanEntryToRow(l)),
  deleteEmployeeLoanEntry: (id: string) => remove("employee_loan_entries", id),
  upsertEmployeeLoanEntries: (ls: LoanEntry[]) =>
    upsertMany("employee_loan_entries", ls.map(M.employeeLoanEntryToRow)),
};
