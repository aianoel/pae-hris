import * as React from "react";

import type {
  Employee,
  EmployeeStatus,
  User,
  Department,
  Agency,
  AttendanceRecord,
  AttendanceState,
  PayrollRun,
  PayrollApproval,
  Report,
  Document,
  Role,
  Permission,
  Settings,
  Notification,
  LogEntry,
  LogType,
} from "./types";
import type { ContributionRate, ContributionType } from "@/lib/contributions";
import type { PayrollRow, PayrollOverrides } from "@/lib/payroll";

/**
 * Store context + hook, kept in a component-free module.
 *
 * This lives apart from `StoreProvider` on purpose: a file that mixes component
 * and non-component exports is not a valid React Fast Refresh boundary, so
 * editing it re-runs the module and mints a brand-new context object. Consumers
 * compiled against the previous version would then read `null` and throw
 * "useStore must be used within <StoreProvider>". Isolating the context here
 * keeps its identity stable across HMR updates. See also `auth-context.ts`.
 */

export interface StoreValue {
  employees: Employee[];
  users: User[];
  departments: Department[];
  attendance: AttendanceRecord[];
  payrollRuns: PayrollRun[];
  /** Payroll batches submitted from the Run-payroll review, awaiting approval. */
  payrollApprovals: PayrollApproval[];
  reports: Report[];
  documents: Document[];
  roles: Role[];
  settings: Settings;
  notifications: Notification[];
  logs: LogEntry[];
  contributionRates: ContributionRate[];
  /** Registered manpower/staffing agencies, managed under Settings. */
  agencies: Agency[];

  /** False until the initial load from Supabase completes (true immediately in
   *  offline/seed mode). Pages can show a loading state while false. */
  ready: boolean;
  /** True when a Supabase backend is connected (vs. in-memory seed mode). */
  backed: boolean;

  // Audit
  addLog: (type: LogType, action: string, target?: string) => void;

  // Employees
  addEmployee: (e: Omit<Employee, "id">) => Employee;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;
  bulkSetEmployeeStatus: (ids: string[], status: EmployeeStatus) => void;

  // Agencies (registered under Settings; drives the employee-form dropdown)
  addAgency: (name: string, logo?: string) => void;
  updateAgencyLogo: (name: string, logo?: string) => void;
  removeAgency: (name: string) => void;

  // Users
  addUser: (u: Omit<User, "id" | "lastActive">) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  removeUser: (id: string) => void;
  toggleUserActive: (id: string) => void;

  // Departments
  addDepartment: (d: Omit<Department, "id" | "color">) => void;
  updateDepartment: (id: string, patch: Partial<Department>) => void;
  removeDepartment: (id: string) => void;
  headcountFor: (name: string) => number;

  // Attendance
  setAttendance: (id: string, state: AttendanceState) => void;
  importAttendance: (
    records: Omit<AttendanceRecord, "id">[],
  ) => { added: number; updated: number };
  /** LWOP days per employee id, derived from the last biometric import. */
  lwopDaysByEmployee: Record<string, number>;
  /** Store computed LWOP days (from an attendance import) for payroll to pick up. */
  setImportedLwop: (daysByEmployee: Record<string, number>) => void;

  // Payroll
  /**
   * Start a payroll run for `period`. Pass an `agency` name to scope the run to
   * that agency's staff, or "" (default) for a direct-hire run; omit for all.
   */
  runPayroll: (period: string, agency?: string) => void;
  markPayrollPaid: (id: string) => void;
  /** Disapprove a single run: revert a paid run back to "processed" (un-approve). */
  disapprovePayrollRun: (id: string) => void;
  /** Permanently remove a single payroll run. */
  removePayrollRun: (id: string) => void;
  /** Approve every payroll run for `period`: mark them paid (final). */
  approvePayrollPeriod: (period: string) => void;
  /**
   * Disapprove `period`: remove its payroll run(s) so the report locks again
   * and the period returns for re-running. Returns how many runs were removed.
   */
  disapprovePayrollPeriod: (period: string) => number;
  /**
   * Submit a reviewed batch for approval (from the Run-payroll review modal).
   * It appears on the Data-Entry screen as a pending approval.
   */
  submitPayrollForApproval: (
    batch: Omit<PayrollApproval, "id" | "status" | "createdAt">,
  ) => PayrollApproval;
  /** Approve a pending batch: locks the amounts and starts the actual run. */
  approvePayroll: (id: string) => void;
  /** Disapprove a pending batch: returns it to the Payroll module for editing. */
  disapprovePayroll: (id: string) => void;
  /**
   * Persist the data-entry grid for `period` to the database. Ensures a draft
   * payroll_run exists for the period, then upserts one payroll_entries row per
   * employee (keyed on run+employee). Returns the run id used. No-op count in
   * offline mode. Resolves once the write completes so the UI can confirm.
   */
  savePayrollEntries: (period: string, rows: PayrollRow[]) => Promise<number>;
  /**
   * Hand-edited payroll components per employee id, saved from the Data Entry
   * grid. Overlaid by buildPayrollRows so edited amounts carry through to the
   * Payroll Report and pre-run review.
   */
  payrollOverrides: PayrollOverrides;

  // Reports
  addReport: (r: Omit<Report, "id" | "createdAt">) => Report;
  removeReport: (id: string) => void;

  // Documents
  addDocument: (d: Omit<Document, "id" | "updatedAt">) => void;
  removeDocument: (id: string) => void;

  // Roles
  addRole: (r: Omit<Role, "id" | "members">) => void;
  updateRole: (id: string, patch: Partial<Role>) => void;
  removeRole: (id: string) => void;
  toggleRolePermission: (id: string, perm: Permission) => void;

  // Settings
  updateSettings: (patch: Partial<Settings>) => void;

  // Notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  removeNotification: (id: string) => void;

  // Contribution rates
  addContributionRate: (r: Omit<ContributionRate, "id" | "total">) => ContributionRate;
  updateContributionRate: (id: string, patch: Partial<Omit<ContributionRate, "id">>) => void;
  removeContributionRate: (id: string) => void;
  importContributionRates: (rows: Omit<ContributionRate, "id" | "total">[]) => number;
  removeContributionRatesBy: (filter: {
    type?: ContributionType;
    month?: number;
    year?: number;
  }) => number;
}

export const StoreContext = React.createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
