/**
 * Filed leave — an employee's actual application for time off, as distinct from
 * the {@link LeaveType} catalogue that says which categories exist.
 *
 * A record covers an inclusive date range and points at a leave type. Its
 * `payRule` is captured at filing time rather than read live off the type: a
 * record is a historical fact, so editing "Vacation Leave" from paid to unpaid
 * next year must not silently re-price leave already taken and paid.
 *
 * WHY THIS MATTERS TO PAYROLL: a biometric import sees no punch on a leave day
 * and would otherwise book it as LWOP, docking pay for approved time off. The
 * attendance parser consults these records so an approved leave day is marked
 * `on-leave` instead of `absent`, and paid leave is excluded from LWOP entirely.
 * Unpaid leave still deducts — that is the point of filing it as unpaid — but it
 * is now traceable to an application rather than looking like an absence.
 *
 * Only **approved** leave suppresses a deduction. Pending and rejected
 * applications are deliberately inert: an employee cannot stop a deduction by
 * filing a request nobody has acted on.
 */
import type { LeavePayRule, LeaveType } from "@/lib/leave";

/**
 * Filing lifecycle. `pending` awaits a decision, `approved` is granted (and is
 * the only status payroll honours), `rejected` was declined, `cancelled` was
 * withdrawn by the employee or HR after filing.
 */
export type LeaveRecordStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_RECORD_STATUSES: LeaveRecordStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

export interface LeaveRecord {
  id: string;
  employeeId: string;
  /** Denormalised for display/search so the table needs no join. */
  employeeName: string;
  /** The {@link LeaveType} this was filed against. */
  leaveTypeId: string;
  /** Type name and code captured at filing time, for stable historical display. */
  leaveTypeName: string;
  leaveTypeCode: string;
  /**
   * Whether these days are compensated. Snapshotted from the type at filing so
   * later edits to the catalogue cannot retroactively re-price taken leave.
   */
  payRule: LeavePayRule;
  /** First day of leave, ISO `YYYY-MM-DD`. */
  startDate: string;
  /** Last day of leave, inclusive, ISO `YYYY-MM-DD`. */
  endDate: string;
  /** Employee's stated reason. Free text, may be empty. */
  reason: string;
  status: LeaveRecordStatus;
  /** Who approved/rejected it, and when. Empty until a decision is made. */
  decidedBy: string;
  decidedAt: string;
  createdAt: string;
}

/** Accent colour per status, for chips/badges. */
export const LEAVE_STATUS_TINT: Record<LeaveRecordStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  cancelled: "bg-muted text-muted-foreground",
};

export const LEAVE_STATUS_LABEL: Record<LeaveRecordStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// ---- Date helpers --------------------------------------------------------

/**
 * Parse an ISO date as **local** midnight, not UTC.
 *
 * `new Date("2026-07-13")` is parsed as UTC per spec, which in a UTC+8 zone
 * (Philippines) reads back as the 13th at 08:00 — and `getDay()` can then land
 * on the wrong weekday near midnight. Building it from parts keeps every
 * comparison in the same local frame the biometric timestamps use.
 */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a Date back to ISO `YYYY-MM-DD` in local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const isWeekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

/**
 * Every calendar date the record spans, inclusive. Returns [] when the range is
 * inverted so a malformed record can never expand into an infinite loop.
 */
export function datesInRecord(record: Pick<LeaveRecord, "startDate" | "endDate">): string[] {
  const start = parseIsoDate(record.startDate);
  const end = parseIsoDate(record.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Working days (Mon–Fri) the record covers. This is the figure that matters for
 * payroll: leave falling on a weekend costs nothing either way, so counting
 * calendar days would overstate a Friday-to-Monday absence as 4 days when only
 * 2 are working days.
 */
export function workingDaysInRecord(
  record: Pick<LeaveRecord, "startDate" | "endDate">,
): number {
  return datesInRecord(record).filter((iso) => isWeekday(parseIsoDate(iso))).length;
}

// ---- Lookup --------------------------------------------------------------

/** One day of approved leave, resolved for a specific employee + date. */
export interface LeaveDay {
  record: LeaveRecord;
  payRule: LeavePayRule;
}

/**
 * Index approved leave by `employeeId|date` for O(1) lookup while walking a
 * biometric file. Only `approved` records are indexed — see the module note on
 * why pending applications must not suppress a deduction.
 *
 * A later record wins on the same day, so correcting a mis-filed leave by
 * approving a replacement behaves predictably.
 */
export function buildLeaveIndex(records: LeaveRecord[]): Map<string, LeaveDay> {
  const index = new Map<string, LeaveDay>();
  for (const record of records) {
    if (record.status !== "approved") continue;
    for (const date of datesInRecord(record)) {
      index.set(`${record.employeeId}|${date}`, { record, payRule: record.payRule });
    }
  }
  return index;
}

/** Approved leave covering this employee on this date, if any. */
export function leaveOn(
  index: Map<string, LeaveDay>,
  employeeId: string,
  date: string,
): LeaveDay | undefined {
  return index.get(`${employeeId}|${date}`);
}

/** Records overlapping a date range, newest first — drives the Leave page list. */
export function recordsInRange(
  records: LeaveRecord[],
  from: string,
  to: string,
): LeaveRecord[] {
  return records
    .filter((r) => r.startDate <= to && from <= r.endDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// ---- Validation ----------------------------------------------------------

export interface LeaveRecordDraft {
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveRecordStatus;
}

export interface LeaveRecordValidation {
  ok: boolean;
  errors: Partial<Record<keyof LeaveRecordDraft | "overlap", string>>;
}

/**
 * Validate a leave application. Enforces an employee, a type, a well-ordered
 * date range, and no overlap with the same employee's existing live leave.
 *
 * Overlap only considers `pending`/`approved` records: a rejected or cancelled
 * application should not block re-filing the same dates. `ignoreId` skips the
 * record being edited so it never clashes with itself.
 */
export function validateLeaveRecord(
  draft: LeaveRecordDraft,
  existing: LeaveRecord[],
  types: LeaveType[],
  ignoreId?: string,
): LeaveRecordValidation {
  const errors: LeaveRecordValidation["errors"] = {};

  if (!draft.employeeId) errors.employeeId = "Employee is required.";
  if (!draft.leaveTypeId) errors.leaveTypeId = "Leave type is required.";
  else if (!types.some((t) => t.id === draft.leaveTypeId)) {
    errors.leaveTypeId = "That leave type no longer exists.";
  }

  if (!draft.startDate) errors.startDate = "Start date is required.";
  if (!draft.endDate) errors.endDate = "End date is required.";
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    errors.endDate = "End date cannot be before the start date.";
  }

  if (draft.startDate && draft.endDate && !errors.endDate) {
    if (workingDaysInRecord(draft) === 0) {
      errors.startDate = "That range covers no working days (Mon–Fri).";
    }
  }

  if (draft.employeeId && draft.startDate && draft.endDate && !errors.endDate) {
    const clash = existing.find(
      (r) =>
        r.id !== ignoreId &&
        r.employeeId === draft.employeeId &&
        (r.status === "approved" || r.status === "pending") &&
        r.startDate <= draft.endDate &&
        draft.startDate <= r.endDate,
    );
    if (clash) {
      errors.overlap =
        `Overlaps existing ${LEAVE_STATUS_LABEL[clash.status].toLowerCase()} ` +
        `${clash.leaveTypeCode} leave (${clash.startDate} to ${clash.endDate}).`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** A blank draft for the "file leave" form, defaulting to today. */
export function emptyLeaveRecordDraft(today: string): LeaveRecordDraft {
  return {
    employeeId: "",
    employeeName: "",
    leaveTypeId: "",
    startDate: today,
    endDate: today,
    reason: "",
    status: "pending",
  };
}

// ---- Aggregation ---------------------------------------------------------

export interface LeaveBalance {
  /** Approved paid working days taken this year. */
  paidDaysTaken: number;
  /** Approved unpaid working days taken this year. */
  unpaidDaysTaken: number;
  /** Entitlement from the type, 0 when unlimited/case-by-case. */
  entitlement: number;
  /** entitlement − paidDaysTaken, floored at 0. Meaningless when entitlement is 0. */
  remaining: number;
}

/**
 * One employee's usage of one leave type in a calendar year. Counts approved
 * records only, by working day, so the figure lines up with what payroll saw.
 */
export function leaveBalance(
  records: LeaveRecord[],
  type: LeaveType,
  employeeId: string,
  year: number,
): LeaveBalance {
  const mine = records.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.leaveTypeId === type.id &&
      r.status === "approved" &&
      parseIsoDate(r.startDate).getFullYear() === year,
  );
  let paidDaysTaken = 0;
  let unpaidDaysTaken = 0;
  for (const r of mine) {
    const days = workingDaysInRecord(r);
    if (r.payRule === "paid") paidDaysTaken += days;
    else unpaidDaysTaken += days;
  }
  return {
    paidDaysTaken,
    unpaidDaysTaken,
    entitlement: type.daysPerYear,
    remaining: Math.max(0, type.daysPerYear - paidDaysTaken),
  };
}

/** Draft values for a new record (id/createdAt/snapshot fields assigned on save). */
export type NewLeaveRecord = Omit<
  LeaveRecord,
  "id" | "createdAt" | "decidedBy" | "decidedAt" | "leaveTypeName" | "leaveTypeCode" | "payRule"
>;
