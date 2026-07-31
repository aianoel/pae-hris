/**
 * Payroll report builders. The flagship report is the Payroll Register — one
 * row per employee itemising every earning and statutory/loan deduction with
 * the exact column set the finance team expects. Records are flat and
 * ready for CSV export (downloadCsv) or the printable PDF view (printReport).
 *
 * Data is derived deterministically from the HR employee list (mirroring the
 * rest of the app — no persistence), so the register is stable across reloads.
 */
import type { Employee } from "@/store/types";
import {
  buildPayrollRows,
  statutoryFor,
  ancillaryFor,
  carve,
  hourlyRate,
  seeded,
  employeeSeed,
  WORKING_DAYS_PER_YEAR,
  dailyRateFromMonthly,
  type PayrollRow,
  type PayrollOverrides,
  type TimekeepingByEmployee,
} from "@/lib/payroll";

export { WORKING_DAYS_PER_YEAR, dailyRateFromMonthly };

/**
 * Leave-without-pay deduction = Daily Rate × LWOP Days, where
 * Daily Rate = (Monthly Rate × 12) / 261. Rounded to 2 decimals.
 */
export function lwopDeduction(monthlyRate: number, lwopDays: number): number {
  return Math.round(dailyRateFromMonthly(monthlyRate) * lwopDays * 100) / 100;
}

/** Agency filter sentinels shared by the payroll data-entry and report screens. */
export const ALL_AGENCIES = "All Agencies";
export const DIRECT_HIRE = "Direct hire";

/**
 * Agency dropdown options for a report filter bar: the two sentinels followed
 * by every agency assigned to an employee (sorted, de-duplicated).
 */
export function agencyFilterOptions(employees: Employee[]): string[] {
  const names = new Set<string>();
  for (const e of employees) if (e.agency) names.add(e.agency);
  return [ALL_AGENCIES, DIRECT_HIRE, ...[...names].sort((a, b) => a.localeCompare(b))];
}

/**
 * Letterhead for a printed report, resolved from the agency filter selection.
 *
 * Only a specific agency brands a printout: the `ALL_AGENCIES` and
 * `DIRECT_HIRE` sentinels aren't agencies, so those printouts stay unbranded
 * rather than picking an arbitrary logo. A selected agency always brands the
 * report by name — the logo is added when one has been uploaded under
 * Settings → Agencies, and omitted otherwise.
 */
export function reportBrandFor(
  agency: string,
  agencies: { name: string; logo?: string }[],
): { name: string; logo?: string } | undefined {
  if (agency === ALL_AGENCIES || agency === DIRECT_HIRE) return undefined;
  const match = agencies.find((a) => a.name === agency);
  // An agency an employee is assigned to may not be formally registered; brand
  // by name anyway so the printout is still attributed.
  return { name: agency, logo: match?.logo };
}

/**
 * Letterhead inferred from the employees a report actually covers, for the tabs
 * that have no agency filter (Payslip, NET 15, NET 15/30).
 *
 * The rule is deliberately strict: brand the printout only when *every*
 * reported employee belongs to the same agency, since that is the only case
 * where a single logo speaks for the whole page. A report mixing agencies — or
 * one covering direct hires, who have no agency — stays unbranded rather than
 * stamping one agency's logo over another's figures.
 *
 * `employeeIds` are the ids on the report; agencies are read from the HR
 * records so this works for any row shape.
 */
export function autoReportBrand(
  employeeIds: string[],
  employees: Employee[],
  agencies: { name: string; logo?: string }[],
): { name: string; logo?: string } | undefined {
  if (!employeeIds.length) return undefined;
  const agencyById = new Map(employees.map((e) => [e.id, e.agency ?? ""]));

  let sole: string | undefined;
  for (const id of employeeIds) {
    const agency = agencyById.get(id) ?? "";
    if (!agency) return undefined; // a direct hire on the page — no single owner
    if (sole === undefined) sole = agency;
    else if (sole !== agency) return undefined; // mixed agencies — can't brand
  }

  return sole ? reportBrandFor(sole, agencies) : undefined;
}

/**
 * Keep only the payroll rows matching an agency selection. The `ALL_AGENCIES`
 * sentinel passes everyone through; `DIRECT_HIRE` keeps rows with no agency.
 */
export function filterRowsByAgency(rows: PayrollRow[], agency: string): PayrollRow[] {
  if (agency === ALL_AGENCIES) return rows;
  if (agency === DIRECT_HIRE) return rows.filter((r) => !r.agency);
  return rows.filter((r) => r.agency === agency);
}

/**
 * Drop rows belonging to an agency that has no payroll run for the period.
 *
 * This is what the combined `ALL_AGENCIES` view needs: reporting every employee
 * as soon as *any* agency is processed would show figures for staff who were
 * never actually run. A whole-company run (`agencyScope` null) covers everyone,
 * so in that case nothing is dropped.
 *
 * `periodRuns` must already be narrowed to the reported period.
 */
export function filterRowsByProcessedRuns(
  rows: PayrollRow[],
  periodRuns: ProcessedRun[],
): PayrollRow[] {
  // A whole-company run pays everyone — no need to look at individual scopes.
  if (periodRuns.some((r) => (r.agencyScope ?? null) === null)) return rows;
  const paidScopes = new Set(periodRuns.map((r) => r.agencyScope as string));
  return rows.filter((r) => paidScopes.has(r.agency ?? ""));
}

/** The payroll runs booked for a report's month/year. */
export function runsForPeriod<T extends ProcessedRun>(
  payrollRuns: T[],
  month: string,
  year: string,
): T[] {
  const period = periodForFilters(month, year);
  return payrollRuns.filter((r) => r.period === period);
}

/** Default pay class for an employee with none set (matches the UI convention). */
const DEFAULT_PAY_CLASS = "Tier 1";

/**
 * Sentinel that scopes a query to every pay class. Used by the pre-run review,
 * which must preview the whole batch a run will pay rather than a single class.
 */
export const ALL_PAY_CLASSES = "All Pay Classes";

/**
 * Keep only the employees registered in the selected pay class. An employee
 * with no pay class set is treated as the default ({@link DEFAULT_PAY_CLASS}),
 * mirroring how the employees table displays it. Returns an empty list when no
 * employee belongs to the class, so the register table shows no rows. The
 * {@link ALL_PAY_CLASSES} sentinel passes everyone through.
 */
export function filterByPayClass(employees: Employee[], payclass: string): Employee[] {
  if (payclass === ALL_PAY_CLASSES) return employees;
  return employees.filter((e) => (e.payClass ?? DEFAULT_PAY_CLASS) === payclass);
}

/**
 * Filters that scope a register query — the demo equivalent of the AJAX GET
 * ({ year, month, payclass, paytype }). Shared by all four register tabs.
 */
export interface ReportFilters {
  year: string;
  month: string; // 3-letter upper e.g. "JUL"
  payclass: string;
  paytype: string;
  /** Staffing-agency scope; "All Agencies" / "Direct hire" or a specific name. */
  agency: string;
}

/** 3-letter month codes (report filters) → full month name (payroll-run period). */
const MONTH_CODE_TO_NAME: Record<string, string> = {
  JAN: "January",
  FEB: "February",
  MAR: "March",
  APR: "April",
  MAY: "May",
  JUN: "June",
  JUL: "July",
  AUG: "August",
  SEP: "September",
  OCT: "October",
  NOV: "November",
  DEC: "December",
};

/**
 * The payroll-run period string ("July 2026") for a report's month/year filter,
 * where `month` is a 3-letter code ("JUL"). Falls back to the raw code if the
 * month isn't recognised.
 */
export function periodForFilters(month: string, year: string): string {
  return `${MONTH_CODE_TO_NAME[month] ?? month} ${year}`;
}

/** A payroll run as far as the "has this been processed?" checks are concerned. */
export interface ProcessedRun {
  period: string;
  /** null/undefined = whole company, "" = direct hires, else an agency name. */
  agencyScope?: string | null;
}

/**
 * Whether a run covers the given agency selection.
 *
 * A whole-company run (`agencyScope` null/undefined) pays everyone, so it
 * satisfies any agency. A scoped run only satisfies its own agency — this is
 * what stops processing one agency from unlocking the rest. The `ALL_AGENCIES`
 * view shows the combined figures, so any run at all is enough for it.
 */
export function runCoversAgency(run: ProcessedRun, agency: string): boolean {
  const scope = run.agencyScope ?? null;
  if (scope === null) return true; // whole-company run — covers everyone
  if (agency === ALL_AGENCIES) return true; // combined view — any run will do
  if (agency === DIRECT_HIRE) return scope === "";
  return scope === agency;
}

/**
 * Whether payroll has been processed for the given month/year — i.e. a payroll
 * run exists for the matching period. `month` is a 3-letter code ("JUL").
 *
 * Pass `agency` to ask the narrower question the report tabs actually need:
 * *has this agency been processed for this period?* Without it the check stays
 * period-wide (the shared header's behaviour).
 */
export function isPayrollProcessed(
  payrollRuns: ProcessedRun[],
  month: string,
  year: string,
  agency: string = ALL_AGENCIES,
): boolean {
  const period = periodForFilters(month, year);
  return payrollRuns.some((r) => r.period === period && runCoversAgency(r, agency));
}

/** Full month name → 3-letter code, the inverse of MONTH_CODE_TO_NAME. */
const MONTH_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(MONTH_CODE_TO_NAME).map(([code, name]) => [name, code]),
);

/**
 * Split a payroll-run period string ("July 2026") back into the report filters'
 * `{ month, year }` shape ("JUL" / "2026"). Returns null when the string isn't
 * a recognised "<Month> <Year>" pair.
 */
export function filtersForPeriod(period: string): { month: string; year: string } | null {
  const [name, year] = period.trim().split(/\s+/);
  const month = MONTH_NAME_TO_CODE[name];
  if (!month || !/^\d{4}$/.test(year ?? "")) return null;
  return { month, year };
}

/**
 * The most recent period that actually has a payroll run, as report filters.
 * Used to open the report on real data instead of a hardcoded month: runs are
 * sorted chronologically and the latest recognised one wins. Returns null when
 * no run has been processed yet, so callers can fall back to a default.
 */
export function latestProcessedPeriod(
  payrollRuns: { period: string }[],
): { month: string; year: string } | null {
  let best: { month: string; year: string; rank: number } | null = null;
  for (const run of payrollRuns) {
    const parsed = filtersForPeriod(run.period);
    if (!parsed) continue;
    // Rank as YYYYMM so the newest period sorts highest.
    const monthIndex = MONTHS_ORDER.indexOf(parsed.month);
    const rank = Number(parsed.year) * 100 + monthIndex;
    if (!best || rank > best.rank) best = { ...parsed, rank };
  }
  return best ? { month: best.month, year: best.year } : null;
}

/** Month codes in calendar order — used to rank periods chronologically. */
const MONTHS_ORDER = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** A column in one of the dept-grouped register tables. */
export interface RegisterField {
  /** Data key on a {@link DeptRegisterRow}. */
  key: RegisterNumericKey;
  /** Header label as it appears in the spec. */
  label: string;
  /** Earning-/deduction-code lookup shown as subtext above the label. */
  code?: string;
}

/**
 * Every numeric field carried on a dept-grouped register row — the union of
 * the earnings, deductions and payroll-register column sets. Each tab renders
 * a slice of these via its own {@link RegisterField} list.
 */
export const REGISTER_NUMERIC_KEYS = [
  // Earnings
  "basic_rate",
  "cola",
  "trans_allw",
  "rice_subsi",
  "holiday_pay",
  "nite_diff",
  "ot_pay",
  "acting_allw",
  "otheradd",
  // Roll-ups
  "gross_earnings",
  "total_dedn",
  "total_net",
  // Deductions
  "sss_cont",
  "sss_loan",
  "phic_cont",
  "hdmf_cont",
  "hdmf_loan",
  "pecewa_loan",
  "coop_loan",
  "pagibig_ad",
  "other_dedn",
  "hmo_dedn",
  "ded_a",
  "electric_bill",
  "mem_ins",
  "lwop",
  "base_tax",
] as const;

export type RegisterNumericKey = (typeof REGISTER_NUMERIC_KEYS)[number];

/** One register row per employee; grouped by dept for the register tables. */
export interface DeptRegisterRow extends Record<RegisterNumericKey, number> {
  dept_code: string;
  employee_id: string;
  employee_name: string;
}

// ---- Column sets per tab (labels + earning/deduction codes) --------------

/** Tab 1 — Payroll Register: roll-ups plus every deduction line, no codes. */
export const PAYROLL_REGISTER_FIELDS: RegisterField[] = [
  { key: "gross_earnings", label: "GROSS EARNINGS" },
  { key: "total_dedn", label: "TOTAL DEDN" },
  { key: "total_net", label: "TOTAL NET" },
  { key: "sss_cont", label: "SSS CONT" },
  { key: "sss_loan", label: "SSS LOAN" },
  { key: "phic_cont", label: "PHIC CONT" },
  { key: "hdmf_cont", label: "HDMF CONT" },
  { key: "hdmf_loan", label: "HDMF LOAN" },
  { key: "pecewa_loan", label: "PECEWA LOAN" },
  { key: "coop_loan", label: "COOP LOAN" },
  { key: "pagibig_ad", label: "PAGIBIG AD" },
  { key: "other_dedn", label: "OTHER DEDN" },
  { key: "hmo_dedn", label: "HMO DEDN" },
  { key: "ded_a", label: "DED A" },
  { key: "electric_bill", label: "ELECTRIC BILL" },
  { key: "mem_ins", label: "MEM INS" },
  { key: "lwop", label: "LWOP" },
  { key: "base_tax", label: "BASE TAX" },
];

/** Tab 2 — Earning Register: earning lines with earning-type codes. */
export const EARNING_REGISTER_FIELDS: RegisterField[] = [
  { key: "basic_rate", label: "BASIC RATE", code: "401" },
  { key: "cola", label: "COLA", code: "410" },
  { key: "trans_allw", label: "TRANS ALLW", code: "401" },
  { key: "rice_subsi", label: "RICE SUBSI", code: "410" },
  { key: "holiday_pay", label: "HOLIDAY PAY", code: "401" },
  { key: "nite_diff", label: "NITE DIFF", code: "401" },
  { key: "ot_pay", label: "OT PAY", code: "401" },
  { key: "acting_allw", label: "ACTING ALLW", code: "401" },
  { key: "otheradd", label: "OTHERADD", code: "401" },
];

/** Tab 3 — Deductions Register: deduction lines with deduction codes. */
export const DEDUCTION_REGISTER_FIELDS: RegisterField[] = [
  { key: "sss_cont", label: "SSS CONT", code: "256" },
  { key: "sss_loan", label: "SSS LOAN", code: "262" },
  { key: "phic_cont", label: "PHIC CONT", code: "257" },
  { key: "hdmf_cont", label: "HDMF CONT", code: "260/408/261" },
  { key: "hdmf_loan", label: "HDMF LOAN", code: "274" },
  { key: "pecewa_loan", label: "PECEWA LOAN", code: "264" },
  { key: "coop_loan", label: "COOP LOAN", code: "265" },
  { key: "pagibig_ad", label: "PAGIBIG AD", code: "261" },
  { key: "other_dedn", label: "OTHER DEDN" },
  { key: "hmo_dedn", label: "HMO DEDN", code: "405" },
  { key: "ded_a", label: "DED A", code: "178" },
  { key: "electric_bill", label: "ELECT BILL", code: "175" },
  { key: "mem_ins", label: "MEM INS" },
  { key: "lwop", label: "LWOP", code: "401" },
  { key: "base_tax", label: "BASE TAX", code: "245" },
];

/**
 * Build one per-employee register row, itemising every earning/deduction.
 *
 * The itemised lines are *carved out of* the payroll row's roll-ups rather than
 * synthesised again here. That is what makes the register agree with the
 * data-entry grid: GROSS EARNINGS equals the grid's gross and TOTAL DEDN equals
 * the grid's deductions, to the peso, including any hand-edited amount. A
 * roll-up edited above its derived parts surfaces the surplus on the OTHERADD /
 * OTHER DEDN line; edited below, the parts scale down proportionally.
 */
function deptRegisterRow(row: PayrollRow): DeptRegisterRow {
  // Statutory lines are bracketed against the row's contributable base (basic
  // plus whichever earnings the Contribution Matrix includes), not basic alone.
  const stat = statutoryFor(row);
  const a = ancillaryFor(row);

  // ---- Earnings — carve the lumped allowance into its itemised lines ----
  const basic_rate = row.basic;
  const allw = carve(row.allowances, [a.transportAllowance, a.cola, a.riceSubsidy]);
  const [trans_allw, cola, rice_subsi] = allw.parts;
  const holiday_pay = row.holidayPay;
  const nite_diff = row.nightDiff;
  const ot_pay = row.overtime;
  // The acting allowance is carried inside `adjustments`; anything on top of it
  // (plus bonuses/commissions/other) lands on OTHERADD.
  const adj = carve(row.adjustments, [a.actingAllowance]);
  const [acting_allw] = adj.parts;
  const otheradd =
    adj.remainder +
    allw.remainder +
    row.bonuses +
    row.commissions +
    row.otherEarnings;

  // Equals grossPay(row) by construction — every earning is accounted for once.
  const gross_earnings =
    basic_rate + cola + trans_allw + rice_subsi + holiday_pay + nite_diff + ot_pay + acting_allw + otheradd;

  // ---- Deductions ----
  // Statutory contributions come from `statutoryBreakdown`, which reads the
  // brackets configured under Contributions (SSS / PhilHealth / Pag-IBIG / Tax)
  // and falls back to the built-in formulas for any type with no active bracket.
  // They are carved out of govDeductions so an edited roll-up still reconciles.
  const gov = carve(row.govDeductions, [stat.sss, stat.philHealth, stat.pagIbig, stat.tax]);
  const [sss_cont, phic_cont, hdmf_cont, base_tax] = gov.parts;

  // Loan lines carved out of the row's `loans` roll-up. Company/bank loans and
  // the fixed 2-/5-year ledger plans have no column of their own, so they are
  // carved as an explicit part (landing on OTHER DEDN below) rather than left to
  // the remainder — that way an edited-down roll-up scales them proportionally
  // with the government loans instead of zeroing them first.
  const loan = carve(row.loans, [
    a.sssLoan,
    a.hdmfLoan,
    a.pecewaLoan,
    a.coopLoan,
    a.pagibigAd,
    a.otherLoans,
  ]);
  const [sss_loan, hdmf_loan, pecewa_loan, coop_loan, pagibig_ad, other_loans] = loan.parts;

  // Other-deduction lines carved out of the row's `otherDeductions` roll-up.
  const other = carve(row.otherDeductions, [a.hmo, a.dedA, a.electricBill, a.memIns]);
  const [hmo_dedn, ded_a, electric_bill, mem_ins] = other.parts;

  // LWOP is approved-but-unpaid leave. It is deliberately distinct from
  // `row.absences` (days missed without filing) and `row.late` (pro-rated
  // tardiness), which the attendance import counts separately and which land on
  // OTHER DEDN below — the same day is never charged on two lines.
  const lwop = row.lwop;

  // Everything not itemised above — cash advance, late, undertime, absences,
  // the loans with no column of their own — plus any surplus left over from the
  // carved roll-ups.
  const other_dedn =
    row.cashAdvance +
    row.late +
    row.undertime +
    row.absences +
    other_loans +
    gov.remainder +
    loan.remainder +
    other.remainder;

  // Total deductions sums every itemised line so the register reconciles; this
  // equals totalDeductions(row) by construction.
  const total_dedn =
    sss_cont +
    sss_loan +
    phic_cont +
    hdmf_cont +
    hdmf_loan +
    pecewa_loan +
    coop_loan +
    pagibig_ad +
    other_dedn +
    hmo_dedn +
    ded_a +
    electric_bill +
    mem_ins +
    lwop +
    base_tax;
  const total_net = gross_earnings - total_dedn;

  return {
    dept_code: row.department,
    employee_id: row.employeeId,
    employee_name: row.name,
    basic_rate,
    cola,
    trans_allw,
    rice_subsi,
    holiday_pay,
    nite_diff,
    ot_pay,
    acting_allw,
    otheradd,
    gross_earnings,
    total_dedn,
    total_net,
    sss_cont,
    sss_loan,
    phic_cont,
    hdmf_cont,
    hdmf_loan,
    pecewa_loan,
    coop_loan,
    pagibig_ad,
    other_dedn,
    hmo_dedn,
    ded_a,
    electric_bill,
    mem_ins,
    lwop,
    base_tax,
  };
}

/**
 * Fraction of the whole-month payroll paid in the selected period. Payroll is
 * computed for the full month, then split evenly: "1st half" and "2nd half"
 * each pay half (so the two halves sum back to the full month), while "Full
 * month" pays the entire amount. Any unrecognised value defaults to full.
 */
export function payTypeFactor(paytype: string): number {
  const p = paytype.trim().toLowerCase();
  if (p === "1st half" || p === "2nd half") return 0.5;
  return 1;
}

/**
 * Split a whole-month amount into its two semi-monthly cutoff halves — the
 * 1st half (days 1–15) and the 2nd half (16–end). The month is computed in
 * full, then paid evenly across the two cutoffs; the 2nd half absorbs any
 * rounding remainder so `first + second` always equals `whole` to the centavo.
 */
export function splitIntoHalves(whole: number): { first: number; second: number } {
  const first = Math.round((whole / 2) * 100) / 100;
  const second = Math.round((whole - first) * 100) / 100;
  return { first, second };
}

/**
 * Loan-deduction lines on the register. These follow the pay-class cutoff rule
 * (see `loanFactorForHalf`) instead of the even ½/½ split every other line uses.
 */
const LOAN_KEYS: RegisterNumericKey[] = [
  "sss_loan",
  "hdmf_loan",
  "pecewa_loan",
  "coop_loan",
  "pagibig_ad",
];

/** The earning lines summed into `gross_earnings` — used to re-reconcile a split row. */
const EARNING_KEYS: RegisterNumericKey[] = [
  "basic_rate",
  "cola",
  "trans_allw",
  "rice_subsi",
  "holiday_pay",
  "nite_diff",
  "ot_pay",
  "acting_allw",
  "otheradd",
];

/** The deduction lines summed into `total_dedn` — used to re-reconcile a split row. */
const DEDN_KEYS: RegisterNumericKey[] = [
  "sss_cont",
  "sss_loan",
  "phic_cont",
  "hdmf_cont",
  "hdmf_loan",
  "pecewa_loan",
  "coop_loan",
  "pagibig_ad",
  "other_dedn",
  "hmo_dedn",
  "ded_a",
  "electric_bill",
  "mem_ins",
  "lwop",
  "base_tax",
];

/**
 * Fraction of a whole-month LOAN amount collected in the given cutoff half,
 * keyed on the employee's pay class:
 *
 *  - **Confidentials** — the full loan is taken once, in the **1st half**
 *    (a one-time deduction); the 2nd half collects nothing.
 *  - **Rank And File** (and every other class) — the loan is **split evenly**
 *    across both halves.
 *
 * `paytype` is "1st half" / "2nd half" / "Full month" (case-insensitive).
 */
export function loanFactorForHalf(paytype: string, payClass: string): number {
  const p = paytype.trim().toLowerCase();
  if (p !== "1st half" && p !== "2nd half") return 1; // full month
  if (payClass === "Confidentials") return p === "1st half" ? 1 : 0;
  return 0.5;
}

/**
 * Scale a register row for the selected cutoff. Ordinary lines split evenly by
 * `factor` (½ for either half, 1 for full month); loan lines instead follow the
 * pay-class rule via `loanFactorForHalf`. The deduction roll-up and net are then
 * recomputed from the scaled lines so the row still reconciles.
 */
function scaleRegisterRow(
  row: DeptRegisterRow,
  factor: number,
  paytype: string,
  payClass: string,
): DeptRegisterRow {
  const loanFactor = loanFactorForHalf(paytype, payClass);
  // Nothing to do when both the ordinary split and the loan split are identity.
  if (factor === 1 && loanFactor === 1) return row;

  // The 2nd half takes the remainder of every ½ split, so first + second always
  // adds back to the whole month. Rounding each half independently would leak a
  // peso per line per employee — visible as NET 15 + NET 30 ≠ TOTAL NET.
  const isSecond = paytype.trim().toLowerCase() === "2nd half";
  const half = (whole: number) => {
    const first = Math.round(whole / 2);
    return isSecond ? whole - first : first;
  };
  const split = (whole: number, f: number) =>
    f === 1 ? whole : f === 0 ? 0 : f === 0.5 ? half(whole) : Math.round(whole * f);

  const scaled = { ...row };
  const loanSet = new Set<RegisterNumericKey>(LOAN_KEYS);
  for (const key of REGISTER_NUMERIC_KEYS) {
    if (key === "gross_earnings" || key === "total_dedn" || key === "total_net") continue;
    scaled[key] = split(row[key], loanSet.has(key) ? loanFactor : factor);
  }

  // Re-reconcile the roll-ups from the scaled component lines so the row still
  // balances: gross is the sum of the scaled earning lines (not the whole-month
  // gross re-scaled, which can disagree by a peso), and net follows from it.
  scaled.gross_earnings = EARNING_KEYS.reduce((sum, k) => sum + scaled[k], 0);
  scaled.total_dedn = DEDN_KEYS.reduce((sum, k) => sum + scaled[k], 0);
  scaled.total_net = scaled.gross_earnings - scaled.total_dedn;
  return scaled;
}

/**
 * Build the per-employee register for the given filters.
 *
 * Figures come from the payroll engine, keyed on each employee's own record —
 * the same numbers the data-entry grid shows. The Year/Month filters scope
 * *which* period is reported, not what the amounts are, so re-querying the same
 * period always returns the same money. The Paytype filter splits the
 * whole-month amounts: 1st/2nd half each pay ½.
 *
 * `timekeepingByEmployee` (from a biometric attendance import) flows through to
 * the LWOP, absence and late lines, so imported unpaid time is deducted on the
 * register exactly as it is on the grid.
 */
export function deptRegister(
  employees: Employee[],
  filters: ReportFilters,
  overrides: PayrollOverrides = {},
  timekeepingByEmployee: TimekeepingByEmployee = {},
  /**
   * The period's payroll runs. When given, employees whose agency has no run
   * are excluded, so the combined "All Agencies" view only reports staff that
   * payroll actually processed. Omit to report every employee (legacy callers).
   */
  periodRuns?: ProcessedRun[],
): DeptRegisterRow[] {
  const factor = payTypeFactor(filters.paytype);
  const inClass = filterByPayClass(employees, filters.payclass);
  let rows = filterRowsByAgency(
    buildPayrollRows(inClass, timekeepingByEmployee, overrides),
    filters.agency,
  );
  if (periodRuns) rows = filterRowsByProcessedRuns(rows, periodRuns);
  // Loan lines follow the pay-class cutoff rule (Confidentials = 1st-half only,
  // Rank And File = split evenly); other lines keep the even ½/½ split.
  return rows.map((row) =>
    scaleRegisterRow(deptRegisterRow(row), factor, filters.paytype, filters.payclass),
  );
}

/** Aggregate register rows by DEPT CODE — the grouped register view. */
export function registerByDept(rows: DeptRegisterRow[]): DeptRegisterRow[] {
  const groups = new Map<string, DeptRegisterRow>();
  for (const r of rows) {
    const g = groups.get(r.dept_code);
    if (g) {
      for (const key of REGISTER_NUMERIC_KEYS) g[key] += r[key];
    } else {
      groups.set(r.dept_code, { ...r, employee_id: "", employee_name: "" });
    }
  }
  // Round accumulated floats back to 2 decimals.
  return Array.from(groups.values())
    .map((g) => {
      for (const key of REGISTER_NUMERIC_KEYS) g[key] = Math.round(g[key] * 100) / 100;
      return g;
    })
    .sort((a, b) => a.dept_code.localeCompare(b.dept_code));
}

/** Column-wise totals across register rows — the "Total Result" footer. */
export function registerTotals(rows: DeptRegisterRow[]): Record<RegisterNumericKey, number> {
  const totals = {} as Record<RegisterNumericKey, number>;
  for (const key of REGISTER_NUMERIC_KEYS) {
    const sum = rows.reduce((acc, r) => acc + r[key], 0);
    totals[key] = Math.round(sum * 100) / 100;
  }
  return totals;
}

/** Round to 2 decimals — money is only ever displayed to the centavo. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payroll-register deduction line items — every column that sums into TOTAL
 * DEDN. GROSS EARNINGS and the two derived roll-ups are excluded.
 */
export const PAYROLL_DEDUCTION_KEYS: RegisterNumericKey[] = [
  "sss_cont",
  "sss_loan",
  "phic_cont",
  "hdmf_cont",
  "hdmf_loan",
  "pecewa_loan",
  "coop_loan",
  "pagibig_ad",
  "other_dedn",
  "hmo_dedn",
  "ded_a",
  "electric_bill",
  "mem_ins",
  "lwop",
  "base_tax",
];

/**
 * Roll-up columns on the payroll register derived from the other lines, hence
 * never edited directly: TOTAL DEDN (sum of the deduction lines) and TOTAL NET
 * (GROSS EARNINGS − TOTAL DEDN).
 */
export const PAYROLL_COMPUTED_KEYS: RegisterNumericKey[] = ["total_dedn", "total_net"];

/**
 * Recompute TOTAL DEDN and TOTAL NET from a row's (possibly hand-edited) line
 * items, so the register stays internally consistent as values are edited.
 */
export function recomputePayrollTotals(
  row: DeptRegisterRow,
): Pick<DeptRegisterRow, "total_dedn" | "total_net"> {
  const total_dedn = PAYROLL_DEDUCTION_KEYS.reduce((sum, key) => sum + (row[key] || 0), 0);
  return { total_dedn: round2(total_dedn), total_net: round2(row.gross_earnings - total_dedn) };
}

// ---- Overtime Register ---------------------------------------------------

/** Filters that scope an overtime query (the demo equivalent of the AJAX GET). */
export interface OvertimeFilters {
  year: string;
  month: string; // 3-letter upper e.g. "JUL"
  payclass: string;
  paytype: string;
  /** Staffing-agency scope; "All Agencies" / "Direct hire" or a specific name. */
  agency: string;
}

/** Overtime premium bands, in display order, as percentage multipliers. */
export const OT_RATE_BANDS = [125, 130, 150, 160, 180, 210, 230, 260] as const;
export type OtRateBand = (typeof OT_RATE_BANDS)[number];

/** One overtime row per employee, keyed loosely to the suggested data model. */
export interface OvertimeRow {
  dept_code: string;
  employee_id: string;
  employee_name: string;
  ndot_8_hrs: number; // night-differential OT hours (8-hr basis)
  ndot_8_pay: number;
  ot_hrs: number; // total overtime hours
  bands: Record<OtRateBand, number>; // pay accrued in each premium band
}

/** Numeric overtime columns in display order (used for headers + totals). */
export const OVERTIME_NUMERIC_COLUMNS = [
  "ndot_8_hrs",
  "ndot_8_pay",
  "ot_hrs",
  ...OT_RATE_BANDS.map((b) => `rate_${b}` as const),
] as const;
export type OvertimeNumericColumn = (typeof OVERTIME_NUMERIC_COLUMNS)[number];

/** Flatten a row's band map into rate_125…rate_260 numeric fields. */
export function overtimeCell(row: OvertimeRow, col: OvertimeNumericColumn): number {
  if (col === "ndot_8_hrs") return row.ndot_8_hrs;
  if (col === "ndot_8_pay") return row.ndot_8_pay;
  if (col === "ot_hrs") return row.ot_hrs;
  const band = Number(col.replace("rate_", "")) as OtRateBand;
  return row.bands[band] ?? 0;
}

/**
 * Build the Overtime Register for the given filters.
 *
 * Hours come from each payroll row's own timekeeping drivers — the same
 * `overtimeHours` / `nightDiffHours` the data-entry grid edits — so the OT the
 * register reports is the OT payroll actually pays. Only the distribution
 * across the premium bands is synthesised, and it is seeded per employee so it
 * doesn't shift when a filter reorders the list. Employees with no overtime are
 * omitted.
 */
export function overtimeRegister(
  employees: Employee[],
  filters: OvertimeFilters,
  overrides: PayrollOverrides = {},
  /** Period's payroll runs — see {@link deptRegister}. */
  periodRuns?: ProcessedRun[],
): OvertimeRow[] {
  const inClass = filterByPayClass(employees, filters.payclass);
  const scoped = filterRowsByAgency(buildPayrollRows(inClass, {}, overrides), filters.agency);
  return (periodRuns ? filterRowsByProcessedRuns(scoped, periodRuns) : scoped)
    .map((row) => {
      const seed = employeeSeed(row.employeeId);
      const s = (n: number, mod: number) => seeded(seed + n, mod);
      const rate = hourlyRate(row.basic);

      // OT hours from the row's timekeeping driver, so an edit in Data Entry
      // (or an auto-fill) is reflected here rather than contradicted.
      const otHrs = row.overtimeHours;
      if (otHrs === 0) return null;

      const ndotHrs = Math.min(row.nightDiffHours, otHrs); // ND hours worked as OT
      const ndotPay = ndotHrs * rate * 1.1 * 1.25; // ND (10%) on OT (125%)

      // Distribute the OT hours across the premium bands deterministically.
      const bands = {} as Record<OtRateBand, number>;
      let remaining = otHrs;
      OT_RATE_BANDS.forEach((band, b) => {
        const share = b === OT_RATE_BANDS.length - 1 ? remaining : s(40 + b, otHrs + 1);
        const hrs = Math.min(share, remaining);
        remaining -= hrs;
        bands[band] = Math.round(hrs * rate * (band / 100) * 100) / 100;
      });

      return {
        dept_code: row.department,
        employee_id: row.employeeId,
        employee_name: row.name,
        ndot_8_hrs: ndotHrs,
        ndot_8_pay: Math.round(ndotPay * 100) / 100,
        ot_hrs: otHrs,
        bands,
      } satisfies OvertimeRow;
    })
    .filter((r): r is OvertimeRow => r !== null);
}

/** Aggregate overtime rows by DEPT CODE — the register's grouped view. */
export function overtimeByDept(rows: OvertimeRow[]): OvertimeRow[] {
  const groups = new Map<string, OvertimeRow>();
  for (const r of rows) {
    const g = groups.get(r.dept_code);
    if (g) {
      g.ndot_8_hrs += r.ndot_8_hrs;
      g.ndot_8_pay += r.ndot_8_pay;
      g.ot_hrs += r.ot_hrs;
      OT_RATE_BANDS.forEach((band) => (g.bands[band] += r.bands[band]));
    } else {
      groups.set(r.dept_code, {
        ...r,
        employee_id: "",
        employee_name: "",
        bands: { ...r.bands },
      });
    }
  }
  // Round accumulated floats back to 2 decimals.
  return Array.from(groups.values())
    .map((g) => {
      g.ndot_8_pay = Math.round(g.ndot_8_pay * 100) / 100;
      OT_RATE_BANDS.forEach((band) => (g.bands[band] = Math.round(g.bands[band] * 100) / 100));
      return g;
    })
    .sort((a, b) => a.dept_code.localeCompare(b.dept_code));
}

/** Column-wise totals for the "Total Result" footer row. */
export function overtimeTotals(rows: OvertimeRow[]): Record<OvertimeNumericColumn, number> {
  const totals = {} as Record<OvertimeNumericColumn, number>;
  for (const col of OVERTIME_NUMERIC_COLUMNS) {
    const sum = rows.reduce((acc, r) => acc + overtimeCell(r, col), 0);
    totals[col] = Math.round(sum * 100) / 100;
  }
  return totals;
}

// ---- Bank account numbers ------------------------------------------------

/**
 * Deterministic 12-digit bank account number for an employee, derived from the
 * employee id. There is no account field on the HR record (no backend), so —
 * like the rest of the app — we synthesise a stable value: the same employee
 * always maps to the same account, formatted "0000-0000-0000" for display and
 * the bank export file.
 */
export function accountNoFor(employeeId: string): string {
  // Fold the id characters into a large positive integer, then take 12 digits.
  let h = 2166136261;
  for (let i = 0; i < employeeId.length; i++) {
    h = (h ^ employeeId.charCodeAt(i)) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  const digits = String(h).padStart(12, "0").slice(-12);
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

// ---- Payslip (Tab 2) -----------------------------------------------------

/**
 * Filters that scope a Payslip query. Payroll Period maps onto the register's
 * paytype (1st half / 2nd half / Full month); agency defaults to all staff.
 */
export interface PayslipFilters {
  payclass: string;
  month: string; // 3-letter upper e.g. "JUL"
  year: string;
  period: string; // "1st half" | "2nd half" | "Full month"
  /** Staffing-agency scope; "All Agencies" / "Direct hire" or a specific name. */
  agency?: string;
}

/** One payslip line per employee — the summary the payslip table renders. */
export interface PayslipRow {
  employee_id: string;
  employee_name: string;
  department: string;
  account_no: string;
  basic: number;
  deductions: number;
  earnings: number;
  tax: number;
  net_pay: number;
}

/** Turn Payslip filters into the register {@link ReportFilters} shape. */
function payslipToReportFilters(f: PayslipFilters): ReportFilters {
  return {
    year: f.year,
    month: f.month,
    payclass: f.payclass,
    paytype: f.period,
    agency: f.agency ?? ALL_AGENCIES,
  };
}

/**
 * Build the per-employee Payslip summary for the given filters, reusing the
 * register engine so payslip figures reconcile with the Payroll Register. Basic
 * = BASIC RATE, Earnings = GROSS EARNINGS, Deductions = TOTAL DEDN (Tax broken
 * out separately as BASE TAX), Net Pay = TOTAL NET.
 */
export function payslipRows(
  employees: Employee[],
  filters: PayslipFilters,
  overrides: PayrollOverrides = {},
  /** Period's payroll runs — see {@link deptRegister}. */
  periodRuns?: ProcessedRun[],
): PayslipRow[] {
  return deptRegister(employees, payslipToReportFilters(filters), overrides, {}, periodRuns).map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    department: r.dept_code,
    account_no: accountNoFor(r.employee_id),
    basic: r.basic_rate,
    deductions: r.total_dedn,
    earnings: r.gross_earnings,
    tax: r.base_tax,
    net_pay: r.total_net,
  }));
}

/**
 * Bank-upload rows for the Payslip "Export Bank File" action: one credit line
 * per employee (account number, name, net pay). Ready for {@link downloadCsv}
 * or a fixed-width text export.
 */
export function bankFileRows(rows: PayslipRow[]): {
  "ACCOUNT NO": string;
  "EMPLOYEE NAME": string;
  AMOUNT: string;
}[] {
  return rows.map((r) => ({
    "ACCOUNT NO": r.account_no.replace(/-/g, ""),
    "EMPLOYEE NAME": r.employee_name,
    AMOUNT: r.net_pay.toFixed(2),
  }));
}

// ---- NET 15 (Tab 3) ------------------------------------------------------

/** One NET 15 line — 1st-half net pay credited to an employee's account. */
export interface Net15Row {
  employee_id: string;
  employee_name: string;
  account_no: string;
  net: number;
}

/**
 * Build the NET 15 list: each employee's 1st-half net pay and destination
 * account. Always computed for the "1st half" cutoff regardless of the caller.
 */
export function net15Rows(
  employees: Employee[],
  filters: { year: string; month: string; payclass: string; paytype: string; agency?: string },
  overrides: PayrollOverrides = {},
  /** Period's payroll runs — see {@link deptRegister}. */
  periodRuns?: ProcessedRun[],
): Net15Row[] {
  const scoped: ReportFilters = {
    year: filters.year,
    month: filters.month,
    payclass: filters.payclass,
    paytype: "1st half",
    agency: filters.agency ?? ALL_AGENCIES,
  };
  return deptRegister(employees, scoped, overrides, {}, periodRuns).map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    account_no: accountNoFor(r.employee_id),
    net: r.total_net,
  }));
}

// ---- NET 15/30 (Tab 4) ---------------------------------------------------

/** One NET 15/30 line — both semi-monthly nets and their total per employee. */
export interface Net1530Row {
  employee_id: string;
  employee_name: string;
  account_no: string;
  net_15: number;
  net_30: number;
  total_net: number;
}

/**
 * Build the NET 15/30 list: each employee's 1st-half (NET 15) and 2nd-half
 * (NET 30) net pay plus their combined total. The two halves are computed
 * independently through the register engine and joined per employee.
 */
export function net1530Rows(
  employees: Employee[],
  filters: { year: string; month: string; payclass: string; agency?: string },
  overrides: PayrollOverrides = {},
  /** Period's payroll runs — see {@link deptRegister}. */
  periodRuns?: ProcessedRun[],
): Net1530Row[] {
  const base = {
    year: filters.year,
    month: filters.month,
    payclass: filters.payclass,
    agency: filters.agency ?? ALL_AGENCIES,
  };
  const first = deptRegister(employees, { ...base, paytype: "1st half" }, overrides, {}, periodRuns);
  const second = deptRegister(employees, { ...base, paytype: "2nd half" }, overrides, {}, periodRuns);
  const secondById = new Map(second.map((r) => [r.employee_id, r.total_net]));

  return first.map((r) => {
    const net_15 = r.total_net;
    const net_30 = secondById.get(r.employee_id) ?? 0;
    return {
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      account_no: accountNoFor(r.employee_id),
      net_15,
      net_30,
      total_net: Math.round((net_15 + net_30) * 100) / 100,
    };
  });
}

/** Column-wise totals for the NET 15/30 footer ("TOTAL" row). */
export function net1530Totals(rows: Net1530Row[]): { net_15: number; net_30: number; total_net: number } {
  const sum = (pick: (r: Net1530Row) => number) =>
    Math.round(rows.reduce((acc, r) => acc + pick(r), 0) * 100) / 100;
  return {
    net_15: sum((r) => r.net_15),
    net_30: sum((r) => r.net_30),
    total_net: sum((r) => r.total_net),
  };
}
