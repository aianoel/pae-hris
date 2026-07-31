/**
 * Shared domain types for the in-memory app store. These extend the mock data
 * shapes in `src/lib/data.ts` with the extra entities the admin screens manage.
 */
import type { Employee, EmployeeStatus, EmployeeType, PayClass, Activity } from "@/lib/data";

export type { Employee, EmployeeStatus, EmployeeType, PayClass, Activity };

/** A platform user account (distinct from an HR "employee"). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: string; // references a Role.name
  status: "active" | "inactive";
  lastActive: string;
  /**
   * Modules this user may open, as nav `to` paths (see src/lib/access.ts).
   * The sentinel "*" grants access to every module (administrators).
   */
  access: string[];
}

export interface Department {
  id: string;
  name: string;
  lead: string;
  budget: number; // annual, in PHP
  color: string;
}

/** A registered manpower/staffing agency (managed under Settings → Agencies). */
export interface Agency {
  name: string;
  /** Optional logo as a data URL (no backend — images are inlined). */
  logo?: string;
}

/**
 * A day's attendance outcome. `on-leave` is distinct from `absent` on purpose:
 * an approved leave day is accounted for, so payroll must not treat it as an
 * unexplained absence and dock pay for it — see `src/lib/leaveRecords.ts`.
 */
export type AttendanceState = "present" | "remote" | "absent" | "on-leave";

/** A single employee's status for a specific calendar day. */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  /** Calendar date this record is for, ISO `YYYY-MM-DD`. */
  date: string;
  day: string; // short weekday (Mon..Sun), derived from `date`
  state: AttendanceState;
  /** First / last biometric punch of the day, `HH:MM:SS` (24h). Optional. */
  timeIn?: string;
  timeOut?: string;
  /** Employee biometric device ID, carried for the Telecom Report. */
  bioId?: string;
}

export type PayrollStatus = "draft" | "processing" | "processed" | "paid";

export interface PayrollRun {
  id: string;
  period: string; // e.g. "December 2026"
  /**
   * Agency scope this run actually paid: `null`/absent = every employee,
   * `""` = direct hires only, otherwise the agency name. Mirrors
   * `PayrollApproval.agencyScope`, and is what lets the Payroll Report tell an
   * agency that has been processed from one that has not.
   *
   * Absent on runs created before the scope was recorded; those are treated as
   * whole-company runs, which is what they were.
   */
  agencyScope?: string | null;
  headcount: number;
  gross: number;
  status: PayrollStatus;
  createdAt: string;
}

/** Lifecycle of a payroll batch submitted from Payroll → Data Entry review. */
export type ApprovalStatus = "pending" | "approved";

/**
 * A payroll batch submitted for approval on the Data-Entry screen. Created when
 * the user proceeds from the Run-payroll review modal; the approver then
 * approves (locks the amounts + starts the run) or disapproves (which clears
 * this and returns the batch to the Payroll module for editing).
 */
export interface PayrollApproval {
  id: string;
  period: string;
  /** Display label for the agency scope ("All Agencies" / "Direct hire" / name). */
  agencyLabel: string;
  /** Scope passed to runPayroll: null = all, "" = direct hires, else agency name. */
  agencyScope: string | null;
  headcount: number;
  gross: number;
  net: number;
  status: ApprovalStatus;
  createdAt: string;
}

export interface Report {
  id: string;
  name: string;
  type: string;
  range: string;
  rows: number;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: string; // PDF, DOCX, XLSX…
  size: string;
  owner: string;
  updatedAt: string;
}

export type Permission = "view" | "create" | "edit" | "delete";

export interface Role {
  id: string;
  name: string;
  description: string;
  members: number;
  permissions: Record<Permission, boolean>;
}

export interface Settings {
  workspaceName: string;
  timezone: string;
  weekStart: "Monday" | "Sunday";
  emailNotifications: boolean;
  productUpdates: boolean;
  weeklyDigest: boolean;
  /** UI colour scheme preference, persisted in the DB (no localStorage). */
  theme: "light" | "dark";
}

export interface Notification {
  id: string;
  icon: string; // lucide icon name key
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  tint: string;
}

export type LogType =
  | "auth"
  | "employee"
  | "user"
  | "payroll"
  | "attendance"
  | "report"
  | "document"
  | "role"
  | "settings"
  | "system";

export interface LogEntry {
  id: string;
  type: LogType;
  actor: string;
  /** Email/identity of the actor, when signed in (security audit). */
  actorEmail?: string;
  action: string;
  target: string;
  time: string; // ISO string
  /** Client public IP captured at the time of the event (security audit). */
  ip?: string;
  /** Human-readable device descriptor (browser · OS) from the User-Agent. */
  device?: string;
}
