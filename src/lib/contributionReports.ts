/**
 * Report builders for the contribution module. Each returns a flat array of
 * records ready for CSV export (via downloadCsv) or on-screen rendering.
 */
import { monthLabel, type ContributionRate, type ContributionType } from "@/lib/contributions";
import { computeContribution, type ContributionResult } from "@/lib/contributions";
import type { Employee } from "@/store/types";

export type ContributionReportKind =
  | "matrix"
  | "employee"
  | "monthly-summary"
  | "employer-share"
  | "employee-share";

export const REPORT_META: Record<ContributionReportKind, { title: string; description: string }> = {
  matrix: { title: "Contribution Matrix", description: "Every rate band across all types." },
  employee: { title: "Employee Contribution Report", description: "Per-employee computed shares." },
  "monthly-summary": { title: "Monthly Contribution Summary", description: "Totals grouped by effective period." },
  "employer-share": { title: "Employer Share Report", description: "Employer contributions per band." },
  "employee-share": { title: "Employee Share Report", description: "Employee contributions per band." },
};

/** Flatten the rate table for the matrix report. */
export function matrixReport(rates: ContributionRate[]) {
  return rates.map((r) => ({
    Type: r.type,
    "Salary From": r.salaryFrom,
    "Salary To": r.salaryTo,
    MSC: r.msc,
    "Employer Share": r.employerShare,
    "Employee Share": r.employeeShare,
    Total: r.total,
    Month: monthLabel(r.effectiveMonth),
    Year: r.effectiveYear,
    Status: r.status,
  }));
}

/** One row per active employee with computed employer/employee/net figures. */
export function employeeReport(employees: Employee[], rates: ContributionRate[]) {
  return employees
    .filter((e) => e.status !== "inactive")
    .map((e) => {
      const monthly = Math.round(e.salary / 12);
      const c: ContributionResult = computeContribution(monthly, rates);
      return {
        Employee: e.name,
        Department: e.department,
        "Basic Salary": monthly,
        "Employer Total": c.totalEmployer,
        "Employee Total": c.totalEmployee,
        "Total Contribution": c.totalContribution,
        "Net Deduction": c.totalEmployee,
        Unmatched: c.unmatched.join(" / ") || "—",
      };
    });
}

interface SummaryRow {
  Period: string;
  Type: ContributionType;
  Bands: number;
  "Employer Total": number;
  "Employee Total": number;
  Total: number;
  [key: string]: string | number;
}

/** Totals grouped by effective period + type. */
export function monthlySummaryReport(rates: ContributionRate[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const r of rates) {
    const key = `${r.effectiveYear}-${r.effectiveMonth}-${r.type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.Bands += 1;
      existing["Employer Total"] += r.employerShare;
      existing["Employee Total"] += r.employeeShare;
      existing.Total += r.total;
    } else {
      groups.set(key, {
        Period: `${monthLabel(r.effectiveMonth)} ${r.effectiveYear}`,
        Type: r.type,
        Bands: 1,
        "Employer Total": r.employerShare,
        "Employee Total": r.employeeShare,
        Total: r.total,
      });
    }
  }
  return Array.from(groups.values());
}

/** Employer-share-only view of every band. */
export function employerShareReport(rates: ContributionRate[]) {
  return rates.map((r) => ({
    Type: r.type,
    "Salary From": r.salaryFrom,
    "Salary To": r.salaryTo,
    "Employer Share": r.employerShare,
    Period: `${monthLabel(r.effectiveMonth)} ${r.effectiveYear}`,
  }));
}

/** Employee-share-only view of every band. */
export function employeeShareReport(rates: ContributionRate[]) {
  return rates.map((r) => ({
    Type: r.type,
    "Salary From": r.salaryFrom,
    "Salary To": r.salaryTo,
    "Employee Share": r.employeeShare,
    Period: `${monthLabel(r.effectiveMonth)} ${r.effectiveYear}`,
  }));
}

export function buildReport(
  kind: ContributionReportKind,
  rates: ContributionRate[],
  employees: Employee[],
): Record<string, unknown>[] {
  switch (kind) {
    case "matrix":
      return matrixReport(rates);
    case "employee":
      return employeeReport(employees, rates);
    case "monthly-summary":
      return monthlySummaryReport(rates);
    case "employer-share":
      return employerShareReport(rates);
    case "employee-share":
      return employeeShareReport(rates);
  }
}

// The printable-HTML/PDF helper now lives alongside downloadCsv in lib/export;
// re-exported here so existing contribution-report imports keep working.
export { printReport } from "@/lib/export";
