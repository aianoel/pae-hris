/**
 * Contribution management domain model. Contribution rates map a salary range to
 * a Monthly Salary Credit (MSC) and the employer/employee share for a given
 * statutory contribution type. Given an employee salary we look up the matching
 * range and derive the deduction automatically.
 *
 * All money is monthly, in whole PHP (matching the rest of the app).
 */

import { formatCurrency } from "@/lib/format";

export const CONTRIBUTION_TYPES = ["SSS", "PhilHealth", "Pag-IBIG", "Tax", "Custom"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export type RateStatus = "active" | "inactive";

export interface ContributionRate {
  id: string;
  type: ContributionType;
  salaryFrom: number;
  salaryTo: number;
  /** Monthly Salary Credit — the capped base the shares are computed against. */
  msc: number;
  employerShare: number; // ER
  employeeShare: number; // EE
  /** ER + EE, always kept in sync via computeTotal. */
  total: number;
  effectiveMonth: number; // 1-12
  effectiveYear: number;
  status: RateStatus;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const monthLabel = (m: number) => MONTHS[Math.min(Math.max(m, 1), 12) - 1];

/** Total is always employer + employee — never entered by hand. */
export const computeTotal = (er: number, ee: number) => er + ee;

/** Accent color per contribution type, used for chips/badges. */
export const TYPE_TINT: Record<ContributionType, string> = {
  SSS: "bg-primary/10 text-primary",
  PhilHealth: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Pag-IBIG": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Tax: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  Custom: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

// ---- Validation --------------------------------------------------------

/** Two inclusive salary ranges overlap when neither ends before the other starts. */
export function rangesOverlap(
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export interface RateDraft {
  type: ContributionType;
  salaryFrom: number;
  salaryTo: number;
  msc: number;
  employerShare: number;
  employeeShare: number;
  effectiveMonth: number;
  effectiveYear: number;
  status: RateStatus;
}

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof RateDraft | "overlap", string>>;
}

/**
 * Validate a draft rate against the existing table. Enforces required fields,
 * "from < to", non-negative shares and no overlapping range for the same
 * type/month/year (which also covers exact duplicates). `ignoreId` skips the
 * row being edited.
 */
export function validateRate(
  draft: RateDraft,
  existing: ContributionRate[],
  ignoreId?: string,
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!draft.type) errors.type = "Contribution type is required.";
  if (draft.salaryFrom == null || Number.isNaN(draft.salaryFrom))
    errors.salaryFrom = "Salary From is required.";
  if (draft.salaryTo == null || Number.isNaN(draft.salaryTo))
    errors.salaryTo = "Salary To is required.";

  if (draft.salaryFrom < 0) errors.salaryFrom = "Cannot be negative.";
  if (draft.salaryTo <= draft.salaryFrom)
    errors.salaryTo = "Salary To must be greater than Salary From.";

  if (draft.employerShare < 0) errors.employerShare = "Cannot be negative.";
  if (draft.employeeShare < 0) errors.employeeShare = "Cannot be negative.";
  if (draft.msc < 0) errors.msc = "Cannot be negative.";
  if (!draft.effectiveYear) errors.effectiveYear = "Effective year is required.";

  // No overlapping range for the same type + effective period.
  const clash = existing.find(
    (r) =>
      r.id !== ignoreId &&
      r.type === draft.type &&
      r.effectiveMonth === draft.effectiveMonth &&
      r.effectiveYear === draft.effectiveYear &&
      rangesOverlap(draft.salaryFrom, draft.salaryTo, r.salaryFrom, r.salaryTo),
  );
  if (clash) {
    errors.overlap =
      `Overlaps an existing ${draft.type} range ` +
      `(${formatCurrency(clash.salaryFrom)}–${formatCurrency(clash.salaryTo)}) ` +
      `for ${monthLabel(draft.effectiveMonth)} ${draft.effectiveYear}.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// ---- Lookup & computation ---------------------------------------------

/**
 * Find the active rate of a given type whose salary range contains `salary`.
 * When multiple periods exist, the most recent effective period wins.
 */
export function findMatchingRate(
  rates: ContributionRate[],
  type: ContributionType,
  salary: number,
): ContributionRate | null {
  const matches = rates
    .filter(
      (r) =>
        r.type === type &&
        r.status === "active" &&
        salary >= r.salaryFrom &&
        salary <= r.salaryTo,
    )
    .sort((a, b) =>
      b.effectiveYear - a.effectiveYear || b.effectiveMonth - a.effectiveMonth,
    );
  return matches[0] ?? null;
}

// ---- Cross-tab schedule matrix ----------------------------------------

/** One cell in the schedule matrix — the rate for a bracket × type, if any. */
export interface MatrixCell {
  rate: ContributionRate | null;
}

/** One row of the schedule matrix: a salary bracket and its cell per type. */
export interface MatrixRow {
  from: number;
  to: number;
  cells: Record<ContributionType, MatrixCell>;
}

export interface ScheduleMatrix {
  types: ContributionType[];
  rows: MatrixRow[];
}

/**
 * Pivot the flat rate table into a cross-tab schedule: rows are the union of
 * every salary bracket edge (so bands from different types line up), columns
 * are the contribution types. For each bracket we look up the active rate of
 * each type that contains the bracket's lower bound.
 *
 * Only rates for the given effective period are considered; pass the period the
 * UI is showing. `types` controls the column order/set.
 */
export function buildScheduleMatrix(
  rates: ContributionRate[],
  period: { month: number; year: number },
  types: ContributionType[] = ["SSS", "PhilHealth", "Pag-IBIG", "Tax"],
): ScheduleMatrix {
  const inPeriod = rates.filter(
    (r) =>
      r.status === "active" &&
      r.effectiveMonth === period.month &&
      r.effectiveYear === period.year &&
      types.includes(r.type),
  );

  // Collect every distinct band boundary to build contiguous matrix rows.
  const edges = new Set<number>([0]);
  for (const r of inPeriod) {
    edges.add(r.salaryFrom);
    edges.add(r.salaryTo + 1); // start of the next band
  }
  const sorted = Array.from(edges).sort((a, b) => a - b);

  const rows: MatrixRow[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1] - 1;
    if (to < from) continue;

    const cells = {} as Record<ContributionType, MatrixCell>;
    let hasAny = false;
    for (const type of types) {
      const rate =
        inPeriod.find((r) => r.type === type && from >= r.salaryFrom && from <= r.salaryTo) ?? null;
      if (rate) hasAny = true;
      cells[type] = { rate };
    }
    // Skip empty gap rows where no type has a band.
    if (hasAny) rows.push({ from, to, cells });
  }

  return { types, rows };
}

/** Distinct effective periods present in the table, most recent first. */
export function ratePeriods(rates: ContributionRate[]): { month: number; year: number }[] {
  const seen = new Map<string, { month: number; year: number }>();
  for (const r of rates) {
    const key = `${r.effectiveYear}-${r.effectiveMonth}`;
    if (!seen.has(key)) seen.set(key, { month: r.effectiveMonth, year: r.effectiveYear });
  }
  return Array.from(seen.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );
}

// ---- Lookup line / result ---------------------------------------------

export interface ContributionLine {
  type: ContributionType;
  rate: ContributionRate | null;
  msc: number;
  employerShare: number;
  employeeShare: number;
  total: number;
}

export interface ContributionResult {
  salary: number;
  lines: ContributionLine[];
  /** Sum of employee shares — what's deducted from take-home pay. */
  totalEmployee: number;
  totalEmployer: number;
  totalContribution: number;
  /** Types with no matching salary range. */
  unmatched: ContributionType[];
}

/**
 * Compute all statutory contributions for a salary against the rate table.
 * Types with no matching range are reported in `unmatched` so the UI can show
 * "No contribution rate found".
 */
export function computeContribution(
  salary: number,
  rates: ContributionRate[],
  types: ContributionType[] = ["SSS", "PhilHealth", "Pag-IBIG", "Tax"],
): ContributionResult {
  const lines: ContributionLine[] = [];
  const unmatched: ContributionType[] = [];

  for (const type of types) {
    const rate = findMatchingRate(rates, type, salary);
    if (!rate) {
      unmatched.push(type);
      lines.push({ type, rate: null, msc: 0, employerShare: 0, employeeShare: 0, total: 0 });
      continue;
    }
    lines.push({
      type,
      rate,
      msc: rate.msc,
      employerShare: rate.employerShare,
      employeeShare: rate.employeeShare,
      total: rate.total,
    });
  }

  const totalEmployee = lines.reduce((s, l) => s + l.employeeShare, 0);
  const totalEmployer = lines.reduce((s, l) => s + l.employerShare, 0);

  return {
    salary,
    lines,
    totalEmployee,
    totalEmployer,
    totalContribution: totalEmployee + totalEmployer,
    unmatched,
  };
}

// ---- Contribution matrix (earnings → contributable base) --------------

/**
 * The earning types payroll can pay. The Contribution Matrix decides which of
 * these count toward the base a given contribution is computed against (e.g.
 * whether overtime is included when deriving the SSS contributable salary).
 * Codes/labels mirror the payroll register lines.
 */
export const EARNING_TYPES = [
  { code: "cola", label: "Cola", description: "Cost of Living Allowance" },
  { code: "transAllw", label: "Trans Allowance", description: "Transportation allowance" },
  { code: "rice", label: "Rice", description: "Rice subsidy" },
  { code: "holidayPay", label: "Holiday Pay", description: "Regular/special holiday premium" },
  { code: "thirteenthMonth", label: "13th Month", description: "13th-month pay" },
  { code: "ps", label: "PS", description: "Productivity / service incentive" },
  { code: "otherEarnings", label: "Other Earnings", description: "Miscellaneous earnings" },
  { code: "sickLeave", label: "Sick Leave", description: "Paid sick-leave conversion" },
  { code: "niteDiff", label: "Nite Diff", description: "Night-shift differential" },
  { code: "ot125", label: "OT (125%)", description: "Ordinary overtime premium" },
  { code: "actingAllw", label: "Acting Allw", description: "Acting / officer-in-charge allowance" },
  { code: "adjustment", label: "Adjustment", description: "Manual earnings adjustment" },
  { code: "word130", label: "WoRD (130%)", description: "Work on rest day premium" },
  { code: "ot160", label: "OT (160%)", description: "Rest-day / special-day overtime" },
  { code: "fourteenthMonth", label: "14th Month", description: "14th-month pay" },
  { code: "wordOt130", label: "WoRD OT (130%)", description: "Overtime on a rest day" },
] as const;

export type EarningCode = (typeof EARNING_TYPES)[number]["code"];

/** The four statutory contributions the matrix is configured for. */
export const MATRIX_TYPES: ContributionType[] = ["Pag-IBIG", "PhilHealth", "SSS", "Tax"];

/** Human display name per contribution type, as shown in the matrix selector. */
export const CONTRIBUTION_DISPLAY_NAME: Record<ContributionType, string> = {
  SSS: "SSS (Social Security System)",
  PhilHealth: "PHILHEALTH (Philhealth)",
  "Pag-IBIG": "HDMF (Pag-ibig)",
  Tax: "TAX (BIR Tax)",
  Custom: "Custom",
};

/**
 * Which earning codes are included in the contributable base per contribution
 * type. A code present in a type's set means "this earning is added to the base
 * when computing that contribution". Consumed by the payroll engine.
 */
export type EarningsMatrix = Record<ContributionType, EarningCode[]>;

/**
 * Sensible defaults: statutory contributions (SSS/PhilHealth/Pag-IBIG) are
 * computed on basic pay plus regular allowances, not on premium/overtime lines;
 * Tax has the widest base (most earnings are taxable) but excludes the tax-exempt
 * 13th/14th-month lines. Adjust per company policy in the UI.
 */
export function defaultEarningsMatrix(): EarningsMatrix {
  const statutory: EarningCode[] = ["cola", "transAllw", "rice", "ps"];
  const taxable = EARNING_TYPES
    .map((e) => e.code)
    .filter((c) => c !== "thirteenthMonth" && c !== "fourteenthMonth");
  return {
    SSS: [...statutory],
    PhilHealth: [...statutory],
    "Pag-IBIG": [...statutory],
    Tax: taxable,
    Custom: [],
  };
}

/** Toggle one earning code for a contribution type, returning a new matrix. */
export function toggleEarning(
  matrix: EarningsMatrix,
  type: ContributionType,
  code: EarningCode,
): EarningsMatrix {
  const current = matrix[type] ?? [];
  const next = current.includes(code)
    ? current.filter((c) => c !== code)
    : [...current, code];
  return { ...matrix, [type]: next };
}

// ---- Seed data ---------------------------------------------------------

/**
 * Contribution matrix — starts empty. Add SSS/PhilHealth/Pag-IBIG/Tax brackets
 * through the Contributions UI.
 */
export const seedContributionRates: ContributionRate[] = [];
