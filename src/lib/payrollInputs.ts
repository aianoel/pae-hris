/**
 * Real per-employee deduction inputs for the payroll engine.
 *
 * The engine used to synthesise loan and other-deduction amounts from a seeded
 * pseudo-random draw — stable per employee, but fiction. This module replaces
 * that with the two ledgers HR actually maintains, mapped onto the register's
 * itemised lines:
 *
 *   • {@link Loan}[] — the Loans page. Amortisations respect the loan's status
 *     (on-hold/paid deduct nothing) and are capped at the outstanding balance,
 *     so the final month never over-collects. See `monthlyDeduction`.
 *   • {@link LoanEntry}[] — the per-employee tabbed ledger (SSS / HMO / HDMF /
 *     PECO / 2-year / 5-year). Each line's `perMonth` is capped at what is still
 *     unpaid, mirroring the same rule.
 *
 * Both are summed: an employee carrying an SSS salary loan on the Loans page and
 * an SSS line in the tabbed ledger is deducted for both, because they are two
 * separate obligations as far as this app is concerned. Entering the *same* loan
 * in both places will therefore double-deduct — that is a data-entry question,
 * not something the engine can second-guess.
 *
 * WHY A SEPARATE MODULE: `lib/payroll.ts` is imported by the loan ledgers'
 * own report builders, so mapping the ledgers there would close an import cycle.
 * Keeping the mapping here leaves the dependency one-way (payroll → inputs).
 */
import { monthlyDeduction, type Loan, type LoanType } from "@/lib/loans";
import { unpaidOf, type LoanEntry, type LoanTabKey } from "@/lib/employeeLoans";

/**
 * One employee's deduction lines, in the same vocabulary as the payroll
 * register's columns. Every field is a whole-month PHP amount.
 */
export interface EmployeeDeductions {
  /** SSS LOAN (register code 262). */
  sssLoan: number;
  /** HDMF LOAN (274) — the Pag-IBIG multi-purpose / calamity / housing loans. */
  hdmfLoan: number;
  /** PECEWA LOAN (264). No source ledger yet, so always 0. */
  pecewaLoan: number;
  /** COOP LOAN (265). */
  coopLoan: number;
  /** PAGIBIG AD (261) — additional Pag-IBIG. No source ledger yet, so always 0. */
  pagibigAd: number;
  /**
   * Loans with no dedicated register column — company/bank loans and the
   * fixed 2- and 5-year ledger plans. They are still deducted (they are part of
   * the `loans` roll-up); the register surfaces them on OTHER DEDN, because
   * `carve` hands back anything the itemised columns don't claim.
   */
  otherLoans: number;
  /** Cash advance ("vale") — its own field on the payroll row, not a loan line. */
  cashAdvance: number;
  /** HMO DEDN (405), from the ledger's HMO tab. */
  hmo: number;
  /** ELECT BILL (175), from the ledger's PECO tab (an electricity account). */
  electricBill: number;
  /** DED A (178). No source ledger yet, so always 0. */
  dedA: number;
}

/** Per-employee deductions, keyed by employee id. */
export type PayrollDeductionInputs = Record<string, EmployeeDeductions>;

/** An all-zero set — what an employee with no loan records is deducted. */
export function noDeductions(): EmployeeDeductions {
  return {
    sssLoan: 0,
    hdmfLoan: 0,
    pecewaLoan: 0,
    coopLoan: 0,
    pagibigAd: 0,
    otherLoans: 0,
    cashAdvance: 0,
    hmo: 0,
    electricBill: 0,
    dedA: 0,
  };
}

/**
 * Which register line each Loans-page type is deducted on. Company and bank
 * loans have no column of their own and fall to `otherLoans`; cash advances are
 * not a loan line at all — the payroll row has a dedicated Cash Advance field.
 */
const LINE_FOR_LOAN_TYPE: Record<LoanType, keyof EmployeeDeductions> = {
  "SSS Salary Loan": "sssLoan",
  "SSS Calamity Loan": "sssLoan",
  "Pag-IBIG Multi-Purpose Loan": "hdmfLoan",
  "Pag-IBIG Calamity Loan": "hdmfLoan",
  "Pag-IBIG Housing Loan": "hdmfLoan",
  "Cooperative Loan": "coopLoan",
  "Cash Advance": "cashAdvance",
  "Company Loan": "otherLoans",
  "Bank Loan": "otherLoans",
};

/**
 * Which register line each tabbed-ledger category is deducted on.
 *
 * `peco` is the electricity account (the tab asks for a meter number), so it
 * maps to ELECT BILL rather than to the PECEWA loan line — despite the similar
 * name, PECEWA (code 264) is a different deduction with no ledger behind it yet.
 */
const LINE_FOR_LOAN_TAB: Record<LoanTabKey, keyof EmployeeDeductions> = {
  sss: "sssLoan",
  hdmf: "hdmfLoan",
  peco: "electricBill",
  hmo: "hmo",
  twoYears: "otherLoans",
  fiveYears: "otherLoans",
};

/**
 * A ledger line's monthly deduction, capped at what is still owed so a plan in
 * its final month collects the remainder and nothing more. Fully-paid lines
 * deduct zero.
 */
export function entryDeduction(entry: LoanEntry): number {
  return Math.max(0, Math.min(entry.perMonth, unpaidOf(entry)));
}

/**
 * Fold both loan ledgers into per-employee deduction lines for the payroll
 * engine. Employees with no records are simply absent from the result — callers
 * fall back to {@link noDeductions}.
 */
export function buildPayrollDeductionInputs(
  loans: Loan[],
  entries: LoanEntry[],
): PayrollDeductionInputs {
  const out: PayrollDeductionInputs = {};
  const forEmployee = (employeeId: string): EmployeeDeductions =>
    (out[employeeId] ??= noDeductions());

  for (const loan of loans) {
    const amount = monthlyDeduction(loan); // 0 unless active; capped at balance
    if (amount <= 0) continue;
    forEmployee(loan.employeeId)[LINE_FOR_LOAN_TYPE[loan.type] ?? "otherLoans"] += amount;
  }

  for (const entry of entries) {
    const amount = entryDeduction(entry);
    if (amount <= 0) continue;
    const line = LINE_FOR_LOAN_TAB[entry.tab];
    if (!line) continue; // unknown tab (forward-compat) — never silently mis-post
    forEmployee(entry.employeeId)[line] += amount;
  }

  return out;
}
