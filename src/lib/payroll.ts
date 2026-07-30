/**
 * Payroll data-entry domain model. Rows are derived deterministically from the
 * HR employee records so the grid is stable across refreshes (no persistence,
 * matching the rest of the app). All money is monthly, in whole PHP.
 */
import type { Employee, EmployeeType } from "@/store/types";

export type { EmployeeType };

export type PayrollRowStatus = "pending" | "in-review" | "ready" | "approved";

/** Every editable numeric field on a payroll row. */
export interface PayrollComponents {
  // Earnings
  basic: number;
  allowances: number;
  overtime: number; // derived: hourly rate × 125% × overtimeHours
  nightDiff: number; // derived: hourly rate × 10% × nightDiffHours
  holidayPay: number;
  adjustments: number;
  bonuses: number;
  commissions: number;
  otherEarnings: number;
  // Deductions
  govDeductions: number; // derived: statutory contributions + tax from basic
  loans: number;
  cashAdvance: number;
  late: number;
  undertime: number;
  absences: number;
  lwop: number; // derived: daily rate × lwopDays
  otherDeductions: number;
  // Timekeeping drivers — counts (not money) that auto-calc the fields above.
  overtimeHours: number;
  nightDiffHours: number;
  lwopDays: number;
}

export interface PayrollRow extends PayrollComponents {
  id: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  employeeType: EmployeeType;
  /** Staffing agency this employee is engaged through; "" for direct hires. */
  agency: string;
  status: PayrollRowStatus;
}

/** Field grouping used to render the grid and slide-over consistently. */
export type PayrollFieldKey = keyof PayrollComponents;

export const EARNING_FIELDS: { key: PayrollFieldKey; label: string }[] = [
  { key: "basic", label: "Basic Salary" },
  { key: "allowances", label: "Allowances" },
  { key: "overtime", label: "Overtime" },
  { key: "nightDiff", label: "Night Differential" },
  { key: "holidayPay", label: "Holiday Pay" },
  { key: "adjustments", label: "Adjustments" },
  { key: "bonuses", label: "Bonuses" },
  { key: "commissions", label: "Commissions" },
  { key: "otherEarnings", label: "Other Earnings" },
];

export const DEDUCTION_FIELDS: { key: PayrollFieldKey; label: string }[] = [
  { key: "govDeductions", label: "Government Deductions" },
  { key: "loans", label: "Loans" },
  { key: "cashAdvance", label: "Cash Advance" },
  { key: "late", label: "Late" },
  { key: "undertime", label: "Undertime" },
  { key: "absences", label: "Absences" },
  { key: "lwop", label: "LWOP" },
  { key: "otherDeductions", label: "Other Deductions" },
];

export const EARNING_KEYS = EARNING_FIELDS.map((f) => f.key);
export const DEDUCTION_KEYS = DEDUCTION_FIELDS.map((f) => f.key);

/**
 * Fields whose amount is computed from a driver and is therefore read-only in
 * the grid: overtime/nightDiff (from hours), govDeductions (from basic) and
 * lwop (from days). Editing the driver recomputes them — see recalcDerived.
 */
export const DERIVED_KEYS: PayrollFieldKey[] = ["overtime", "nightDiff", "govDeductions", "lwop"];

/** Timekeeping driver inputs the grid edits to auto-calc the derived amounts. */
export const DRIVER_FIELDS: { key: PayrollFieldKey; label: string; unit: string; drives: PayrollFieldKey }[] = [
  { key: "overtimeHours", label: "OT Hours", unit: "h", drives: "overtime" },
  { key: "nightDiffHours", label: "Night Diff Hours", unit: "h", drives: "nightDiff" },
  { key: "lwopDays", label: "LWOP Days", unit: "d", drives: "lwop" },
];

export const DRIVER_KEYS = DRIVER_FIELDS.map((f) => f.key);

/** Every editable component key (earnings + deductions + timekeeping drivers).
 *  Used to overlay hand-edited amounts onto a freshly derived row. */
export const COMPONENT_KEYS: PayrollFieldKey[] = [
  ...EARNING_KEYS,
  ...DEDUCTION_KEYS,
  ...DRIVER_KEYS,
];

export function grossPay(r: PayrollComponents): number {
  return EARNING_KEYS.reduce((sum, k) => sum + (r[k] || 0), 0);
}

export function totalDeductions(r: PayrollComponents): number {
  return DEDUCTION_KEYS.reduce((sum, k) => sum + (r[k] || 0), 0);
}

export function netPay(r: PayrollComponents): number {
  return grossPay(r) - totalDeductions(r);
}

// Deterministic pseudo-random from an index — mirrors src/lib/data.ts.
function seeded(i: number, mod: number) {
  return (i * 2654435761) % mod;
}

const TYPES: EmployeeType[] = ["Regular", "Regular", "Regular", "Probationary", "Contractual", "Part-time"];
const ROW_STATUS: PayrollRowStatus[] = ["pending", "in-review", "ready", "approved", "pending"];

// ---- Automation constants (Philippine payroll rules) --------------------

/** Standard paid hours per month: 22 working days × 8 hours. */
const HOURS_PER_MONTH = 176;

/** Monthly de-minimis allowance by employment type (PHP). */
const ALLOWANCE_BY_TYPE: Record<EmployeeType, number> = {
  Regular: 2000,
  Probationary: 1500,
  Contractual: 1000,
  "Part-time": 500,
};

/** Ordinary overtime premium (125%) and night-differential premium (10%). */
const OT_MULTIPLIER = 1.25;
const NIGHT_DIFF_RATE = 0.1;

/** Paid working days per year — divisor for the LWOP daily rate. */
export const WORKING_DAYS_PER_YEAR = 261;

export const hourlyRate = (basic: number) => basic / HOURS_PER_MONTH;

/** Daily rate from a monthly rate: (Monthly × 12) / 261. */
export const dailyRateFromMonthly = (monthly: number) => (monthly * 12) / WORKING_DAYS_PER_YEAR;

/** Overtime pay = hourly rate × 125% × hours. */
export const overtimePay = (basic: number, hours: number) =>
  Math.round(hourlyRate(basic) * OT_MULTIPLIER * hours);

/** Night-differential pay = hourly rate × 10% × hours. */
export const nightDiffPay = (basic: number, hours: number) =>
  Math.round(hourlyRate(basic) * NIGHT_DIFF_RATE * hours);

/** LWOP deduction = daily rate × LWOP days (whole PHP). */
export const lwopDeduction = (basic: number, days: number) =>
  Math.round(dailyRateFromMonthly(basic) * days);

/**
 * Recompute every derived amount (overtime, night diff, government deductions,
 * LWOP) from its driver on the row. Called after any edit so the grid's
 * auto-calculated fields — and therefore gross/deductions/net — stay in sync.
 */
export function recalcDerived<T extends PayrollComponents>(row: T): T {
  return {
    ...row,
    overtime: overtimePay(row.basic, row.overtimeHours),
    nightDiff: nightDiffPay(row.basic, row.nightDiffHours),
    govDeductions: statutoryDeductions(row.basic),
    lwop: lwopDeduction(row.basic, row.lwopDays),
  };
}

/** Statutory contributions (employee share) plus withholding tax, itemised. */
export interface StatutoryBreakdown {
  sss: number;
  philHealth: number;
  pagIbig: number;
  tax: number;
}

/**
 * Itemised statutory deductions (employee share) — SSS, PhilHealth and
 * Pag-IBIG — plus TRAIN-law withholding tax. Approximations sufficient for a
 * demo. Consumers that only need the combined figure use
 * `statutoryDeductions`; reports that itemise each line use this directly.
 */
export function statutoryBreakdown(basic: number): StatutoryBreakdown {
  const sss = Math.min(basic, 30000) * 0.045; // 4.5% up to the salary ceiling
  const philHealth = Math.min(Math.max(basic, 10000), 100000) * 0.025; // 2.5% employee share
  const pagIbig = Math.min(basic * 0.02, 200); // 2% capped at ₱200
  const taxable = basic - (sss + philHealth + pagIbig);
  return {
    sss: Math.round(sss),
    philHealth: Math.round(philHealth),
    pagIbig: Math.round(pagIbig),
    tax: Math.round(withholdingTax(taxable)),
  };
}

/** Combined statutory deductions, rolled into the government-deductions field. */
function statutoryDeductions(basic: number): number {
  const b = statutoryBreakdown(basic);
  return b.sss + b.philHealth + b.pagIbig + b.tax;
}

/** Progressive monthly withholding tax (TRAIN law brackets). */
function withholdingTax(taxable: number): number {
  if (taxable <= 20833) return 0;
  if (taxable <= 33332) return (taxable - 20833) * 0.15;
  if (taxable <= 66666) return 1875 + (taxable - 33333) * 0.2;
  if (taxable <= 166666) return 8541.8 + (taxable - 66667) * 0.25;
  if (taxable <= 666666) return 33541.8 + (taxable - 166667) * 0.3;
  return 183541.8 + (taxable - 666667) * 0.35;
}

/**
 * Auto-compute every payroll component for an employee. Fixed pay (basic,
 * allowances) comes from HR + type; variable pay (overtime, night diff, late,
 * absences) is derived from seeded per-employee hour counts standing in for
 * timekeeping data; statutory deductions come from the salary. Every value
 * remains editable in the grid afterward.
 */
export function computeComponents(
  basic: number,
  employeeType: EmployeeType,
  department: string,
  i: number,
): PayrollComponents {
  const s = (n: number, mod: number) => seeded(i + n, mod);
  const rate = hourlyRate(basic);

  // Timekeeping drivers (seeded stand-ins for real timesheet data).
  const overtimeHours = s(4, 12); // hours of overtime logged this period
  const nightDiffHours = s(5, 10);
  const lwopDays = s(24, 7) === 0 ? 1 + s(25, 3) : 0; // 0, or 1–3 unpaid days
  const lateMinutes = s(13, 45);
  const undertimeMinutes = s(14, 30);
  const absentDays = s(15, 3);

  return {
    // Earnings — computed from rates
    basic,
    allowances: ALLOWANCE_BY_TYPE[employeeType],
    overtime: overtimePay(basic, overtimeHours), // derived from overtimeHours
    nightDiff: nightDiffPay(basic, nightDiffHours), // derived from nightDiffHours
    holidayPay: s(6, 4) === 0 ? Math.round(rate * 8) : 0, // occasional holiday
    adjustments: 0,
    bonuses: s(8, 6) === 0 ? Math.round(basic * 0.1) : 0, // periodic incentive
    commissions: department === "Sales" ? s(9, 20) * 80 : 0,
    otherEarnings: 0,
    // Deductions — computed from salary + timekeeping
    govDeductions: statutoryDeductions(basic), // derived from basic
    loans: s(11, 6) === 0 ? 1500 : 0,
    cashAdvance: s(12, 4) === 0 ? 2000 : 0,
    late: Math.round((rate / 60) * lateMinutes),
    undertime: Math.round((rate / 60) * undertimeMinutes),
    absences: Math.round(rate * 8 * absentDays),
    lwop: lwopDeduction(basic, lwopDays), // derived from lwopDays
    otherDeductions: 0,
    // Drivers
    overtimeHours,
    nightDiffHours,
    lwopDays,
  };
}

/** Build one payroll row from an employee, auto-computing all components. */
function rowFor(e: Employee, i: number): PayrollRow {
  const monthly = Math.round(e.salary / 12);
  // Prefer the employee's own classification; fall back to a stable seeded one.
  const employeeType = e.employmentType ?? TYPES[seeded(i + 1, TYPES.length)];
  return {
    id: `PR-${e.id}`,
    employeeId: e.id,
    name: e.name,
    position: e.role,
    department: e.department,
    employeeType,
    agency: e.agency ?? "",
    status: ROW_STATUS[seeded(i + 2, ROW_STATUS.length)],
    ...computeComponents(monthly, employeeType, e.department, i),
  };
}

/**
 * Per-employee overrides of hand-edited payroll components, keyed by employee
 * id. Saved from the Payroll Data Entry grid so the derived amounts they edited
 * carry through to the Payroll Report and pre-run review. Only the keys present
 * on each entry override the derived value; everything else stays computed.
 */
export type PayrollOverrides = Record<string, Partial<PayrollComponents>>;

/**
 * Derive a full payroll batch from the employee list (active + on-leave).
 *
 * When `lwopDaysByEmployee` is supplied (from a biometric attendance import),
 * an employee's LWOP days come from the punch data rather than the seeded
 * stand-in, and the LWOP deduction is recomputed from that count. Employees
 * absent from the map keep their existing seeded value.
 *
 * When `overrides` is supplied (hand-edited amounts saved from Data Entry), the
 * edited components replace the derived ones and the row's derived fields are
 * re-run so gross/deductions/net stay consistent. Overrides win over the LWOP
 * import for any key they set.
 */
export function buildPayrollRows(
  employees: Employee[],
  lwopDaysByEmployee: Record<string, number> = {},
  overrides: PayrollOverrides = {},
): PayrollRow[] {
  return employees
    .filter((e) => e.status !== "inactive")
    .map((e, i) => {
      const row = rowFor(e, i);
      const imported = lwopDaysByEmployee[e.id];
      // recalcDerived refreshes `lwop` (daily rate × days) from the new count.
      const withLwop =
        imported === undefined ? row : recalcDerived({ ...row, lwopDays: imported });
      const edited = overrides[e.id];
      if (!edited) return withLwop;
      // Overlay the saved edits, then re-derive so overtime/nightDiff/lwop/
      // govDeductions reflect any edited driver or basic salary.
      return recalcDerived({ ...withLwop, ...edited });
    });
}

/**
 * Re-run automation on an existing row, refreshing every computed component
 * from its current basic salary, type and department while preserving identity
 * and status. Used by the "Auto-fill" action.
 */
export function autoFillRow(row: PayrollRow, i: number): PayrollRow {
  return {
    ...row,
    ...computeComponents(row.basic, row.employeeType, row.department, i),
  };
}
