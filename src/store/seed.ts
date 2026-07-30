/**
 * Seed data for the in-memory store. The workspace ships empty — only the
 * admin login, the Administrator role, and workspace settings remain. Every
 * operational record (employees, departments, attendance, payroll, reports,
 * documents, notifications, logs) starts blank and is created through the UI.
 */
import type {
  User,
  Department,
  AttendanceRecord,
  PayrollRun,
  Report,
  Document,
  Role,
  Settings,
  Notification,
  LogEntry,
} from "./types";

export const seedUsers: User[] = [
  { id: "USR-01", name: "Maya Kapoor", email: "maya@aurora.app", role: "Administrator", status: "active", lastActive: "just now", access: ["*"] },
];

export const seedDepartments: Department[] = [];

export const seedAttendance: AttendanceRecord[] = [];

export const seedPayrollRuns: PayrollRun[] = [];

export const seedReports: Report[] = [];

export const seedDocuments: Document[] = [];

export const seedRoles: Role[] = [
  { id: "ROLE-01", name: "Administrator", description: "Full access to every module.", members: 1, permissions: { view: true, create: true, edit: true, delete: true } },
];

export const seedSettings: Settings = {
  workspaceName: "Aurora Labs",
  timezone: "America/Los_Angeles",
  weekStart: "Monday",
  emailNotifications: true,
  productUpdates: true,
  weeklyDigest: false,
  theme: "light",
};

export const seedNotifications: Notification[] = [];

export const seedLogs: LogEntry[] = [];
