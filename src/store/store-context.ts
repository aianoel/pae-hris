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
import type {
  ContributionRate,
  ContributionType,
  EarningCode,
  EarningsMatrix,
} from "@/lib/contributions";
import type { Loan } from "@/lib/loans";
import type { LeaveType, LeaveTypeDraft } from "@/lib/leave";
import type {
  LeaveRecord,
  LeaveRecordStatus,
  NewLeaveRecord,
} from "@/lib/leaveRecords";
import type { LoanEntry, EmployeeLoans, NewLoanEntry } from "@/lib/employeeLoans";
import type {
  PayrollRow,
  PayrollOverrides,
  TimekeepingByEmployee,
} from "@/lib/payroll";

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
  /** Employee loans repaid through payroll amortisations. */
  loans: Loan[];
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
  /**
   * Itemised unpaid time per employee id from the last biometric import —
   * unpaid-leave days, unexcused absent days and pro-rated tardiness. Payroll
   * charges each on its own deduction line (LWOP / absences / late), so a day
   * is never docked twice. Approved paid leave never appears here.
   */
  timekeepingByEmployee: TimekeepingByEmployee;
  /** Store the computed timekeeping (from an attendance import) for payroll. */
  setImportedLwop: (timekeeping: TimekeepingByEmployee) => void;

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
  /**
   * Approve the payroll runs for `period`: mark them paid (final). Pass the
   * report's `agency` selection to approve only that agency's run; omit it (or
   * pass "All Agencies") to approve every run in the period. Returns how many
   * runs were approved.
   */
  approvePayrollPeriod: (period: string, agency?: string) => number;
  /**
   * Disapprove `period`: remove its payroll run(s) so the report locks again
   * and the period returns for re-running. Scoped by `agency` the same way as
   * {@link approvePayrollPeriod}. Returns how many runs were removed.
   */
  disapprovePayrollPeriod: (period: string, agency?: string) => number;
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

  // Contribution matrix (which earnings form each contribution's base)
  /**
   * Which earning codes are added to basic pay when computing each
   * contribution's base. Read by the payroll engine, so editing it changes what
   * payroll actually deducts — not just a display setting.
   */
  earningsMatrix: EarningsMatrix;
  /** Include/exclude one earning code in a contribution's base. */
  toggleMatrixEarning: (type: ContributionType, code: EarningCode) => void;
  /** Replace a contribution's whole earning set (Select all / Clear). */
  setMatrixEarnings: (type: ContributionType, codes: EarningCode[]) => void;

  // Loans
  /**
   * Register a loan. `id` and `monthlyAmortization` are assigned here — the
   * amortisation is always derived from principal/rate/term, never passed in.
   */
  addLoan: (draft: Omit<Loan, "id" | "monthlyAmortization">) => Loan;
  /** Patch a loan; the amortisation is recomputed whenever a driver changes. */
  updateLoan: (id: string, patch: Partial<Omit<Loan, "id">>) => void;
  /** Permanently remove a loan. */
  removeLoan: (id: string) => void;
  /** Create several loans at once (spreadsheet import). Returns the count added. */
  importLoans: (rows: Omit<Loan, "id" | "monthlyAmortization">[]) => number;
  /**
   * Record a repayment against a loan. The balance advances and the loan
   * auto-closes to "paid" once fully settled.
   */
  recordLoanPayment: (id: string, amount: number) => void;

  // Leave types (catalogue of leave categories, scoped per agency)
  /** Every leave type in the workspace, newest first. */
  leaveTypes: LeaveType[];
  /** Create a leave type. `id`/`createdAt` are assigned here. */
  addLeaveType: (draft: LeaveTypeDraft) => LeaveType;
  /** Patch a leave type in place. */
  updateLeaveType: (id: string, patch: Partial<Omit<LeaveType, "id" | "createdAt">>) => void;
  /** Permanently remove a leave type. */
  removeLeaveType: (id: string) => void;
  /** Create several leave types at once (the statutory presets). Returns the count added. */
  addLeaveTypes: (drafts: LeaveTypeDraft[]) => number;

  // Leave records (filed applications, as distinct from the type catalogue)
  /** Every filed leave application, newest first. */
  leaveRecords: LeaveRecord[];
  /**
   * File a leave application. The type's name, code and pay rule are
   * snapshotted onto the record so later catalogue edits can't re-price leave
   * already taken. Returns null when the leave type no longer exists.
   */
  fileLeave: (draft: NewLeaveRecord) => LeaveRecord | null;
  /**
   * Approve/reject/cancel a filed application. Only `approved` records suppress
   * an LWOP deduction, so this is the action that decides whether a leave day
   * costs the employee pay.
   */
  decideLeave: (id: string, status: LeaveRecordStatus) => void;
  /** Permanently remove a filed application. */
  removeLeaveRecord: (id: string) => void;

  // Employee loan entries (per-employee, tabbed Loans ledger)
  /** Every employee's loan-ledger lines (flat; group per employee with groupByTab). */
  employeeLoanEntries: LoanEntry[];
  /** One employee's ledger, grouped into the per-tab shape the dialog renders. */
  loansForEmployee: (employeeId: string) => EmployeeLoans;
  /** Append a ledger line (id/control/perMonth are assigned here). */
  addEmployeeLoanEntry: (entry: NewLoanEntry) => LoanEntry;
  /** Remove a ledger line by id. */
  removeEmployeeLoanEntry: (id: string) => void;
}

export const StoreContext = React.createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
