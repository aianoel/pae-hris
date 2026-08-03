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
import type { LeaveType } from "@/lib/leave";
import type { LeaveRecord } from "@/lib/leaveRecords";
import type { Loan } from "@/lib/loans";
import type { LoanEntry, LoanTabKey } from "@/lib/employeeLoans";
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
  // Credential information (statutory PH IDs)
  sss: r.sss ?? undefined,
  philhealth: r.philhealth ?? undefined,
  pagibig: r.pagibig ?? undefined,
  tin: r.tin ?? undefined,
  // Other credentials
  passport: r.passport ?? undefined,
  licence: r.licence ?? undefined,
  licenceExpiry:
    typeof r.licence_expiry === "string" ? r.licence_expiry.slice(0, 10) : r.licence_expiry ?? undefined,
  bankName: r.bank_name ?? undefined,
  bankAccount: r.bank_account ?? undefined,
  otherIdName: r.other_id_name ?? undefined,
  otherIdNumber: r.other_id_number ?? undefined,
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
  // Credentials are always written, unlike the fields above: the form clears a
  // credential by dropping the key, so an omit-when-undefined spread would let
  // the stale column value survive the upsert. Absent/empty maps to NULL.
  sss: e.sss || null,
  philhealth: e.philhealth || null,
  pagibig: e.pagibig || null,
  tin: e.tin || null,
  passport: e.passport || null,
  licence: e.licence || null,
  licence_expiry: e.licenceExpiry || null,
  bank_name: e.bankName || null,
  bank_account: e.bankAccount || null,
  other_id_name: e.otherIdName || null,
  other_id_number: e.otherIdNumber || null,
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

/**
 * Whole-row variant for a manually edited day, where the punch times are the
 * thing being changed.
 *
 * {@link attendanceToRow} omits undefined fields so a partial patch only touches
 * what it names — but an upsert updates *only the columns in the payload*, so an
 * omitted `time_in` keeps its old value. That makes clearing a punch impossible
 * through the partial mapper. This one always sends both times, so undefined
 * genuinely erases.
 */
export const attendanceDayToRow = (a: AttendanceRecord): Record<string, unknown> => ({
  ...attendanceToRow(a),
  time_in: a.timeIn ?? null,
  time_out: a.timeOut ?? null,
});

// ---- Payroll runs ---------------------------------------------------------
export const payrollRunFromRow = (r: any): PayrollRun => ({
  id: r.id,
  period: r.period,
  // null stays null (= whole-company run); "" is a real value (= direct hires),
  // so it must not be collapsed to null by a `??`.
  agencyScope: r.agency_scope ?? null,
  headcount: Number(r.headcount),
  gross: Number(r.gross),
  status: r.status,
  createdAt: r.created_at,
});
export const payrollRunToRow = (p: Partial<PayrollRun>): Record<string, unknown> => ({
  ...(p.id !== undefined && { id: p.id }),
  ...(p.period !== undefined && { period: p.period }),
  ...(p.agencyScope !== undefined && { agency_scope: p.agencyScope }),
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
  // Unpaid-time drivers behind the absences/late/undertime amounts above.
  absent_days: row.absentDays,
  tardy_days: row.tardyDays,
  undertime_minutes: row.undertimeMinutes,
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

// ---- Leave types ----------------------------------------------------------
export const leaveTypeFromRow = (r: any): LeaveType => ({
  id: r.id,
  name: r.name,
  code: r.code,
  description: r.description ?? "",
  daysPerYear: Number(r.days_per_year),
  payRule: r.pay_rule,
  // Stored as a text[]; tolerate a null column on a partially-migrated backend.
  agencies: Array.isArray(r.agencies) ? r.agencies : [],
  carryOver: Boolean(r.carry_over),
  requiresApproval: Boolean(r.requires_approval),
  status: r.status,
  createdAt: r.created_at,
});
export const leaveTypeToRow = (t: Partial<LeaveType>): Record<string, unknown> => ({
  ...(t.id !== undefined && { id: t.id }),
  ...(t.name !== undefined && { name: t.name }),
  ...(t.code !== undefined && { code: t.code }),
  ...(t.description !== undefined && { description: t.description }),
  ...(t.daysPerYear !== undefined && { days_per_year: t.daysPerYear }),
  ...(t.payRule !== undefined && { pay_rule: t.payRule }),
  ...(t.agencies !== undefined && { agencies: t.agencies }),
  ...(t.carryOver !== undefined && { carry_over: t.carryOver }),
  ...(t.requiresApproval !== undefined && { requires_approval: t.requiresApproval }),
  ...(t.status !== undefined && { status: t.status }),
  ...(t.createdAt !== undefined && { created_at: t.createdAt }),
});

// ---- Leave records (filed applications) -----------------------------------
// leave_type_name/code and pay_rule are snapshots taken at filing time, not
// joins: the record must keep the terms it was granted under even after the
// catalogue entry is renamed or re-priced.
export const leaveRecordFromRow = (r: any): LeaveRecord => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.employee_name ?? "",
  leaveTypeId: r.leave_type_id,
  leaveTypeName: r.leave_type_name ?? "",
  leaveTypeCode: r.leave_type_code ?? "",
  payRule: r.pay_rule,
  startDate: typeof r.start_date === "string" ? r.start_date.slice(0, 10) : r.start_date,
  endDate: typeof r.end_date === "string" ? r.end_date.slice(0, 10) : r.end_date,
  reason: r.reason ?? "",
  status: r.status,
  decidedBy: r.decided_by ?? "",
  decidedAt: r.decided_at ?? "",
  createdAt: r.created_at,
});
export const leaveRecordToRow = (l: Partial<LeaveRecord>): Record<string, unknown> => ({
  ...(l.id !== undefined && { id: l.id }),
  ...(l.employeeId !== undefined && { employee_id: l.employeeId }),
  ...(l.employeeName !== undefined && { employee_name: l.employeeName }),
  ...(l.leaveTypeId !== undefined && { leave_type_id: l.leaveTypeId }),
  ...(l.leaveTypeName !== undefined && { leave_type_name: l.leaveTypeName }),
  ...(l.leaveTypeCode !== undefined && { leave_type_code: l.leaveTypeCode }),
  ...(l.payRule !== undefined && { pay_rule: l.payRule }),
  ...(l.startDate !== undefined && { start_date: l.startDate }),
  ...(l.endDate !== undefined && { end_date: l.endDate }),
  ...(l.reason !== undefined && { reason: l.reason }),
  ...(l.status !== undefined && { status: l.status }),
  // Empty strings mean "no decision yet"; the columns are nullable timestamps
  // and text, so send NULL rather than '' (which a timestamptz would reject).
  ...(l.decidedBy !== undefined && { decided_by: l.decidedBy || null }),
  ...(l.decidedAt !== undefined && { decided_at: l.decidedAt || null }),
  ...(l.createdAt !== undefined && { created_at: l.createdAt }),
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

// ---- Employee loan entries (per-employee, tabbed ledger) ------------------
export const employeeLoanEntryFromRow = (r: any): LoanEntry => ({
  id: r.id,
  employeeId: r.employee_id,
  tab: r.tab as LoanTabKey,
  amount: Number(r.amount),
  term: r.term ?? "",
  perMonth: Number(r.per_month),
  type: r.type ?? "",
  date: typeof r.entry_date === "string" ? r.entry_date.slice(0, 10) : r.entry_date,
  control: r.control ?? "",
  paid: Number(r.paid),
});
export const employeeLoanEntryToRow = (l: Partial<LoanEntry>): Record<string, unknown> => ({
  ...(l.id !== undefined && { id: l.id }),
  ...(l.employeeId !== undefined && { employee_id: l.employeeId }),
  ...(l.tab !== undefined && { tab: l.tab }),
  ...(l.amount !== undefined && { amount: l.amount }),
  ...(l.term !== undefined && { term: l.term }),
  ...(l.perMonth !== undefined && { per_month: l.perMonth }),
  ...(l.type !== undefined && { type: l.type }),
  ...(l.date !== undefined && { entry_date: l.date }),
  ...(l.control !== undefined && { control: l.control }),
  ...(l.paid !== undefined && { paid: l.paid }),
});
