/**
 * Per-employee "Loans" ledger, opened from the employee row action.
 *
 * This models the tabbed loan/deduction sheet used in local (PH) payroll: a set
 * of categories (SSS, HMO, Pag-IBIG/HDMF, PECO, plus fixed 2- and 5-year plans),
 * each holding its own list of entries. An entry records an Amount, a Term, the
 * Per-Month deduction, a Type/Description, the Date Created, and a Control ref.
 * Each category rolls up to Total Paid / Total Unpaid.
 *
 * Money is in whole PHP to match the rest of the app. Data is kept client-side
 * (localStorage) so it survives navigation/refresh without a schema change —
 * consistent with the demo store's local-first nature.
 */

/** The loan/deduction categories an entry can belong to. */
export type LoanTabKey = "sss" | "hmo" | "hdmf" | "peco" | "twoYears" | "fiveYears";

/**
 * One tab's shape. Declared up front rather than inferred from `LOAN_TABS` so
 * that `fixedTermMonths` is a known-optional property on *every* tab: inferring
 * the type from the `as const` array puts the field only on the two members that
 * set it, and reading it off the resulting union then fails to type-check.
 */
export interface LoanTab {
  readonly key: LoanTabKey;
  readonly label: string;
  readonly termLabel: string;
  readonly termPlaceholder: string;
  readonly typeLabel: string;
  readonly typePlaceholder: string;
  /** Fixed-length plans (2/5 years) pin the term; free-form tabs leave it unset. */
  readonly fixedTermMonths?: number;
}

/** The tabs, in display order. Each carries category-specific field labels. */
export const LOAN_TABS = [
  {
    key: "sss",
    label: "SSS Loan",
    termLabel: "For (term, months)",
    termPlaceholder: "e.g. 24",
    typeLabel: "Loan Type",
    typePlaceholder: "e.g. Salary Loan",
  },
  {
    key: "hmo",
    label: "HMO",
    termLabel: "For (coverage period/term)",
    termPlaceholder: "e.g. 12 months",
    typeLabel: "Provider/Plan Type",
    typePlaceholder: "e.g. Maxicare — Standard",
  },
  {
    key: "hdmf",
    label: "HDMF (Pag-IBIG)",
    termLabel: "For (term, months)",
    termPlaceholder: "e.g. 24",
    typeLabel: "Loan Type",
    typePlaceholder: "e.g. Multi-Purpose, Calamity",
  },
  {
    key: "peco",
    label: "PECO",
    termLabel: "For (billing period/term)",
    termPlaceholder: "e.g. monthly",
    typeLabel: "Account/Meter No. (or type)",
    typePlaceholder: "e.g. Meter 0012345",
  },
  {
    key: "twoYears",
    label: "Two (2) Years",
    termLabel: "For",
    termPlaceholder: "24 Months",
    typeLabel: "Type/Description",
    typePlaceholder: "Description",
    fixedTermMonths: 24,
  },
  {
    key: "fiveYears",
    label: "Five (5) Years",
    termLabel: "For",
    termPlaceholder: "60 Months",
    typeLabel: "Type/Description",
    typePlaceholder: "Description",
    fixedTermMonths: 60,
  },
] as const satisfies readonly LoanTab[];

/** A single loan/deduction line within a category. */
export interface LoanEntry {
  id: string;
  /** Owning employee. */
  employeeId: string;
  /** Which category tab this line belongs to. */
  tab: LoanTabKey;
  /** Total amount of the loan/plan. */
  amount: number;
  /** Term / coverage / billing period, as typed (e.g. "24", "12 months"). */
  term: string;
  /** Amount deducted each month (derived from amount ÷ term when possible). */
  perMonth: number;
  /** Loan Type / Provider / Account / Description, per the tab. */
  type: string;
  /** Date created, ISO `YYYY-MM-DD`. */
  date: string;
  /** Control / reference number. Auto-generated, editable. */
  control: string;
  /** Amount repaid so far. Total Unpaid = amount − paid. */
  paid: number;
}

/** All of an employee's entries, grouped by tab. */
export type EmployeeLoans = Record<LoanTabKey, LoanEntry[]>;

/** An empty ledger with every tab present. */
export function emptyLoans(): EmployeeLoans {
  return LOAN_TABS.reduce((acc, t) => {
    acc[t.key] = [];
    return acc;
  }, {} as EmployeeLoans);
}

/**
 * Group a flat list of one employee's entries into the per-tab shape the dialog
 * renders, back-filling any empty tabs. Non-matching entries are ignored.
 */
export function groupByTab(entries: LoanEntry[]): EmployeeLoans {
  const grouped = emptyLoans();
  for (const e of entries) {
    if (grouped[e.tab]) grouped[e.tab].push(e);
  }
  return grouped;
}

// ---- Computation -------------------------------------------------------

/** Pull the first integer out of a free-text term (e.g. "24 Months" → 24). */
export function termMonths(term: string): number {
  const m = /\d+/.exec(term);
  return m ? Number(m[0]) : 0;
}

/**
 * Per-month deduction = amount ÷ term-in-months (whole PHP), or 0 when the term
 * has no parseable month count (e.g. an HMO billed "monthly").
 */
export function computePerMonth(amount: number, term: string): number {
  const months = termMonths(term);
  if (!months) return 0;
  return Math.round(amount / months);
}

/** Outstanding for one entry: amount − paid, never negative. */
export function unpaidOf(entry: LoanEntry): number {
  return Math.max(0, entry.amount - entry.paid);
}

/**
 * How a loan's monthly deduction is spread across the two semi-monthly payroll
 * cutoffs (1st half = days 1–15, 2nd half = 16–end), keyed on the employee's
 * pay class:
 *
 *  - **Confidentials** — the whole amount is taken once, in the **1st half**
 *    (a one-time deduction); the 2nd half collects nothing.
 *  - **Rank And File** (and every other class) — the amount is **split evenly**
 *    across both halves.
 *
 * `first + second` always equals the rounded monthly amount, so the two cutoffs
 * reconcile back to the whole month.
 */
export function loanCutoffSplit(
  monthly: number,
  payClass?: string,
): { first: number; second: number } {
  const whole = Math.round(monthly);
  if (payClass === "Confidentials") return { first: whole, second: 0 };
  const first = Math.round(whole / 2);
  return { first, second: whole - first };
}

/** Total monthly loan deduction across every entry (uses each entry's perMonth). */
export function totalPerMonth(entries: LoanEntry[]): number {
  return entries.reduce((sum, e) => sum + e.perMonth, 0);
}

export interface TabSummary {
  totalAmount: number;
  totalPaid: number;
  totalUnpaid: number;
  count: number;
}

/** Roll up a category's entries into Total Paid / Total Unpaid. */
export function summarize(entries: LoanEntry[]): TabSummary {
  return entries.reduce<TabSummary>(
    (acc, e) => {
      acc.totalAmount += e.amount;
      acc.totalPaid += Math.min(e.paid, e.amount);
      acc.totalUnpaid += unpaidOf(e);
      acc.count += 1;
      return acc;
    },
    { totalAmount: 0, totalPaid: 0, totalUnpaid: 0, count: 0 },
  );
}

// ---- Control helper ----------------------------------------------------

/**
 * A human-friendly control number, e.g. "CTRL-4821". Derived from the entry id
 * so it's stable and deterministic (no Math.random), while staying short.
 */
export function controlFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `CTRL-${1000 + (hash % 9000)}`;
}

/** Draft values for a new entry (id/control/perMonth assigned on save). */
export type NewLoanEntry = Omit<LoanEntry, "id" | "control" | "perMonth">;
