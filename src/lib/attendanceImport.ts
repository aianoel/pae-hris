/**
 * Parse a biometric / timekeeping device export (e.g. ZKTeco) into attendance
 * records and per-employee leave-without-pay (LWOP).
 *
 * The device log is one punch per line, tab- or space-delimited, where the
 * first field is the Bio ID and somewhere on the line is a timestamp
 * `YYYY-MM-DD HH:MM:SS`. Other columns (verify mode, in/out flag, work code)
 * are ignored — a punch on a day simply means the employee was present.
 *
 *     10256   2026-07-13 06:30:25   1   1   10256   I   0
 *
 * From the punches we derive, over the file's date range:
 *   • one attendance record per employee per weekday (present, on-leave when
 *     covered by approved leave, absent otherwise);
 *   • LWOP days, from three sources:
 *       – whole days with no punch and no approved leave (unexplained absence);
 *       – whole days of approved **unpaid** leave (filed as unpaid, so it
 *         deducts — but traceably, rather than looking like an absence);
 *       – **fractions** of a day lost to arriving after the 09:00 shift start,
 *         pro-rated against the 8-hour day (see lib/tardiness.ts);
 *   • LWOP amount = daily rate × LWOP days, daily rate = (Monthly × 12) / 261.
 *
 * Approved **paid** leave is excluded from LWOP entirely: that is the whole
 * point of filing it. A day of approved leave also never accrues a tardiness
 * charge — the employee was not expected in, so there is no shift to be late
 * for, and a stray punch on a leave day (dropping by the office) must not
 * become a deduction.
 */
import type { Employee, AttendanceState } from "@/store/types";
import { dailyRateFromMonthly } from "@/lib/payroll";
import {
  lateDayFraction,
  latenessSeconds,
  roundDays,
  SHIFT_START_SEC,
} from "@/lib/tardiness";
import {
  buildLeaveIndex,
  leaveOn,
  type LeaveDay,
  type LeaveRecord,
} from "@/lib/leaveRecords";

/** A resolved attendance record ready to upsert into the store. */
export interface ParsedAttendance {
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // calendar day, ISO "YYYY-MM-DD"
  day: string; // normalised short weekday, e.g. "Mon"
  state: AttendanceState;
  bioId: string;
  timeIn?: string; // earliest punch of the day, "HH:MM:SS"
  timeOut?: string; // latest punch of the day, "HH:MM:SS" (omitted if only one punch)
}

/** Per-employee LWOP computed from the punches. */
export interface LwopResult {
  employeeId: string;
  employeeName: string;
  bioId: string;
  monthly: number;
  presentDays: number;
  /**
   * Total LWOP days charged: unexplained absences + unpaid-leave days +
   * the pro-rated fractions from late arrivals. Fractional by design.
   */
  lwopDays: number;
  /** Whole days with no punch and no approved leave. */
  absentDays: number;
  /** Whole days of approved unpaid leave (deducts, but explained). */
  unpaidLeaveDays: number;
  /** Whole days of approved paid leave — excluded from LWOP. */
  paidLeaveDays: number;
  /** Days lost to arriving after 09:00, summed as fractions of a day. */
  tardyDays: number;
  /** How many days had a late first punch (headline count, not a duration). */
  lateCount: number;
  /** Total seconds late across the period, for reporting. */
  lateSeconds: number;
  amount: number; // PHP, rounded to 2 decimals
}

export interface ParseResult {
  records: ParsedAttendance[];
  lwop: LwopResult[];
  /** Distinct bio IDs in the file that matched no employee. */
  unmatchedBioIds: string[];
  /** Problems, one per rejected line (with line numbers). */
  errors: string[];
  /** Inclusive date range covered by the file (ISO dates), if any. */
  range: { from: string; to: string } | null;
  /** Working days (Mon–Fri) in the range. */
  workingDays: number;
}

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TS_RE = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

/** Enumerate ISO dates from `from` to `to` inclusive. */
function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(from);
  while (d <= to) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Format a Date as ISO `YYYY-MM-DD` in **local** time.
 *
 * Not `toISOString()`: that converts to UTC first, so in UTC+8 (Philippines) a
 * local midnight reads back as the *previous* day — which would shift every
 * attendance record and mis-align it against a leave record's dates.
 */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const isWorkingDay = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5; // Mon–Fri

/** Earliest / latest punch time (seconds since midnight + "HH:MM:SS") per day. */
interface DayPunch {
  firstSec: number;
  lastSec: number;
  firstStr: string;
  lastStr: string;
}

/**
 * Parse a device log into attendance records and LWOP.
 *
 * `leaveRecords` are the filed leave applications; approved ones suppress the
 * deduction a missing punch would otherwise cause. Omit them and every
 * punch-less working day is charged as an unexplained absence, which is the
 * correct behaviour for a workspace that isn't tracking leave yet.
 */
export function parseAttendanceText(
  text: string,
  employees: Employee[],
  leaveRecords: LeaveRecord[] = [],
): ParseResult {
  const errors: string[] = [];
  // bioId -> (ISO date -> first/last punch of that day)
  const punches = new Map<string, Map<string, DayPunch>>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const bioId = line.split(/[\s,;]+/)[0]?.trim();
    const ts = line.match(TS_RE);
    if (!bioId || !ts) {
      errors.push(`Line ${i + 1}: could not read a Bio ID and timestamp — "${line}".`);
      return;
    }

    const [, y, mo, da, hh, mi, ss] = ts;
    const iso = `${y}-${mo}-${da}`;
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      errors.push(`Line ${i + 1}: invalid date "${iso}".`);
      return;
    }

    const h = Number(hh);
    const m = Number(mi);
    const s = ss ? Number(ss) : 0;
    const sec = h * 3600 + m * 60 + s;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    if (!punches.has(bioId)) punches.set(bioId, new Map());
    const byDay = punches.get(bioId)!;
    const existing = byDay.get(iso);
    if (!existing) {
      byDay.set(iso, { firstSec: sec, lastSec: sec, firstStr: timeStr, lastStr: timeStr });
    } else {
      if (sec < existing.firstSec) {
        existing.firstSec = sec;
        existing.firstStr = timeStr;
      }
      if (sec > existing.lastSec) {
        existing.lastSec = sec;
        existing.lastStr = timeStr;
      }
    }
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  });

  const range = minDate && maxDate ? { from: isoDate(minDate), to: isoDate(maxDate) } : null;
  const allDates = minDate && maxDate ? eachDate(minDate, maxDate) : [];
  const workingDates = allDates.filter(isWorkingDay);

  // Resolve each punched Bio ID to an employee.
  const byBio = new Map(employees.filter((e) => e.bioId).map((e) => [e.bioId as string, e]));
  // Approved leave, indexed by `employeeId|date` for O(1) lookup per day.
  const leaveIndex = buildLeaveIndex(leaveRecords);

  const records: ParsedAttendance[] = [];
  const lwop: LwopResult[] = [];
  const unmatchedBioIds: string[] = [];

  for (const [bioId, dates] of punches) {
    const emp = byBio.get(bioId);
    if (!emp) {
      unmatchedBioIds.push(bioId);
      continue;
    }

    let presentDays = 0;
    let absentDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let tardyDays = 0;
    let lateCount = 0;
    let lateSeconds = 0;

    // Attendance: one record per working day in range.
    for (const d of workingDates) {
      const iso = isoDate(d);
      const punch = dates.get(iso);
      const leave: LeaveDay | undefined = leaveOn(leaveIndex, emp.id, iso);

      // Approved leave wins over the punch data: the day is accounted for, so it
      // is neither an absence nor a tardiness event. Paid leave costs nothing;
      // unpaid leave deducts a whole day, which is what filing it as unpaid means.
      if (leave) {
        if (leave.payRule === "paid") paidLeaveDays += 1;
        else unpaidLeaveDays += 1;
      } else if (punch) {
        presentDays += 1;
        // Late arrival: charge the time missed, pro-rated against the 8-hour day.
        const late = latenessSeconds(punch.firstSec);
        if (late > 0) {
          lateCount += 1;
          lateSeconds += late;
          tardyDays += lateDayFraction(punch.firstSec);
        }
      } else {
        absentDays += 1;
      }

      const state: AttendanceState = leave ? "on-leave" : punch ? "present" : "absent";
      records.push({
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        date: iso,
        day: SHORT_DAY[d.getDay()],
        state,
        bioId,
        timeIn: punch?.firstStr,
        // Only surface a time-out when there's a distinct later punch.
        timeOut: punch && punch.lastSec !== punch.firstSec ? punch.lastStr : undefined,
      });
    }

    // Fractions are kept to 4 dp so a month of small delays accumulates exactly
    // instead of each day rounding away to zero; only the peso figure rounds.
    const lwopDays = roundDays(absentDays + unpaidLeaveDays + tardyDays);
    const monthly = Math.round(emp.salary / 12);
    lwop.push({
      employeeId: emp.id,
      employeeName: emp.name,
      bioId,
      monthly,
      presentDays,
      lwopDays,
      absentDays,
      unpaidLeaveDays,
      paidLeaveDays,
      tardyDays: roundDays(tardyDays),
      lateCount,
      lateSeconds,
      amount: Math.round(dailyRateFromMonthly(monthly) * lwopDays * 100) / 100,
    });
  }

  lwop.sort((a, b) => b.lwopDays - a.lwopDays || a.employeeName.localeCompare(b.employeeName));

  return {
    records,
    lwop,
    unmatchedBioIds,
    errors,
    range,
    workingDays: workingDates.length,
  };
}

/** Re-exported so consumers can label the shift-start rule without a second import. */
export { SHIFT_START_SEC };
