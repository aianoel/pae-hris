/**
 * Employee self-service: resolving the signed-in user to their own records.
 *
 * Every helper here answers the same question from a different angle — "which
 * rows belong to *this* person?" — and each filters by employee id rather than
 * by name, so a duplicate or changed display name can never leak another
 * person's payslip into someone's view.
 *
 * SCOPE IS NOT SECURITY. These are client-side filters over data the store has
 * already loaded, which makes them a presentation concern, not an authorization
 * boundary. The real guarantee has to come from Supabase Row Level Security, so
 * a curious user opening devtools sees only their own rows in the first place.
 */
import type { AttendanceRecord, Employee } from "@/store/types";
import type { LeaveRecord } from "@/lib/leaveRecords";

/**
 * Find the employee record for a signed-in user.
 *
 * Matched on email because that is the only field the auth identity and the
 * employee roster reliably share — `AuthUser.id` is a Supabase Auth uid, which
 * has no relationship to `Employee.id`. Comparison is trimmed and lowercased:
 * providers hand back addresses in whatever case the user typed at signup, and
 * "A@x.com" is the same mailbox as "a@x.com".
 *
 * Returns null when no roster row matches — an account can legitimately exist
 * without being an employee (an external auditor, a service account), and the
 * page must say so rather than guess.
 */
export function employeeForEmail(
  employees: Employee[],
  email: string | undefined,
): Employee | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return (
    employees.find((e) => e.email.trim().toLowerCase() === normalized) ?? null
  );
}

/** This employee's attendance, newest day first. */
export function attendanceForEmployee(
  attendance: AttendanceRecord[],
  employeeId: string,
): AttendanceRecord[] {
  return attendance
    .filter((a) => a.employeeId === employeeId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** This employee's filed leave, newest filing first. */
export function leaveForEmployee(
  records: LeaveRecord[],
  employeeId: string,
): LeaveRecord[] {
  return records
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Attendance tallied by outcome, for the summary tiles. */
export interface AttendanceSummary {
  present: number;
  remote: number;
  absent: number;
  onLeave: number;
  /** Days with any record at all — the denominator for `rate`. */
  total: number;
  /**
   * Share of recorded days actually worked, 0–100, rounded.
   *
   * Leave days are excluded from the denominator, not counted as misses:
   * approved time off is accounted for, so penalising it here would contradict
   * how payroll already treats it (see lib/leaveRecords.ts). A month that is
   * entirely leave has no worked-day denominator, so the rate is 0.
   */
  rate: number;
}

export function summariseAttendance(records: AttendanceRecord[]): AttendanceSummary {
  const present = records.filter((r) => r.state === "present").length;
  const remote = records.filter((r) => r.state === "remote").length;
  const absent = records.filter((r) => r.state === "absent").length;
  const onLeave = records.filter((r) => r.state === "on-leave").length;

  const workable = present + remote + absent;
  return {
    present,
    remote,
    absent,
    onLeave,
    total: records.length,
    rate: workable === 0 ? 0 : Math.round(((present + remote) / workable) * 100),
  };
}

/** Filter attendance to a single `YYYY-MM` month. */
export function attendanceInMonth(
  records: AttendanceRecord[],
  monthKey: string,
): AttendanceRecord[] {
  return records.filter((r) => r.date.startsWith(monthKey));
}

/**
 * Distinct `YYYY-MM` keys present in a set of records, newest first — drives
 * the month picker so it only ever offers months that have data.
 */
export function monthsWithAttendance(records: AttendanceRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    if (r.date.length >= 7) seen.add(r.date.slice(0, 7));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

/** Render a `YYYY-MM` key as "July 2026". */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const index = Number(month) - 1;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return names[index] ? `${names[index]} ${year}` : monthKey;
}

/** Days of leave taken this calendar year, counting approved records only. */
export function approvedLeaveDaysThisYear(
  records: LeaveRecord[],
  year: number,
  workingDays: (r: Pick<LeaveRecord, "startDate" | "endDate">) => number,
): number {
  return records
    .filter((r) => r.status === "approved" && r.startDate.startsWith(String(year)))
    .reduce((sum, r) => sum + workingDays(r), 0);
}
