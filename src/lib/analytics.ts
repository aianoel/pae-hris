/**
 * Analytics aggregations.
 *
 * Every function here is pure: it takes store collections and returns chart-
 * ready rows. Keeping the maths out of the components means the Analytics page
 * is a thin renderer, and these can be unit-tested without mounting React.
 *
 * The charts previously read fixed arrays from `src/lib/data.ts`, which are now
 * empty — so they drew nothing. These derive the same shapes from live records.
 */
import type { AttendanceRecord, Department, Employee, LogEntry, PayrollRun } from "@/store/types";

/** Chart palette, matching the `--chart-*` tokens and the store's deptColors. */
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

/** `YYYY-MM` key for grouping, in local time (dates here are calendar dates). */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Short month label, e.g. "Mar" — or "Mar '25" when the year is ambiguous. */
function monthLabel(d: Date, withYear: boolean): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  return withYear ? `${m} '${String(d.getFullYear()).slice(2)}` : m;
}

/**
 * The last `count` months ending with the month containing `now`, oldest first.
 * Returned as both a grouping key and a display label; the label carries a year
 * suffix when the window straddles a year boundary, so two different "Jan"s
 * can't collide visually.
 */
export function recentMonths(
  count: number,
  now: Date = new Date(),
): { key: string; label: string }[] {
  const spansYears = count > 12 || now.getMonth() + 1 < count;
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: monthLabel(d, spansYears) });
  }
  return out;
}

export interface GrowthPoint {
  month: string;
  hired: number;
  left: number;
  headcount: number;
}

/**
 * Hires per month over the trailing window, with a running headcount.
 *
 * `left` is always 0: the Employee record has no termination date, so a
 * departure leaves no dated event to count — an inactive employee's `joined`
 * date says when they arrived, not when they went. Rather than invent a number,
 * the series reports it as zero and the page hides the "Left" band when nothing
 * is recorded. Add an exit date to `Employee` to make this meaningful.
 *
 * `headcount` is cumulative: everyone hired on or before the end of each month
 * (excluding inactive staff, who are no longer on the books).
 */
export function employeeGrowthFrom(
  employees: Employee[],
  months = 12,
  now: Date = new Date(),
): GrowthPoint[] {
  const window = recentMonths(months, now);
  const hiresByMonth = new Map<string, number>();

  for (const e of employees) {
    const d = new Date(e.joined);
    if (Number.isNaN(d.getTime())) continue;
    const k = monthKey(d);
    hiresByMonth.set(k, (hiresByMonth.get(k) ?? 0) + 1);
  }

  // Everyone already on staff before the window opens forms the opening balance.
  const firstKey = window[0]?.key ?? "";
  const onBooks = employees.filter((e) => e.status !== "inactive");
  let running = onBooks.filter((e) => {
    const d = new Date(e.joined);
    return !Number.isNaN(d.getTime()) && monthKey(d) < firstKey;
  }).length;

  return window.map(({ key, label }) => {
    const hired = hiresByMonth.get(key) ?? 0;
    const activeHired = onBooks.filter((e) => {
      const d = new Date(e.joined);
      return !Number.isNaN(d.getTime()) && monthKey(d) === key;
    }).length;
    running += activeHired;
    return { month: label, hired, left: 0, headcount: running };
  });
}

export interface DepartmentSlice {
  name: string;
  value: number;
  color: string;
}

/**
 * Headcount per department for the donut. Departments are the source of truth
 * for naming and colour; any employee whose department no longer exists is
 * collected under "Unassigned" so the total always equals real headcount.
 * Empty departments are dropped — a zero-width slice is just legend noise.
 */
export function departmentDistributionFrom(
  employees: Employee[],
  departments: Department[],
): DepartmentSlice[] {
  const counts = new Map<string, number>();
  const known = new Set(departments.map((d) => d.name));

  for (const e of employees) {
    if (e.status === "inactive") continue;
    const name = known.has(e.department) ? e.department : "Unassigned";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const slices = departments
    .filter((d) => (counts.get(d.name) ?? 0) > 0)
    .map((d, i) => ({
      name: d.name,
      value: counts.get(d.name) ?? 0,
      color: d.color || CHART_COLORS[i % CHART_COLORS.length],
    }));

  const unassigned = counts.get("Unassigned") ?? 0;
  if (unassigned > 0) {
    slices.push({
      name: "Unassigned",
      value: unassigned,
      color: "hsl(var(--muted-foreground))",
    });
  }

  return slices.sort((a, b) => b.value - a.value);
}

export interface AttendancePoint {
  day: string;
  present: number;
  remote: number;
  absent: number;
  onLeave: number;
}

/**
 * Attendance totals per weekday (Mon–Sun) across all loaded records.
 *
 * `on-leave` is tracked separately from `absent` deliberately — the domain
 * treats an approved leave day as accounted for, not as an unexplained absence
 * (see the AttendanceState docs), and merging them here would misreport it.
 */
export function attendanceByWeekdayFrom(records: AttendanceRecord[]): AttendancePoint[] {
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rows = new Map<string, AttendancePoint>(
    order.map((day) => [day, { day, present: 0, remote: 0, absent: 0, onLeave: 0 }]),
  );

  for (const r of records) {
    const row = rows.get(r.day);
    if (!row) continue;
    if (r.state === "present") row.present++;
    else if (r.state === "remote") row.remote++;
    else if (r.state === "absent") row.absent++;
    else if (r.state === "on-leave") row.onLeave++;
  }

  // Weekends only clutter the axis when nobody ever works them.
  const result = order.map((d) => rows.get(d)!);
  const weekdayOnly = result.slice(0, 5);
  const weekendUsed = result
    .slice(5)
    .some((r) => r.present + r.remote + r.absent + r.onLeave > 0);
  return weekendUsed ? result : weekdayOnly;
}

export interface PayrollPoint {
  month: string;
  cost: number;
}

/**
 * Total gross payroll per month over the trailing window, in millions of PHP
 * (the chart's axis is labelled ₱M). Runs are grouped by their creation month;
 * several agency-scoped runs in one period sum into a single point.
 */
export function payrollTrendFrom(
  runs: PayrollRun[],
  months = 12,
  now: Date = new Date(),
): PayrollPoint[] {
  const window = recentMonths(months, now);
  const byMonth = new Map<string, number>();

  for (const r of runs) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const k = monthKey(d);
    byMonth.set(k, (byMonth.get(k) ?? 0) + (Number(r.gross) || 0));
  }

  return window.map(({ key, label }) => ({
    month: label,
    cost: (byMonth.get(key) ?? 0) / 1_000_000,
  }));
}

export interface LoginPoint {
  hour: string;
  logins: number;
}

/**
 * Successful sign-ins bucketed by hour of day, read from the audit log.
 *
 * Only entries whose action starts with "signed in" count — the auth log also
 * records failures and sign-outs, and counting those would overstate activity.
 */
export function loginActivityFrom(logs: LogEntry[]): LoginPoint[] {
  const buckets = new Array<number>(24).fill(0);
  let any = false;

  for (const l of logs) {
    if (l.type !== "auth") continue;
    if (!l.action.toLowerCase().startsWith("signed in")) continue;
    const d = new Date(l.time);
    if (Number.isNaN(d.getTime())) continue;
    buckets[d.getHours()]++;
    any = true;
  }

  if (!any) return [];

  // Trim to the active span so an all-night office doesn't get 24 empty bars,
  // but keep interior quiet hours to preserve the shape of the day.
  const first = buckets.findIndex((n) => n > 0);
  const last = buckets.length - 1 - [...buckets].reverse().findIndex((n) => n > 0);
  return buckets
    .slice(first, last + 1)
    .map((logins, i) => ({ hour: String(first + i), logins }));
}

export interface HeadlineStats {
  headcount: number;
  activePct: number;
  /** Median tenure of on-book staff, in months. */
  medianTenureMonths: number;
  /** Attendance rate: present+remote as a share of all recorded days. */
  attendanceRate: number;
  /** Total gross across every payroll run in the window, in PHP. */
  payrollTotal: number;
}

/** Headline figures for the stat strip. All derived, none invented. */
export function headlineStatsFrom(
  employees: Employee[],
  attendance: AttendanceRecord[],
  runs: PayrollRun[],
  now: Date = new Date(),
): HeadlineStats {
  const onBooks = employees.filter((e) => e.status !== "inactive");
  const active = employees.filter((e) => e.status === "active").length;

  const tenures = onBooks
    .map((e) => {
      const d = new Date(e.joined);
      if (Number.isNaN(d.getTime()) || d > now) return null;
      return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  const mid = Math.floor(tenures.length / 2);
  const medianTenureMonths = tenures.length
    ? tenures.length % 2 === 0
      ? Math.round((tenures[mid - 1] + tenures[mid]) / 2)
      : tenures[mid]
    : 0;

  const counted = attendance.filter((r) => r.state !== "on-leave").length;
  const attended = attendance.filter(
    (r) => r.state === "present" || r.state === "remote",
  ).length;

  return {
    headcount: onBooks.length,
    activePct: employees.length ? Math.round((active / employees.length) * 100) : 0,
    medianTenureMonths,
    attendanceRate: counted ? Math.round((attended / counted) * 100) : 0,
    payrollTotal: runs.reduce((s, r) => s + (Number(r.gross) || 0), 0),
  };
}
