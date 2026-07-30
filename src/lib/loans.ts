/**
 * Employee loan domain model. A loan is money advanced to an employee that is
 * repaid through fixed monthly amortisations deducted on payroll. This covers
 * the loan types commonly seen in Philippine payroll — government programmes
 * (SSS, Pag-IBIG), cooperative and company loans, and cash advances ("vale").
 *
 * All money is in whole PHP (matching the rest of the app). The amortisation is
 * the amount pulled each month; a semi-monthly payroll splits it across the two
 * cutoffs (see `perCutoff`). Balances are tracked so the loan closes itself once
 * fully paid.
 */

/** Loan types typical of Philippine payroll, in display order. */
export const LOAN_TYPES = [
  "SSS Salary Loan",
  "SSS Calamity Loan",
  "Pag-IBIG Multi-Purpose Loan",
  "Pag-IBIG Calamity Loan",
  "Pag-IBIG Housing Loan",
  "Cooperative Loan",
  "Cash Advance",
  "Company Loan",
  "Bank Loan",
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

/** A loan is active while repaying, fully paid, or on hold (skips deduction). */
export type LoanStatus = "active" | "paid" | "on-hold";

export interface Loan {
  id: string;
  employeeId: string;
  /** Denormalised for display/search so the table doesn't need a join. */
  employeeName: string;
  type: LoanType;
  /** Optional lender/reference (e.g. SSS loan account no., coop name). */
  reference: string;
  /** Original amount borrowed. */
  principal: number;
  /** Annual interest rate as a percentage (0 for interest-free advances). */
  interestRate: number;
  /** Number of monthly amortisations the loan is repaid over. */
  termMonths: number;
  /** Fixed amount deducted each month — kept in sync via `computeAmortization`. */
  monthlyAmortization: number;
  /** Total already repaid; balance = totalPayable − amountPaid. */
  amountPaid: number;
  /** ISO date (YYYY-MM-DD) the first deduction applies. */
  startDate: string;
  status: LoanStatus;
}

/** Accent colour per loan type, used for chips/badges (mirrors TYPE_TINT). */
export const LOAN_TYPE_TINT: Record<LoanType, string> = {
  "SSS Salary Loan": "bg-primary/10 text-primary",
  "SSS Calamity Loan": "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "Pag-IBIG Multi-Purpose Loan": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Pag-IBIG Calamity Loan": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "Pag-IBIG Housing Loan": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Cooperative Loan": "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  "Cash Advance": "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "Company Loan": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "Bank Loan": "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

const STATUS_LABEL: Record<LoanStatus, string> = {
  active: "Active",
  paid: "Paid",
  "on-hold": "On hold",
};
export const loanStatusLabel = (s: LoanStatus) => STATUS_LABEL[s];

// ---- Computation -------------------------------------------------------

/**
 * Total repayable over the life of the loan: principal plus simple interest
 * (annual rate × principal × term-in-years). Rounded to whole PHP. Simple
 * interest keeps the demo maths transparent; real government loans use their
 * own tables, but this is a faithful stand-in.
 */
export function totalPayable(principal: number, annualRatePct: number, termMonths: number): number {
  const interest = principal * (annualRatePct / 100) * (termMonths / 12);
  return Math.round(principal + interest);
}

/**
 * Fixed monthly amortisation = total payable / term (whole PHP). A zero or
 * missing term yields 0 so a half-entered draft never divides by zero.
 */
export function computeAmortization(
  principal: number,
  annualRatePct: number,
  termMonths: number,
): number {
  if (!termMonths || termMonths <= 0) return 0;
  return Math.round(totalPayable(principal, annualRatePct, termMonths) / termMonths);
}

/** Outstanding balance = total payable − amount already paid (never negative). */
export function outstandingBalance(loan: Loan): number {
  return Math.max(0, totalPayable(loan.principal, loan.interestRate, loan.termMonths) - loan.amountPaid);
}

/**
 * The amount this loan contributes to a single payroll cutoff. Payroll is run
 * semi-monthly, so the monthly amortisation is split evenly across the two
 * cutoffs. `on-hold`/`paid` loans deduct nothing, and the deduction is capped at
 * the remaining balance so the final cutoff never over-collects.
 */
export function perCutoff(loan: Loan): number {
  if (loan.status !== "active") return 0;
  const half = Math.round(loan.monthlyAmortization / 2);
  return Math.min(half, outstandingBalance(loan));
}

/** Whole-month deduction for an active loan, capped at the remaining balance. */
export function monthlyDeduction(loan: Loan): number {
  if (loan.status !== "active") return 0;
  return Math.min(loan.monthlyAmortization, outstandingBalance(loan));
}

/**
 * Apply a repayment to a loan, returning a new loan with the balance advanced.
 * When the outstanding balance reaches zero the loan auto-closes to "paid".
 */
export function applyPayment(loan: Loan, amount: number): Loan {
  const payable = totalPayable(loan.principal, loan.interestRate, loan.termMonths);
  const amountPaid = Math.min(payable, loan.amountPaid + Math.max(0, amount));
  return {
    ...loan,
    amountPaid,
    status: amountPaid >= payable ? "paid" : loan.status === "paid" ? "active" : loan.status,
  };
}

// ---- Validation --------------------------------------------------------

export interface LoanDraft {
  employeeId: string;
  employeeName: string;
  type: LoanType;
  reference: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  monthlyAmortization: number;
  amountPaid: number;
  startDate: string;
  status: LoanStatus;
}

export interface LoanValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof LoanDraft, string>>;
}

/**
 * Validate a loan draft. Enforces an employee + type, a positive principal and
 * term, non-negative rate/paid, and that the amount paid can't exceed the total
 * payable. Does not check for duplicate loans — an employee can legitimately
 * hold several loans of the same type over time.
 */
export function validateLoan(draft: LoanDraft): LoanValidationResult {
  const errors: LoanValidationResult["errors"] = {};

  if (!draft.employeeId) errors.employeeId = "Employee is required.";
  if (!draft.type) errors.type = "Loan type is required.";

  if (draft.principal == null || Number.isNaN(draft.principal))
    errors.principal = "Principal is required.";
  else if (draft.principal <= 0) errors.principal = "Principal must be greater than zero.";

  if (draft.termMonths == null || Number.isNaN(draft.termMonths))
    errors.termMonths = "Term is required.";
  else if (draft.termMonths <= 0) errors.termMonths = "Term must be at least 1 month.";

  if (draft.interestRate < 0) errors.interestRate = "Cannot be negative.";
  if (draft.amountPaid < 0) errors.amountPaid = "Cannot be negative.";

  if (draft.principal > 0 && draft.termMonths > 0) {
    const payable = totalPayable(draft.principal, draft.interestRate, draft.termMonths);
    if (draft.amountPaid > payable)
      errors.amountPaid = "Amount paid can't exceed the total payable.";
  }

  if (!draft.startDate) errors.startDate = "Start date is required.";

  return { ok: Object.keys(errors).length === 0, errors };
}

// ---- Aggregation -------------------------------------------------------

export interface LoanSummary {
  count: number;
  activeCount: number;
  totalPrincipal: number;
  totalOutstanding: number;
  /** Total pulled from a single semi-monthly cutoff across all active loans. */
  perCutoff: number;
  /** Total pulled across a whole month across all active loans. */
  monthly: number;
}

/** Roll up a set of loans into headline figures for the KPI cards. */
export function summarizeLoans(loans: Loan[]): LoanSummary {
  return loans.reduce<LoanSummary>(
    (acc, loan) => {
      acc.count += 1;
      if (loan.status === "active") acc.activeCount += 1;
      acc.totalPrincipal += loan.principal;
      acc.totalOutstanding += outstandingBalance(loan);
      acc.perCutoff += perCutoff(loan);
      acc.monthly += monthlyDeduction(loan);
      return acc;
    },
    { count: 0, activeCount: 0, totalPrincipal: 0, totalOutstanding: 0, perCutoff: 0, monthly: 0 },
  );
}

/** Active-loan monthly deduction for one employee — consumed by payroll. */
export function loanDeductionForEmployee(loans: Loan[], employeeId: string): number {
  return loans
    .filter((l) => l.employeeId === employeeId)
    .reduce((sum, l) => sum + monthlyDeduction(l), 0);
}

// ---- Seed data ---------------------------------------------------------

/** Loans start empty — added through the Loans UI. */
export const seedLoans: Loan[] = [];
