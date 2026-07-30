/**
 * Payroll data-entry domain model. Rows are derived deterministically from the
 * HR employee records so the grid is stable across refreshes (no persistence,
 * matching the rest of the app). All money is monthly, in whole PHP.
 *
 * This module is the single source of truth for every payroll figure. The
 * data-entry grid, the pre-run review, the Payroll Register, the Payslip and
 * the NET 15/30 reports all read from here, so a peso shown on one screen is
 * the same peso on every other. Register-only column detail (COLA, rice
 * subsidy, the individual loan lines, HMO…) is derived here too — see
 * `ancillaryLines` — and carved back out by the report builders rather than
 * invented a second time.
 */
import type { Employee, EmployeeType } from "@/store/types";
import { findMatchingRate, type ContributionRate } from "@/lib/contributions";

export type { EmployeeType };

export type PayrollRowStatus = "pending" | "in-review" | "ready" | "approved";

/** Every editable numeric field on a payroll row. */
export interface PayrollComponents {
  // Earnings
  basic: number;
  allowances: number; // transport + COLA + rice subsidy
  overtime: number; // derived: hourly rate × 125% × overtimeHours
  nightDiff: number; // derived: hourly rate × 10% × nightDiffHours
  holidayPay: number;
  adjustments: number; // includes any acting allowance
  bonuses: number;
  commissions: number;
  otherEarnings: number;
  // Deductions
  govDeductions: number; // derived: statutory contributions + tax from basic
  loans: number; // SSS + HDMF + PECEWA + coop loans + Pag-IBIG additional
  cashAdvance: number;
  late: number;
  undertime: number;
  absences: number;
  lwop: number; // derived: daily rate × lwopDays
  otherDeductions: number; // HMO + Ded A + electric bill + membership insurance
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

/**
 * Deterministic pseudo-random from a 32-bit seed. `Math.imul` keeps the
 * multiply exact in 32 bits — a plain `*` overflows 2^53 for large seeds and
 * starts returning biased (and on some inputs constant) values.
 */
export function seeded(i: number, mod: number): number {
  return (Math.imul(i >>> 0, 2654435761) >>> 0) % mod;
}

/**
 * Stable 32-bit seed for one employee, derived from their id (FNV-1a).
 *
 * Every synthesised figure keys off this rather than the employee's position in
 * a list. Array position is not stable: filtering by pay class, agency or
 * status reorders the list, and deactivating one employee shifts everyone after
 * them — which previously changed unrelated employees' overtime, absences and
 * loan amounts whenever a filter was touched.
 */
export function employeeSeed(employeeId: string): number {
  let h = 2166136261;
  for (let i = 0; i < employeeId.length; i++) {
    h = (h ^ employeeId.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const ROW_STATUS: PayrollRowStatus[] = ["pending", "in-review", "ready", "approved", "pending"];
const TYPES: EmployeeType[] = ["Regular", "Regular", "Regular", "Probationary", "Contractual", "Part-time"];

// ---- Automation constants (Philippine payroll rules) --------------------

/** Standard paid hours per month: 22 working days × 8 hours. */
const HOURS_PER_MONTH = 176;

/** Monthly de-minimis transport allowance by employment type (PHP). */
const TRANSPORT_ALLOWANCE_BY_TYPE: Record<EmployeeType, number> = {
  Regular: 2000,
  Probationary: 1500,
  Contractual: 1000,
  "Part-time": 500,
};

/** Monthly HMO premium (employee share) by employment type, in whole PHP. */
const HMO_BY_TYPE: Record<EmployeeType, number> = {
  Regular: 350,
  Probationary: 250,
  Contractual: 0,
  "Part-time": 0,
};

/** Fixed monthly cost-of-living allowance, paid to everyone. */
export const COLA_MONTHLY = 1500;
/** Statutory rice subsidy, paid to everyone. */
export const RICE_SUBSIDY_MONTHLY = 2000;
/** Fixed monthly membership insurance premium. */
export const MEMBERSHIP_INSURANCE_MONTHLY = 100;

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

// ---- Register-only line detail -------------------------------------------

/**
 * The itemised lines the Payroll Register shows but the data-entry grid rolls
 * up. Each one is a *component of* a grid field, never an addition to it:
 *
 *  - `allowances`      = transport + COLA + rice subsidy
 *  - `adjustments`     ⊇ acting allowance
 *  - `loans`           = SSS + HDMF + PECEWA + coop + Pag-IBIG additional
 *  - `otherDeductions` = HMO + Ded A + electric bill + membership insurance
 *
 * Keeping the split here (rather than re-deriving it in the report builder) is
 * what makes the register reconcile with the grid to the peso.
 */
export interface AncillaryLines {
  cola: number;
  riceSubsidy: number;
  transportAllowance: number;
  actingAllowance: number;
  sssLoan: number;
  hdmfLoan: number;
  pecewaLoan: number;
  coopLoan: number;
  pagibigAd: number;
  hmo: number;
  dedA: number;
  electricBill: number;
  memIns: number;
}

/** Derive the itemised register lines for one employee (stable per employee). */
export function ancillaryLines(
  employeeId: string,
  employeeType: EmployeeType,
  basic: number,
): AncillaryLines {
  const seed = employeeSeed(employeeId);
  const s = (n: number, mod: number) => seeded(seed + n, mod);
  return {
    cola: COLA_MONTHLY,
    riceSubsidy: RICE_SUBSIDY_MONTHLY,
    transportAllowance: TRANSPORT_ALLOWANCE_BY_TYPE[employeeType],
    actingAllowance: s(51, 8) === 0 ? Math.round(basic * 0.05) : 0,
    sssLoan: s(21, 8) === 0 ? 850 : 0,
    hdmfLoan: s(22, 10) === 0 ? 600 : 0,
    pecewaLoan: s(52, 9) === 0 ? 500 : 0,
    coopLoan: s(23, 6) === 0 ? 1200 : 0,
    pagibigAd: s(53, 7) === 0 ? 300 : 0,
    hmo: HMO_BY_TYPE[employeeType],
    dedA: s(54, 10) === 0 ? 250 : 0,
    electricBill: s(55, 6) === 0 ? 450 : 0,
    memIns: MEMBERSHIP_INSURANCE_MONTHLY,
  };
}

/** The ancillary lines for an already-built row. */
export function ancillaryFor(row: PayrollRow): AncillaryLines {
  return ancillaryLines(row.employeeId, row.employeeType, row.basic);
}

export const totalAllowances = (a: AncillaryLines) =>
  a.transportAllowance + a.cola + a.riceSubsidy;

export const totalLoans = (a: AncillaryLines) =>
  a.sssLoan + a.hdmfLoan + a.pecewaLoan + a.coopLoan + a.pagibigAd;

export const totalOtherDeductions = (a: AncillaryLines) =>
  a.hmo + a.dedA + a.electricBill + a.memIns;

/**
 * Split a (possibly hand-edited) roll-up back across its known component lines.
 *
 * When the roll-up still covers the derived parts, each part keeps its exact
 * value and the surplus is returned as `remainder` (an amount the user added on
 * top). When the roll-up was edited *below* the derived total the parts are
 * scaled down proportionally, with the largest part absorbing the rounding
 * drift. Either way `sum(parts) + remainder === total`, so the register always
 * reconciles with the grid.
 */
export function carve(total: number, parts: number[]): { parts: number[]; remainder: number } {
  const known = parts.reduce((sum, p) => sum + p, 0);
  if (total >= known) return { parts: [...parts], remainder: total - known };
  if (known <= 0) return { parts: parts.map(() => 0), remainder: Math.max(0, total) };

  const scaled = parts.map((p) => Math.round((p / known) * total));
  // Push the rounding drift onto the largest line so the parts sum exactly.
  const drift = total - scaled.reduce((sum, p) => sum + p, 0);
  if (drift !== 0) {
    let big = 0;
    for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[big]) big = i;
    scaled[big] += drift;
  }
  return { parts: scaled, remainder: 0 };
}

/** Statutory contributions (employee share) plus withholding tax, itemised. */
export interface StatutoryBreakdown {
  sss: number;
  philHealth: number;
  pagIbig: number;
  tax: number;
}

/**
 * The contribution rate table configured under Contributions, used to derive
 * statutory deductions. Payroll is computed in pure functions that are called
 * from many places (grid, register, payslip, NET 15/30), so rather than thread
 * the table through every signature we set it once from the store and read it
 * here. Empty until the store loads, in which case the built-in statutory
 * formulas are used as a fallback — see `statutoryBreakdown`.
 */
let activeRates: ContributionRate[] = [];

/**
 * Point the payroll engine at the configured contribution rates. Called by the
 * store whenever the rate table changes, so an edit under Contributions flows
 * straight through to the data-entry grid and every payroll report.
 */
export function setContributionRates(rates: ContributionRate[]): void {
  activeRates = rates;
}

/** The rate table currently driving payroll deductions. */
export function getContributionRates(): ContributionRate[] {
  return activeRates;
}

/**
 * The employee share for one contribution type at `basic`, taken from the
 * configured rate table. Returns null when no active bracket covers the salary
 * (or the table is empty), letting the caller fall back to the built-in formula.
 */
function configuredEmployeeShare(
  type: "SSS" | "PhilHealth" | "Pag-IBIG" | "Tax",
  basic: number,
): number | null {
  const rate = findMatchingRate(activeRates, type, basic);
  return rate ? rate.employeeShare : null;
}

/**
 * SSS Monthly Salary Credit: the compensation bracketed to the nearest ₱500
 * band, floored at ₱5,000 and capped at ₱35,000. Mirrors the published bands
 * (see `sss-rates-2026.csv`) so the fallback lands on the same MSC the loaded
 * rate table would.
 */
export function sssMonthlySalaryCredit(basic: number): number {
  const band = Math.round(basic / 500) * 500;
  return Math.min(Math.max(band, 5000), 35000);
}

/**
 * Itemised statutory deductions (employee share) — SSS, PhilHealth and
 * Pag-IBIG — plus withholding tax.
 *
 * Each line is taken from the matching bracket in the Contributions rate table
 * so what finance configures there is what payroll actually deducts. A type
 * with no active bracket covering this salary falls back to the built-in
 * statutory formula, so payroll still computes on a partially-configured (or
 * empty) table instead of silently deducting zero.
 *
 * Consumers that only need the combined figure use `statutoryDeductions`;
 * reports that itemise each line use this directly.
 */
export function statutoryBreakdown(basic: number): StatutoryBreakdown {
  // SSS employee share is 5% of the Monthly Salary Credit (2025 schedule;
  // 15% total, 10% employer / 5% employee) with the MSC capped at ₱35,000.
  const sss = configuredEmployeeShare("SSS", basic) ?? sssMonthlySalaryCredit(basic) * 0.05;
  // PhilHealth: 5% premium split evenly, so 2.5% employee share, on
  // compensation floored at ₱10,000 and ceilinged at ₱100,000.
  const philHealth =
    configuredEmployeeShare("PhilHealth", basic) ??
    Math.min(Math.max(basic, 10000), 100000) * 0.025;
  // Pag-IBIG: 2% employee share on compensation capped at ₱10,000 → ₱200 max.
  const pagIbig = configuredEmployeeShare("Pag-IBIG", basic) ?? Math.min(basic * 0.02, 200);

  // Tax is computed on pay net of the three contributions, so it must be
  // derived after them. A configured Tax bracket overrides the TRAIN-law table.
  const taxable = basic - (sss + philHealth + pagIbig);
  const tax = configuredEmployeeShare("Tax", basic) ?? withholdingTax(taxable);

  return {
    sss: Math.round(sss),
    philHealth: Math.round(philHealth),
    pagIbig: Math.round(pagIbig),
    tax: Math.round(tax),
  };
}

/** Combined statutory deductions, rolled into the government-deductions field. */
function statutoryDeductions(basic: number): number {
  const b = statutoryBreakdown(basic);
  return b.sss + b.philHealth + b.pagIbig + b.tax;
}

/**
 * Progressive monthly withholding tax — BIR TRAIN-law table effective 2023
 * onwards (RR 8-2018, second tranche). Negative taxable pay yields zero.
 */
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
 * absences) is derived from per-employee hour counts standing in for
 * timekeeping data; statutory deductions come from the salary. Every value
 * remains editable in the grid afterward.
 *
 * Derivations are seeded from the employee id, so a figure only ever changes
 * when that employee's own data changes — never because the roster or a filter
 * reordered the list.
 */
export function computeComponents(
  employeeId: string,
  basic: number,
  employeeType: EmployeeType,
  department: string,
): PayrollComponents {
  const seed = employeeSeed(employeeId);
  const s = (n: number, mod: number) => seeded(seed + n, mod);
  const rate = hourlyRate(basic);
  const a = ancillaryLines(employeeId, employeeType, basic);

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
    allowances: totalAllowances(a), // transport + COLA + rice subsidy
    overtime: overtimePay(basic, overtimeHours), // derived from overtimeHours
    nightDiff: nightDiffPay(basic, nightDiffHours), // derived from nightDiffHours
    holidayPay: s(6, 4) === 0 ? Math.round(rate * 8) : 0, // occasional holiday
    adjustments: a.actingAllowance,
    bonuses: s(8, 6) === 0 ? Math.round(basic * 0.1) : 0, // periodic incentive
    commissions: department === "Sales" ? s(9, 20) * 80 : 0,
    otherEarnings: 0,
    // Deductions — computed from salary + timekeeping
    govDeductions: statutoryDeductions(basic), // derived from basic
    loans: totalLoans(a), // SSS/HDMF/PECEWA/coop loans + Pag-IBIG additional
    cashAdvance: s(12, 4) === 0 ? 2000 : 0,
    late: Math.round((rate / 60) * lateMinutes),
    undertime: Math.round((rate / 60) * undertimeMinutes),
    absences: Math.round(rate * 8 * absentDays),
    lwop: lwopDeduction(basic, lwopDays), // derived from lwopDays
    otherDeductions: totalOtherDeductions(a), // HMO + Ded A + electric + mem ins
    // Drivers
    overtimeHours,
    nightDiffHours,
    lwopDays,
  };
}

/** Build one payroll row from an employee, auto-computing all components. */
function rowFor(e: Employee): PayrollRow {
  const monthly = Math.round(e.salary / 12);
  // Prefer the employee's own classification; fall back to a stable seeded one.
  const employeeType = e.employmentType ?? TYPES[seeded(employeeSeed(e.id) + 1, TYPES.length)];
  return {
    id: `PR-${e.id}`,
    employeeId: e.id,
    name: e.name,
    position: e.role,
    department: e.department,
    employeeType,
    agency: e.agency ?? "",
    status: ROW_STATUS[seeded(employeeSeed(e.id) + 2, ROW_STATUS.length)],
    ...computeComponents(e.id, monthly, employeeType, e.department),
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
    .map((e) => {
      const row = rowFor(e);
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
export function autoFillRow(row: PayrollRow): PayrollRow {
  return {
    ...row,
    ...computeComponents(row.employeeId, row.basic, row.employeeType, row.department),
  };
}

/** Batch roll-up for a set of rows — the figures a payroll run is booked at. */
export function payrollTotals(rows: PayrollComponents[]): {
  gross: number;
  deductions: number;
  net: number;
} {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + grossPay(r),
      deductions: acc.deductions + totalDeductions(r),
      net: acc.net + netPay(r),
    }),
    { gross: 0, deductions: 0, net: 0 },
  );
}
