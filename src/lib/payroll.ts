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
import {
  defaultEarningsMatrix,
  findMatchingRate,
  type ContributionRate,
  type ContributionType,
  type EarningCode,
  type EarningsMatrix,
} from "@/lib/contributions";
import {
  noDeductions,
  type EmployeeDeductions,
  type PayrollDeductionInputs,
} from "@/lib/payrollInputs";

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
  /**
   * Days of approved **unpaid** leave. Drives `lwop`.
   *
   * Unexcused absences and lateness are *not* counted here — they have their own
   * drivers below, each charging its own deduction line. See the note on
   * {@link TimekeepingInput} for why the three are kept apart.
   */
  lwopDays: number;
  /**
   * Whole days absent with no approved leave covering them. Drives `absences`.
   * This is the "absent and did not file leave" charge.
   */
  absentDays: number;
  /**
   * Working days lost to arriving after the shift start, as a fraction of a day
   * (0.0625 = half an hour late). Drives `late`. See lib/tardiness.ts.
   */
  tardyDays: number;
  /** Minutes of undertime (leaving early). Drives `undertime`. Hand-entered. */
  undertimeMinutes: number;
}

/**
 * One employee's timekeeping for the period, as resolved by the biometric
 * attendance import against their filed leave.
 *
 * WHY THE THREE DAY-COUNTS ARE SEPARATE: they are all unpaid, so a single total
 * would deduct the right amount — but the payslip could not say *why*. Splitting
 * them lets each charge land on the register line that already exists for it
 * (LWOP 401 / absences / late), and it removes a real double-deduction: the
 * engine previously charged a seeded `late` and `absences` on top of an imported
 * LWOP total that already included those same days.
 */
export interface TimekeepingInput {
  /** Whole days with no punch and no approved leave — unexcused absence. */
  absentDays: number;
  /** Whole days of approved but unpaid leave. */
  unpaidLeaveDays: number;
  /** Days lost to late arrivals, summed as fractions of a day. */
  tardyDays: number;
  /** Minutes of undertime. The device log has no early-out rule yet, so 0. */
  undertimeMinutes?: number;
}

/** Timekeeping per employee id, from the latest attendance import. */
export type TimekeepingByEmployee = Record<string, TimekeepingInput>;

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
 * the grid: overtime/nightDiff (from hours), govDeductions (from earnings), and
 * lwop/absences/late/undertime (from their day and minute counts). Editing the
 * driver recomputes them — see recalcDerived.
 */
export const DERIVED_KEYS: PayrollFieldKey[] = [
  "overtime",
  "nightDiff",
  "govDeductions",
  "lwop",
  "absences",
  "late",
  "undertime",
];

/** Timekeeping driver inputs the grid edits to auto-calc the derived amounts. */
export const DRIVER_FIELDS: { key: PayrollFieldKey; label: string; unit: string; drives: PayrollFieldKey }[] = [
  { key: "overtimeHours", label: "OT Hours", unit: "h", drives: "overtime" },
  { key: "nightDiffHours", label: "Night Diff Hours", unit: "h", drives: "nightDiff" },
  { key: "lwopDays", label: "LWOP Days", unit: "d", drives: "lwop" },
  { key: "absentDays", label: "Absent Days", unit: "d", drives: "absences" },
  { key: "tardyDays", label: "Tardy Days", unit: "d", drives: "late" },
  { key: "undertimeMinutes", label: "Undertime Mins", unit: "m", drives: "undertime" },
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
 * Absence deduction = daily rate × days absent without approved leave.
 *
 * Charged at the same daily rate as LWOP because it is the same lost day; it
 * sits on its own line so a payslip distinguishes "did not report and did not
 * file" from leave that was filed as unpaid.
 */
export const absenceDeduction = (basic: number, days: number) =>
  Math.round(dailyRateFromMonthly(basic) * days);

/**
 * Tardiness deduction = daily rate × the day-fractions lost to late arrivals.
 *
 * Pro-rata against the 8-hour day, so being 30 minutes late costs 30 minutes of
 * pay — see lib/tardiness.ts for the rule and why it isn't a flat penalty.
 */
export const lateDeduction = (basic: number, tardyDays: number) =>
  Math.round(dailyRateFromMonthly(basic) * tardyDays);

/** Undertime deduction = hourly rate × minutes ÷ 60 (whole PHP). */
export const undertimeDeduction = (basic: number, minutes: number) =>
  Math.round((hourlyRate(basic) / 60) * minutes);

/**
 * The identity fields needed to itemise a row's ancillary lines, and therefore
 * to build the per-contribution base. Every real payroll row carries them.
 */
export interface RowIdentity {
  employeeId: string;
  employeeType: EmployeeType;
}

/**
 * Recompute every derived amount (overtime, night diff, government deductions,
 * LWOP) from its driver on the row. Called after any edit so the grid's
 * auto-calculated fields — and therefore gross/deductions/net — stay in sync.
 *
 * Government deductions are re-derived from the row's *earnings*, not just its
 * basic pay: the Contribution Matrix decides which earning lines belong in each
 * contribution's base, so editing an allowance can legitimately move an
 * employee into a different SSS/PhilHealth/HDMF bracket.
 */
export function recalcDerived<T extends PayrollComponents & RowIdentity>(row: T): T {
  return {
    ...row,
    overtime: overtimePay(row.basic, row.overtimeHours),
    nightDiff: nightDiffPay(row.basic, row.nightDiffHours),
    govDeductions: statutoryDeductions(row.basic, earningAmountsFor(row)),
    // Each unpaid-time line is charged from its own count, so the three never
    // overlap: LWOP covers filed-but-unpaid leave, absences covers days missed
    // without filing, late covers the pro-rated tardiness.
    lwop: lwopDeduction(row.basic, row.lwopDays),
    absences: absenceDeduction(row.basic, row.absentDays),
    late: lateDeduction(row.basic, row.tardyDays),
    undertime: undertimeDeduction(row.basic, row.undertimeMinutes),
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
  /** Company/bank loans and the fixed 2- and 5-year plans — no register column
   *  of their own, so they surface on OTHER DEDN. Still fully deducted. */
  otherLoans: number;
  hmo: number;
  dedA: number;
  electricBill: number;
  memIns: number;
}

/**
 * Derive the itemised register lines for one employee.
 *
 * The loan and HMO lines come from `deductions` — the employee's real Loans-page
 * and tabbed-ledger records, resolved by lib/payrollInputs. An employee with no
 * loan records is deducted nothing on those lines; there is deliberately no
 * synthesised fallback, so what payroll takes is only ever what HR entered.
 *
 * The allowance lines remain policy-driven (COLA, rice and the per-type
 * transport allowance are the same for everyone in a class), and the acting
 * allowance stays seeded pending a real assignments ledger.
 */
export function ancillaryLines(
  employeeId: string,
  employeeType: EmployeeType,
  basic: number,
  deductions: EmployeeDeductions = noDeductions(),
): AncillaryLines {
  const seed = employeeSeed(employeeId);
  const s = (n: number, mod: number) => seeded(seed + n, mod);
  return {
    cola: COLA_MONTHLY,
    riceSubsidy: RICE_SUBSIDY_MONTHLY,
    transportAllowance: TRANSPORT_ALLOWANCE_BY_TYPE[employeeType],
    actingAllowance: s(51, 8) === 0 ? Math.round(basic * 0.05) : 0,
    sssLoan: deductions.sssLoan,
    hdmfLoan: deductions.hdmfLoan,
    pecewaLoan: deductions.pecewaLoan,
    coopLoan: deductions.coopLoan,
    pagibigAd: deductions.pagibigAd,
    otherLoans: deductions.otherLoans,
    // A ledger HMO line overrides the per-type default premium: an employee with
    // an actual policy on file is deducted that policy, not the class average.
    hmo: deductions.hmo || HMO_BY_TYPE[employeeType],
    dedA: deductions.dedA,
    electricBill: deductions.electricBill,
    memIns: MEMBERSHIP_INSURANCE_MONTHLY,
  };
}

/**
 * The loan/HMO ledger inputs currently in force, keyed by employee id. Set from
 * the store (like the contribution rates) so the many pure functions that
 * itemise a row — payslip, register, NET 15/30 — resolve the same deductions
 * without threading the ledgers through every signature.
 */
let activeDeductionInputs: PayrollDeductionInputs = {};

/** Point the payroll engine at the resolved per-employee loan/HMO deductions. */
export function setDeductionInputs(inputs: PayrollDeductionInputs): void {
  activeDeductionInputs = inputs;
}

/** The deduction inputs currently driving the loan and HMO lines. */
export function getDeductionInputs(): PayrollDeductionInputs {
  return activeDeductionInputs;
}

/** One employee's resolved deductions, or an all-zero set when they have none. */
export function deductionsFor(employeeId: string): EmployeeDeductions {
  return activeDeductionInputs[employeeId] ?? noDeductions();
}

/** The ancillary lines for an already-built row. */
export function ancillaryFor(row: PayrollRow): AncillaryLines {
  return ancillaryLines(row.employeeId, row.employeeType, row.basic, deductionsFor(row.employeeId));
}

export const totalAllowances = (a: AncillaryLines) =>
  a.transportAllowance + a.cola + a.riceSubsidy;

export const totalLoans = (a: AncillaryLines) =>
  a.sssLoan + a.hdmfLoan + a.pecewaLoan + a.coopLoan + a.pagibigAd + a.otherLoans;

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
  /**
   * The contributable base each line was actually computed against, after the
   * Contribution Matrix decided which earnings count. Surfaced so a payslip can
   * explain *why* a bracket was picked rather than just showing the peso.
   */
  base: Record<"SSS" | "PhilHealth" | "Pag-IBIG" | "Tax", number>;
  /**
   * Types with no active bracket covering their base, which therefore fell back
   * to the built-in statutory formula. Empty when the configured table covered
   * every line — which is what finance wants a payroll run to report.
   */
  unmatched: ContributionType[];
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
 * The Contribution Matrix currently in force: which earning lines are added to
 * basic pay to form each contribution's base. Defaults to the statutory
 * convention (see `defaultEarningsMatrix`) so payroll behaves sensibly before
 * the store has loaded, and is replaced by the configured matrix on load.
 */
let activeMatrix: EarningsMatrix = defaultEarningsMatrix();

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
 * Point the engine at the configured Contribution Matrix, so that toggling (say)
 * overtime into the SSS base under Contributions changes what payroll deducts.
 */
export function setEarningsMatrix(matrix: EarningsMatrix): void {
  activeMatrix = matrix;
}

/** The Contribution Matrix currently driving each contribution's base. */
export function getEarningsMatrix(): EarningsMatrix {
  return activeMatrix;
}

/**
 * Map a payroll row's earnings onto the {@link EarningCode}s the Contribution
 * Matrix is configured in terms of, so the matrix can select a base.
 *
 * `basic` is deliberately absent: basic pay is always in every contribution's
 * base (it is the compensation being contributed against, not an optional
 * add-on), so it is added unconditionally in {@link contributableBase} and is
 * not a matrix toggle. Codes the payroll row has no line for — 13th/14th month,
 * rest-day premiums — are omitted rather than zeroed, so adding them later is a
 * matter of extending this map.
 */
export function earningAmountsFor(
  row: PayrollComponents & RowIdentity,
): Partial<Record<EarningCode, number>> {
  const a = ancillaryLines(
    row.employeeId,
    row.employeeType,
    row.basic,
    deductionsFor(row.employeeId),
  );
  // Allowances and adjustments are roll-ups on the row; carve them back into
  // their component lines so the matrix can include them individually. Using
  // `carve` (not the raw ancillary figures) keeps a hand-edited roll-up honest.
  const allw = carve(row.allowances, [a.transportAllowance, a.cola, a.riceSubsidy]);
  const [transAllw, cola, rice] = allw.parts;
  const adj = carve(row.adjustments, [a.actingAllowance]);
  const [actingAllw] = adj.parts;

  return {
    cola,
    transAllw,
    rice,
    holidayPay: row.holidayPay,
    niteDiff: row.nightDiff,
    ot125: row.overtime,
    actingAllw,
    // Surplus from either carved roll-up is an amount the user added on top, so
    // it belongs with the other miscellaneous earnings.
    adjustment: adj.remainder,
    otherEarnings: row.otherEarnings + row.bonuses + row.commissions + allw.remainder,
  };
}

/**
 * The compensation one contribution is computed against: basic pay plus every
 * earning the Contribution Matrix includes in that type's base.
 *
 * Rounded to whole pesos because the bracket lookup is an inclusive range
 * comparison — a base of ₱19,999.6 must not fall through a band that ends at
 * ₱19,999.
 */
export function contributableBase(
  type: ContributionType,
  basic: number,
  earnings: Partial<Record<EarningCode, number>> = {},
): number {
  const included = activeMatrix[type] ?? [];
  let base = basic;
  for (const code of included) base += earnings[code] ?? 0;
  return Math.round(base);
}

/**
 * The employee share for one contribution type at `base`, taken from the
 * configured rate table. Returns null when no active bracket covers the base
 * (or the table is empty), letting the caller fall back to the built-in formula.
 */
function configuredEmployeeShare(
  type: "SSS" | "PhilHealth" | "Pag-IBIG" | "Tax",
  base: number,
): number | null {
  const rate = findMatchingRate(activeRates, type, base);
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
export function statutoryBreakdown(
  basic: number,
  earnings: Partial<Record<EarningCode, number>> = {},
): StatutoryBreakdown {
  const unmatched: ContributionType[] = [];
  // Each contribution is bracketed against its own base — the Contribution
  // Matrix may include overtime in one type's base and not another's.
  const base = {
    SSS: contributableBase("SSS", basic, earnings),
    PhilHealth: contributableBase("PhilHealth", basic, earnings),
    "Pag-IBIG": contributableBase("Pag-IBIG", basic, earnings),
    Tax: contributableBase("Tax", basic, earnings),
  } as const;

  /** Configured share for a type, recording a fallback when no bracket matches. */
  const share = (type: "SSS" | "PhilHealth" | "Pag-IBIG" | "Tax", fallback: number): number => {
    const configured = configuredEmployeeShare(type, base[type]);
    if (configured !== null) return configured;
    unmatched.push(type);
    return fallback;
  };

  // SSS employee share is 5% of the Monthly Salary Credit (2025 schedule;
  // 15% total, 10% employer / 5% employee) with the MSC capped at ₱35,000.
  const sss = share("SSS", sssMonthlySalaryCredit(base.SSS) * 0.05);
  // PhilHealth: 5% premium split evenly, so 2.5% employee share, on
  // compensation floored at ₱10,000 and ceilinged at ₱100,000.
  const philHealth = share(
    "PhilHealth",
    Math.min(Math.max(base.PhilHealth, 10000), 100000) * 0.025,
  );
  // Pag-IBIG: 2% employee share on compensation capped at ₱10,000 → ₱200 max.
  const pagIbig = share("Pag-IBIG", Math.min(base["Pag-IBIG"] * 0.02, 200));

  // Tax is computed on pay net of the three contributions, so it must be
  // derived after them. A configured Tax bracket overrides the TRAIN-law table.
  const taxable = base.Tax - (sss + philHealth + pagIbig);
  const tax = share("Tax", withholdingTax(taxable));

  return {
    sss: Math.round(sss),
    philHealth: Math.round(philHealth),
    pagIbig: Math.round(pagIbig),
    tax: Math.round(tax),
    base: { ...base },
    unmatched,
  };
}

/** Combined statutory deductions, rolled into the government-deductions field. */
function statutoryDeductions(
  basic: number,
  earnings: Partial<Record<EarningCode, number>> = {},
): number {
  const b = statutoryBreakdown(basic, earnings);
  return b.sss + b.philHealth + b.pagIbig + b.tax;
}

/** The itemised statutory lines for an already-built payroll row. */
export function statutoryFor(row: PayrollComponents & RowIdentity): StatutoryBreakdown {
  return statutoryBreakdown(row.basic, earningAmountsFor(row));
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
 * Auto-compute every payroll component for an employee.
 *
 * The sources, and what happens when one is missing:
 *
 *  - **Fixed pay** (basic, allowances) — HR record + employment type.
 *  - **Loans, cash advance, HMO, electric bill** — the employee's actual Loans
 *    and per-employee ledger records, resolved by lib/payrollInputs. No records
 *    means **no deduction**; nothing is synthesised.
 *  - **Unpaid time** (LWOP, absences, late) — the `timekeeping` resolved by the
 *    biometric attendance import against filed leave. No import means the
 *    employee is treated as having worked the full period, which is the only
 *    safe default: inventing absences would dock real pay.
 *  - **Statutory contributions and tax** — the Contributions rate table,
 *    bracketed on the base the Contribution Matrix defines.
 *
 * Overtime and night-differential hours remain seeded stand-ins: the device log
 * records punches, not approved overtime, so there is no real source for them
 * yet. They are earnings, so a stand-in cannot under-pay anyone. Every value
 * remains editable in the grid afterward.
 */
export function computeComponents(
  employeeId: string,
  basic: number,
  employeeType: EmployeeType,
  department: string,
  deductions: EmployeeDeductions = noDeductions(),
  timekeeping?: TimekeepingInput,
): PayrollComponents {
  const seed = employeeSeed(employeeId);
  const s = (n: number, mod: number) => seeded(seed + n, mod);
  const rate = hourlyRate(basic);
  const a = ancillaryLines(employeeId, employeeType, basic, deductions);

  // Overtime/night-diff: seeded stand-ins (earnings, so never under-pay).
  const overtimeHours = s(4, 12); // hours of overtime logged this period
  const nightDiffHours = s(5, 10);

  // Unpaid-time drivers come from the attendance import. Absent it, every count
  // is zero — an employee with no timekeeping data is not docked.
  const lwopDays = timekeeping?.unpaidLeaveDays ?? 0;
  const absentDays = timekeeping?.absentDays ?? 0;
  const tardyDays = timekeeping?.tardyDays ?? 0;
  const undertimeMinutes = timekeeping?.undertimeMinutes ?? 0;

  // Earnings first: government deductions are bracketed against a base built
  // from them (per the Contribution Matrix), so they must exist before the
  // statutory lines can be derived.
  const earnings = {
    basic,
    allowances: totalAllowances(a), // transport + COLA + rice subsidy
    overtime: overtimePay(basic, overtimeHours), // derived from overtimeHours
    nightDiff: nightDiffPay(basic, nightDiffHours), // derived from nightDiffHours
    holidayPay: s(6, 4) === 0 ? Math.round(rate * 8) : 0, // occasional holiday
    adjustments: a.actingAllowance,
    bonuses: s(8, 6) === 0 ? Math.round(basic * 0.1) : 0, // periodic incentive
    commissions: department === "Sales" ? s(9, 20) * 80 : 0,
    otherEarnings: 0,
  };

  const deductionAmounts = {
    loans: totalLoans(a), // SSS/HDMF/PECEWA/coop/other loans + Pag-IBIG additional
    cashAdvance: deductions.cashAdvance,
    // Each unpaid-time charge is derived from its own count, so a day is never
    // deducted twice across the LWOP, absence and late lines.
    late: lateDeduction(basic, tardyDays),
    undertime: undertimeDeduction(basic, undertimeMinutes),
    absences: absenceDeduction(basic, absentDays),
    lwop: lwopDeduction(basic, lwopDays),
    otherDeductions: totalOtherDeductions(a), // HMO + Ded A + electric + mem ins
  };

  const drivers = {
    overtimeHours,
    nightDiffHours,
    lwopDays,
    absentDays,
    tardyDays,
    undertimeMinutes,
  };

  return {
    ...earnings,
    ...deductionAmounts,
    ...drivers,
    // Derived from the contributable base per the configured rate table.
    govDeductions: statutoryDeductions(
      basic,
      earningAmountsFor({
        ...earnings,
        ...deductionAmounts,
        ...drivers,
        govDeductions: 0,
        employeeId,
        employeeType,
      }),
    ),
  };
}

/** Build one payroll row from an employee, auto-computing all components. */
function rowFor(e: Employee, timekeeping?: TimekeepingInput): PayrollRow {
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
    ...computeComponents(
      e.id,
      monthly,
      employeeType,
      e.department,
      deductionsFor(e.id),
      timekeeping,
    ),
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
 * `timekeepingByEmployee` carries the biometric import's verdict for each
 * employee — unpaid-leave days, unexcused absent days and pro-rated tardiness —
 * which drive the LWOP, absence and late deductions respectively. Employees
 * absent from the map have no timekeeping data and are charged nothing for
 * unpaid time; approved **paid** leave never appears here at all, which is what
 * stops filed leave from docking pay.
 *
 * Loan, cash-advance and HMO deductions are not passed in: they come from the
 * ledgers set once via {@link setDeductionInputs}, the same way contribution
 * rates do.
 *
 * When `overrides` is supplied (hand-edited amounts saved from Data Entry), the
 * edited components replace the derived ones and the row's derived fields are
 * re-run so gross/deductions/net stay consistent. Overrides win over the
 * imported timekeeping for any key they set.
 */
export function buildPayrollRows(
  employees: Employee[],
  timekeepingByEmployee: TimekeepingByEmployee = {},
  overrides: PayrollOverrides = {},
): PayrollRow[] {
  return employees
    .filter((e) => e.status !== "inactive")
    .map((e) => {
      const row = rowFor(e, timekeepingByEmployee[e.id]);
      const edited = overrides[e.id];
      if (!edited) return row;
      // Overlay the saved edits, then re-derive so overtime/nightDiff/lwop/
      // absences/late/govDeductions reflect any edited driver or basic salary.
      return recalcDerived({ ...row, ...edited });
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
    // Re-reads the live loan ledgers, but keeps the row's current timekeeping
    // counts: auto-fill refreshes computed pay, it does not discard an imported
    // (or hand-corrected) absence and tardiness record.
    ...computeComponents(
      row.employeeId,
      row.basic,
      row.employeeType,
      row.department,
      deductionsFor(row.employeeId),
      {
        absentDays: row.absentDays,
        unpaidLeaveDays: row.lwopDays,
        tardyDays: row.tardyDays,
        undertimeMinutes: row.undertimeMinutes,
      },
    ),
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
