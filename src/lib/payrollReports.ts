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
  statutoryBreakdown,
  type PayrollRow,
  type PayrollOverrides,
} from "@/lib/payroll";

// Deterministic pseudo-random from an index — mirrors src/lib/payroll.ts so
// derived deductions stay stable and reproducible.
function seeded(i: number, mod: number) {
  return (i * 2654435761) % mod;
}

/** Monthly HMO premium (employee share) by employment type, in whole PHP. */
const HMO_BY_TYPE: Record<PayrollRow["employeeType"], number> = {
  Regular: 350,
  Probationary: 250,
  Contractual: 0,
  "Part-time": 0,
};

/** Paid working days per year used for the daily-rate divisor (LWOP). */
export const WORKING_DAYS_PER_YEAR = 261;

/** Daily rate from a monthly rate: (Monthly × 12) / 261. */
export function dailyRateFromMonthly(monthlyRate: number): number {
  return (monthlyRate * 12) / WORKING_DAYS_PER_YEAR;
}

/**
 * Leave-without-pay deduction = Daily Rate × LWOP Days, where
 * Daily Rate = (Monthly Rate × 12) / 261. Rounded to 2 decimals.
 */
export function lwopDeduction(monthlyRate: number, lwopDays: number): number {
  return Math.round(dailyRateFromMonthly(monthlyRate) * lwopDays * 100) / 100;
}

/**
 * Loan amortisations, HMO and leave-without-pay are not stored on the payroll
 * row, so we synthesise them deterministically per employee — occasional
 * fixed amortisations plus a type-based HMO premium and seeded LWOP days.
 */
function derivedDeductions(row: PayrollRow, i: number) {
  const s = (n: number, mod: number) => seeded(i + n, mod);

  // Seeded whole LWOP days this period (mostly 0); deduction uses the
  // 261-working-day daily rate: ((Monthly × 12) / 261) × LWOP Days.
  const lwopDays = s(24, 7) === 0 ? 1 + s(25, 3) : 0; // 0, or 1–3 days
  const lwop = lwopDeduction(row.basic, lwopDays);

  return {
    sssLoan: s(21, 8) === 0 ? 850 : 0,
    pagIbigLoan: s(22, 10) === 0 ? 600 : 0,
    coopLoan: s(23, 6) === 0 ? 1200 : 0,
    hmo: HMO_BY_TYPE[row.employeeType],
    // LWOP is unpaid leave, distinct from unplanned absences already on the row.
    lwopDays,
    lwop,
  };
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
 * Keep only the payroll rows matching an agency selection. The `ALL_AGENCIES`
 * sentinel passes everyone through; `DIRECT_HIRE` keeps rows with no agency.
 */
export function filterRowsByAgency(rows: PayrollRow[], agency: string): PayrollRow[] {
  if (agency === ALL_AGENCIES) return rows;
  if (agency === DIRECT_HIRE) return rows.filter((r) => !r.agency);
  return rows.filter((r) => r.agency === agency);
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

/**
 * Whether payroll has been processed for the given month/year — i.e. a payroll
 * run exists for the matching period. `month` is a 3-letter code ("JUL").
 */
export function isPayrollProcessed(
  payrollRuns: { period: string }[],
  month: string,
  year: string,
): boolean {
  const period = periodForFilters(month, year);
  return payrollRuns.some((r) => r.period === period);
}

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

/** Build one per-employee register row, itemising every earning/deduction. */
function deptRegisterRow(row: PayrollRow, i: number): DeptRegisterRow {
  const s = (n: number, mod: number) => seeded(i + n, mod);
  const stat = statutoryBreakdown(row.basic);
  const d = derivedDeductions(row, i);

  // ---- Earnings — split the lumped allowance into itemised lines ----
  const basic_rate = row.basic;
  const cola = 1500; // fixed cost-of-living allowance
  const trans_allw = row.allowances; // de-minimis transport allowance
  const rice_subsi = 2000; // statutory rice subsidy
  const holiday_pay = row.holidayPay;
  const nite_diff = row.nightDiff;
  const ot_pay = row.overtime;
  const acting_allw = s(51, 8) === 0 ? Math.round(row.basic * 0.05) : 0;
  const otheradd = row.adjustments + row.bonuses + row.commissions + row.otherEarnings;

  const gross_earnings =
    basic_rate + cola + trans_allw + rice_subsi + holiday_pay + nite_diff + ot_pay + acting_allw + otheradd;

  // ---- Deductions ----
  const sss_cont = stat.sss;
  const sss_loan = d.sssLoan;
  const hdmf_cont = stat.pagIbig; // Pag-IBIG/HDMF contribution
  const hdmf_loan = d.pagIbigLoan;
  const pecewa_loan = s(52, 9) === 0 ? 500 : 0;
  const coop_loan = d.coopLoan;
  const pagibig_ad = s(53, 7) === 0 ? 300 : 0; // Pag-IBIG additional
  const other_dedn = row.otherDeductions + row.cashAdvance;
  const hmo_dedn = d.hmo;
  const ded_a = s(54, 10) === 0 ? 250 : 0;
  const electric_bill = s(55, 6) === 0 ? 450 : 0;
  const mem_ins = 100; // fixed membership insurance
  const lwop = d.lwop;
  const base_tax = stat.tax;

  // Total deductions sums every itemised line so the register reconciles.
  const total_dedn =
    sss_cont +
    sss_loan +
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

/** Scale every numeric field of a register row by `factor` (rounded to whole
 *  PHP), leaving the identity fields (dept/employee) untouched. */
function scaleRegisterRow(row: DeptRegisterRow, factor: number): DeptRegisterRow {
  if (factor === 1) return row;
  const scaled = { ...row };
  for (const key of REGISTER_NUMERIC_KEYS) scaled[key] = Math.round(row[key] * factor);
  return scaled;
}

/**
 * Build the per-employee register for the given filters. The filter selection
 * perturbs the seed (as with the Overtime Register) so different
 * Year/Month/Payclass/Paytype combinations return plausibly different data —
 * standing in for the AJAX GET against the real payroll tables. The Paytype
 * filter additionally splits the whole-month amounts: 1st/2nd half each pay ½.
 */
export function deptRegister(
  employees: Employee[],
  filters: ReportFilters,
  overrides: PayrollOverrides = {},
): DeptRegisterRow[] {
  const salt =
    Number(filters.year) +
    filters.month.length * 7 +
    filters.payclass.length * 13 +
    filters.paytype.length * 17;
  const factor = payTypeFactor(filters.paytype);
  const rows = filterRowsByAgency(buildPayrollRows(employees, {}, overrides), filters.agency);
  return rows.map((row, idx) => scaleRegisterRow(deptRegisterRow(row, idx + salt), factor));
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
 * Build the Overtime Register for the given filters. Overtime hours/pay are
 * derived deterministically per employee (mirroring the rest of the app), with
 * the filters perturbing the seed so different Year/Month/Payclass/Paytype
 * combinations return plausibly different data — standing in for the AJAX GET
 * against a real overtime table. Employees with no overtime are omitted.
 */
export function overtimeRegister(
  employees: Employee[],
  filters: OvertimeFilters,
  overrides: PayrollOverrides = {},
): OvertimeRow[] {
  // Fold the filter selection into a stable numeric salt.
  const salt =
    Number(filters.year) +
    filters.month.length * 7 +
    filters.payclass.length * 13 +
    filters.paytype.length * 17;

  return filterRowsByAgency(buildPayrollRows(employees, {}, overrides), filters.agency)
    .map((row, idx) => {
      const i = idx + salt;
      const s = (n: number, mod: number) => seeded(i + n, mod);
      const rate = row.basic / 176; // hourly rate, 176 paid hrs/month

      const otHrs = s(31, 24); // 0–23 OT hours this period
      if (otHrs === 0) return null;

      const ndotHrs = s(32, 6); // night-differential OT hours
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
