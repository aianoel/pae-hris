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
 *   • one attendance record per employee per weekday (present if they punched,
 *     absent otherwise);
 *   • LWOP days  = working days (Mon–Fri) in range with no punch;
 *   • LWOP amount = daily rate × LWOP days, daily rate = (Monthly × 12) / 261.
 */
import type { Employee, AttendanceState } from "@/store/types";
import { dailyRateFromMonthly } from "@/lib/payroll";

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
  lwopDays: number;
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

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const isWorkingDay = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5; // Mon–Fri

/** Earliest / latest punch time (seconds since midnight + "HH:MM:SS") per day. */
interface DayPunch {
  firstSec: number;
  lastSec: number;
  firstStr: string;
  lastStr: string;
}

export function parseAttendanceText(text: string, employees: Employee[]): ParseResult {
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

  const records: ParsedAttendance[] = [];
  const lwop: LwopResult[] = [];
  const unmatchedBioIds: string[] = [];

  for (const [bioId, dates] of punches) {
    const emp = byBio.get(bioId);
    if (!emp) {
      unmatchedBioIds.push(bioId);
      continue;
    }

    // Attendance: one record per working day in range (present / absent).
    for (const d of workingDates) {
      const punch = dates.get(isoDate(d));
      records.push({
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        date: isoDate(d),
        day: SHORT_DAY[d.getDay()],
        state: punch ? "present" : "absent",
        bioId,
        timeIn: punch?.firstStr,
        // Only surface a time-out when there's a distinct later punch.
        timeOut: punch && punch.lastSec !== punch.firstSec ? punch.lastStr : undefined,
      });
    }

    const presentWorking = workingDates.filter((d) => dates.has(isoDate(d))).length;
    const lwopDays = workingDates.length - presentWorking;
    const monthly = Math.round(emp.salary / 12);
    lwop.push({
      employeeId: emp.id,
      employeeName: emp.name,
      bioId,
      monthly,
      presentDays: presentWorking,
      lwopDays,
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
