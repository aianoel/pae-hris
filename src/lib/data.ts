/**
 * Static mock data powering the dashboard. In a real app this would come from
 * an API via React Query; here it's deterministic so the UI is stable.
 */

export interface Kpi {
  id: string;
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  deltaPct: number;
  trend: "up" | "down";
  spark: number[];
  icon: string; // lucide icon name key
  accent: string; // tailwind text color class
}

// Dashboard/analytics mock data — cleared to start from an empty workspace.
// The "employees" KPI value is overridden live from the store on the Dashboard.
export const kpis: Kpi[] = [];

export const employeeGrowth: { month: string; hired: number; left: number }[] = [];

export const attendanceData: { day: string; present: number; remote: number; absent: number }[] = [];

export const payrollTrend: { month: string; cost: number }[] = [];

export const departmentDistribution: { name: string; value: number; color: string }[] = [];

export const loginActivity: { hour: string; logins: number }[] = [];

export interface Activity {
  id: string;
  type: "login" | "employee" | "payroll" | "attendance" | "leave" | "system";
  actor: string;
  message: string;
  time: string;
}

export const activities: Activity[] = [];

export type EmployeeStatus = "active" | "on-leave" | "inactive";

/** Employment classification (tenure track). Shared with payroll. */
export type EmployeeType = "Regular" | "Probationary" | "Contractual" | "Part-time";

/** Payroll rate class / salary band. Matches the payclass scope in the payroll
 *  register reports (see RegisterReport). */
export type PayClass = "Tier 1" | "Tier 2" | "Tier 3" | "Executive";

/**
 * Human-readable tenure ("length of service") from a joined date to now, e.g.
 * "3 yrs 2 mos". Returns "—" for a missing/invalid date and "New" for < 1 month.
 */
export function tenureFrom(joined: string | undefined, now: Date = new Date()): string {
  if (!joined) return "—";
  const start = new Date(joined);
  if (Number.isNaN(start.getTime()) || start > now) return "—";
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1; // not yet a full month into the current one
  if (months < 1) return "New";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rem) parts.push(`${rem} mo${rem > 1 ? "s" : ""}`);
  return parts.join(" ");
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: EmployeeStatus;
  /** Employment classification (Regular, Probationary, …). Defaults to Regular. */
  employmentType?: EmployeeType;
  /** Payroll rate class / salary band. Defaults to Tier 1. */
  payClass?: PayClass;
  location: string;
  joined: string;
  salary: number;
  /** Manpower / staffing agency this employee is engaged through (optional;
   *  registered under Settings → Agencies). Empty for direct hires. */
  agency?: string;
  /** Biometric / timekeeping device enrollment ID (fingerprint scanner). */
  bioId?: string;
  /** Optional profile photo as a data URL (no backend — images are inlined). */
  avatar?: string;
}

// Employee records live in the app store, seeded from this list. Cleared to
// start from an empty workspace — add employees through the UI.
export const employees: Employee[] = [];
