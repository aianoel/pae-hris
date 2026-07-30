/**
 * Row mappers between Supabase (snake_case columns, DB types) and the app's
 * camelCase domain objects (src/store/types.ts). Kept separate from the API
 * calls so both directions live in one place and stay in sync with schema.sql.
 */
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
import type { Loan } from "@/lib/loans";
import type { PayrollRow } from "@/lib/payroll";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Employees ------------------------------------------------------------
export const employeeFromRow = (r: any): Employee => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  department: r.department,
  status: r.status,
  location: r.location,
  joined: typeof r.joined === "string" ? r.joined.slice(0, 10) : r.joined,
  salary: Number(r.salary),
  employmentType: r.employment_type ?? undefined,
  payClass: r.pay_class ?? undefined,
  agency: r.agency ?? undefined,
  bioId: r.bio_id ?? undefined,
  avatar: r.avatar ?? undefined,
});
export const employeeToRow = (e: Partial<Employee>): Record<string, unknown> => ({
  ...(e.id !== undefined && { id: e.id }),
  ...(e.name !== undefined && { name: e.name }),
  ...(e.email !== undefined && { email: e.email }),
  ...(e.role !== undefined && { role: e.role }),
  ...(e.department !== undefined && { department: e.department }),
  ...(e.status !== undefined && { status: e.status }),
  ...(e.location !== undefined && { location: e.location }),
  ...(e.joined !== undefined && { joined: e.joined }),
  ...(e.salary !== undefined && { salary: e.salary }),
  ...(e.employmentType !== undefined && { employment_type: e.employmentType }),
  ...(e.payClass !== undefined && { pay_class: e.payClass }),
  ...(e.agency !== undefined && { agency: e.agency ?? null }),
  ...(e.bioId !== undefined && { bio_id: e.bioId }),
  ...(e.avatar !== undefined && { avatar: e.avatar }),
});

// ---- Users ----------------------------------------------------------------
export const userFromRow = (r: any): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  status: r.status,
  lastActive: r.last_active,
  access: r.access ?? [],
});
export const userToRow = (u: Partial<User>): Record<string, unknown> => ({
  ...(u.id !== undefined && { id: u.id }),
  ...(u.name !== undefined && { name: u.name }),
  ...(u.email !== undefined && { email: u.email }),
  ...(u.role !== undefined && { role: u.role }),
  ...(u.status !== undefined && { status: u.status }),
  ...(u.lastActive !== undefined && { last_active: u.lastActive }),
  ...(u.access !== undefined && { access: u.access }),
});

// ---- Departments ----------------------------------------------------------
export const departmentFromRow = (r: any): Department => ({
  id: r.id,
  name: r.name,
  lead: r.lead,
  budget: Number(r.budget),
  color: r.color,
});
export const departmentToRow = (d: Partial<Department>): Record<string, unknown> => ({
  ...(d.id !== undefined && { id: d.id }),
  ...(d.name !== undefined && { name: d.name }),
  ...(d.lead !== undefined && { lead: d.lead }),
  ...(d.budget !== undefined && { budget: d.budget }),
  ...(d.color !== undefined && { color: d.color }),
});

// ---- Agencies -------------------------------------------------------------
export const agencyFromRow = (r: any): Agency => ({
  name: r.name,
  logo: r.logo ?? undefined,
});
export const agencyToRow = (a: Partial<Agency>): Record<string, unknown> => ({
  ...(a.name !== undefined && { name: a.name }),
  ...(a.logo !== undefined && { logo: a.logo ?? null }),
});

// ---- Attendance -----------------------------------------------------------
export const attendanceFromRow = (r: any): AttendanceRecord => ({
  id: r.id,
  employeeId: r.employee_id,
  // employeeName/department are display-only; resolved from employees at read.
  employeeName: r.employee_name ?? "",
  department: r.department ?? "",
  date: typeof r.date === "string" ? r.date.slice(0, 10) : r.date,
  day: r.day,
  state: r.state,
  timeIn: r.time_in ?? undefined,
  timeOut: r.time_out ?? undefined,
  bioId: r.bio_id ?? undefined,
});
export const attendanceToRow = (a: Partial<AttendanceRecord>): Record<string, unknown> => ({
  ...(a.id !== undefined && { id: a.id }),
  ...(a.employeeId !== undefined && { employee_id: a.employeeId }),
  ...(a.date !== undefined && { date: a.date }),
  ...(a.day !== undefined && { day: a.day }),
  ...(a.state !== undefined && { state: a.state }),
  // times: undefined → leave; null clears. Only send when defined.
  ...(a.timeIn !== undefined && { time_in: a.timeIn ?? null }),
  ...(a.timeOut !== undefined && { time_out: a.timeOut ?? null }),
  ...(a.bioId !== undefined && { bio_id: a.bioId ?? null }),
});

// ---- Payroll runs ---------------------------------------------------------
export const payrollRunFromRow = (r: any): PayrollRun => ({
  id: r.id,
  period: r.period,
  headcount: Number(r.headcount),
  gross: Number(r.gross),
  status: r.status,
  createdAt: r.created_at,
});
export const payrollRunToRow = (p: Partial<PayrollRun>): Record<string, unknown> => ({
  ...(p.id !== undefined && { id: p.id }),
  ...(p.period !== undefined && { period: p.period }),
  ...(p.headcount !== undefined && { headcount: p.headcount }),
  ...(p.gross !== undefined && { gross: p.gross }),
  ...(p.status !== undefined && { status: p.status }),
  ...(p.createdAt !== undefined && { created_at: p.createdAt }),
});

// ---- Payroll approvals ----------------------------------------------------
export const payrollApprovalFromRow = (r: any): PayrollApproval => ({
  id: r.id,
  period: r.period,
  agencyLabel: r.agency_label,
  agencyScope: r.agency_scope ?? null,
  headcount: Number(r.headcount),
  gross: Number(r.gross),
  net: Number(r.net),
  status: r.status,
  createdAt: r.created_at,
});
export const payrollApprovalToRow = (a: Partial<PayrollApproval>): Record<string, unknown> => ({
  ...(a.id !== undefined && { id: a.id }),
  ...(a.period !== undefined && { period: a.period }),
  ...(a.agencyLabel !== undefined && { agency_label: a.agencyLabel }),
  ...(a.agencyScope !== undefined && { agency_scope: a.agencyScope }),
  ...(a.headcount !== undefined && { headcount: a.headcount }),
  ...(a.gross !== undefined && { gross: a.gross }),
  ...(a.net !== undefined && { net: a.net }),
  ...(a.status !== undefined && { status: a.status }),
  ...(a.createdAt !== undefined && { created_at: a.createdAt }),
});

// ---- Payroll entries (per-employee data-entry line, keyed by run) ----------
// PayrollRow carries display-only fields (name/position/department/agency/status)
// that aren't persisted; only the employee link + numeric components are stored.
export const payrollEntryToRow = (
  runId: string,
  row: PayrollRow,
): Record<string, unknown> => ({
  id: `${runId}:${row.employeeId}`,
  run_id: runId,
  employee_id: row.employeeId,
  employee_type: row.employeeType,
  basic: row.basic,
  allowances: row.allowances,
  overtime: row.overtime,
  night_diff: row.nightDiff,
  holiday_pay: row.holidayPay,
  adjustments: row.adjustments,
  bonuses: row.bonuses,
  commissions: row.commissions,
  other_earnings: row.otherEarnings,
  gov_deductions: row.govDeductions,
  loans: row.loans,
  cash_advance: row.cashAdvance,
  late: row.late,
  undertime: row.undertime,
  absences: row.absences,
  lwop: row.lwop,
  other_deductions: row.otherDeductions,
  overtime_hours: row.overtimeHours,
  night_diff_hours: row.nightDiffHours,
  lwop_days: row.lwopDays,
});

// ---- Reports --------------------------------------------------------------
export const reportFromRow = (r: any): Report => ({
  id: r.id,
  name: r.name,
  type: r.type,
  range: r.range,
  rows: Number(r.rows),
  createdAt: r.created_at,
});
export const reportToRow = (r: Partial<Report>): Record<string, unknown> => ({
  ...(r.id !== undefined && { id: r.id }),
  ...(r.name !== undefined && { name: r.name }),
  ...(r.type !== undefined && { type: r.type }),
  ...(r.range !== undefined && { range: r.range }),
  ...(r.rows !== undefined && { rows: r.rows }),
  ...(r.createdAt !== undefined && { created_at: r.createdAt }),
});

// ---- Documents ------------------------------------------------------------
export const documentFromRow = (r: any): Document => ({
  id: r.id,
  name: r.name,
  type: r.type,
  size: r.size,
  owner: r.owner,
  updatedAt: r.updated_at,
});
export const documentToRow = (d: Partial<Document>): Record<string, unknown> => ({
  ...(d.id !== undefined && { id: d.id }),
  ...(d.name !== undefined && { name: d.name }),
  ...(d.type !== undefined && { type: d.type }),
  ...(d.size !== undefined && { size: d.size }),
  ...(d.owner !== undefined && { owner: d.owner }),
  ...(d.updatedAt !== undefined && { updated_at: d.updatedAt }),
});

// ---- Roles ----------------------------------------------------------------
export const roleFromRow = (r: any): Role => ({
  id: r.id,
  name: r.name,
  description: r.description,
  members: Number(r.members),
  permissions: r.permissions,
});
export const roleToRow = (r: Partial<Role>): Record<string, unknown> => ({
  ...(r.id !== undefined && { id: r.id }),
  ...(r.name !== undefined && { name: r.name }),
  ...(r.description !== undefined && { description: r.description }),
  ...(r.members !== undefined && { members: r.members }),
  ...(r.permissions !== undefined && { permissions: r.permissions }),
});

// ---- Notifications --------------------------------------------------------
export const notificationFromRow = (r: any): Notification => ({
  id: r.id,
  icon: r.icon,
  title: r.title,
  desc: r.descr,
  time: r.time,
  unread: r.unread,
  tint: r.tint,
});
export const notificationToRow = (n: Partial<Notification>): Record<string, unknown> => ({
  ...(n.id !== undefined && { id: n.id }),
  ...(n.icon !== undefined && { icon: n.icon }),
  ...(n.title !== undefined && { title: n.title }),
  ...(n.desc !== undefined && { descr: n.desc }),
  ...(n.time !== undefined && { time: n.time }),
  ...(n.unread !== undefined && { unread: n.unread }),
  ...(n.tint !== undefined && { tint: n.tint }),
});

// ---- Log entries ----------------------------------------------------------
export const logFromRow = (r: any): LogEntry => ({
  id: r.id,
  type: r.type,
  actor: r.actor,
  actorEmail: r.actor_email ?? undefined,
  action: r.action,
  target: r.target,
  time: r.time,
  ip: r.ip ?? undefined,
  device: r.device ?? undefined,
});
export const logToRow = (l: Partial<LogEntry>): Record<string, unknown> => ({
  ...(l.id !== undefined && { id: l.id }),
  ...(l.type !== undefined && { type: l.type }),
  ...(l.actor !== undefined && { actor: l.actor }),
  ...(l.actorEmail !== undefined && { actor_email: l.actorEmail }),
  ...(l.action !== undefined && { action: l.action }),
  ...(l.target !== undefined && { target: l.target }),
  ...(l.time !== undefined && { time: l.time }),
  ...(l.ip !== undefined && { ip: l.ip }),
  ...(l.device !== undefined && { device: l.device }),
});

// ---- Settings -------------------------------------------------------------
export const settingsFromRow = (r: any): Settings => ({
  workspaceName: r.workspace_name,
  timezone: r.timezone,
  weekStart: r.week_start,
  emailNotifications: r.email_notifications,
  productUpdates: r.product_updates,
  weeklyDigest: r.weekly_digest,
  theme: r.theme ?? "light",
});
export const settingsToRow = (s: Partial<Settings>): Record<string, unknown> => ({
  ...(s.workspaceName !== undefined && { workspace_name: s.workspaceName }),
  ...(s.timezone !== undefined && { timezone: s.timezone }),
  ...(s.weekStart !== undefined && { week_start: s.weekStart }),
  ...(s.emailNotifications !== undefined && { email_notifications: s.emailNotifications }),
  ...(s.productUpdates !== undefined && { product_updates: s.productUpdates }),
  ...(s.weeklyDigest !== undefined && { weekly_digest: s.weeklyDigest }),
  ...(s.theme !== undefined && { theme: s.theme }),
});

// ---- Contribution rates ---------------------------------------------------
export const contributionFromRow = (r: any): ContributionRate => ({
  id: r.id,
  type: r.type,
  salaryFrom: Number(r.salary_from),
  salaryTo: Number(r.salary_to),
  msc: Number(r.msc),
  employerShare: Number(r.employer_share),
  employeeShare: Number(r.employee_share),
  total: Number(r.total),
  effectiveMonth: Number(r.effective_month),
  effectiveYear: Number(r.effective_year),
  status: r.status,
});
export const contributionToRow = (c: Partial<ContributionRate>): Record<string, unknown> => ({
  ...(c.id !== undefined && { id: c.id }),
  ...(c.type !== undefined && { type: c.type }),
  ...(c.salaryFrom !== undefined && { salary_from: c.salaryFrom }),
  ...(c.salaryTo !== undefined && { salary_to: c.salaryTo }),
  ...(c.msc !== undefined && { msc: c.msc }),
  ...(c.employerShare !== undefined && { employer_share: c.employerShare }),
  ...(c.employeeShare !== undefined && { employee_share: c.employeeShare }),
  ...(c.total !== undefined && { total: c.total }),
  ...(c.effectiveMonth !== undefined && { effective_month: c.effectiveMonth }),
  ...(c.effectiveYear !== undefined && { effective_year: c.effectiveYear }),
  ...(c.status !== undefined && { status: c.status }),
});

// ---- Loans ----------------------------------------------------------------
export const loanFromRow = (r: any): Loan => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.employee_name ?? "",
  type: r.type,
  reference: r.reference ?? "",
  principal: Number(r.principal),
  interestRate: Number(r.interest_rate),
  termMonths: Number(r.term_months),
  monthlyAmortization: Number(r.monthly_amortization),
  amountPaid: Number(r.amount_paid),
  startDate: r.start_date,
  status: r.status,
});
export const loanToRow = (l: Partial<Loan>): Record<string, unknown> => ({
  ...(l.id !== undefined && { id: l.id }),
  ...(l.employeeId !== undefined && { employee_id: l.employeeId }),
  ...(l.employeeName !== undefined && { employee_name: l.employeeName }),
  ...(l.type !== undefined && { type: l.type }),
  ...(l.reference !== undefined && { reference: l.reference }),
  ...(l.principal !== undefined && { principal: l.principal }),
  ...(l.interestRate !== undefined && { interest_rate: l.interestRate }),
  ...(l.termMonths !== undefined && { term_months: l.termMonths }),
  ...(l.monthlyAmortization !== undefined && { monthly_amortization: l.monthlyAmortization }),
  ...(l.amountPaid !== undefined && { amount_paid: l.amountPaid }),
  ...(l.startDate !== undefined && { start_date: l.startDate }),
  ...(l.status !== undefined && { status: l.status }),
});
