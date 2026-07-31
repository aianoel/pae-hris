/**
 * Tardiness → LWOP conversion for biometric attendance imports.
 *
 * COMPANY RULE: the shift starts at 09:00. An employee whose first punch of the
 * day is later than that has the time they missed deducted as leave-without-pay,
 * pro-rated against the 8-hour day — punching 09:30 costs half an hour (0.0625
 * of a day), punching 13:00 costs four hours (0.5 of a day). There is no grace
 * period: 09:00:01 is late.
 *
 * WHY PRO-RATA RATHER THAN A HALF-DAY PENALTY: pro-rata is proportionate and
 * self-explaining on a payslip — the deduction always equals the hourly rate ×
 * hours missed. A flat half-day rule would charge someone four hours' pay for
 * being sixty seconds late.
 *
 * Fractional days are deliberate. `lwopDays` was whole-day-only when it came
 * purely from missed days; tardiness makes fractions unavoidable, and the LWOP
 * amount is `dailyRate × days`, which handles fractions correctly. Only the
 * final peso figure is rounded, so a month of small delays accumulates exactly
 * rather than each day rounding away to zero.
 */

/** Shift start, in seconds since local midnight (09:00:00). */
export const SHIFT_START_SEC = 9 * 3600;

/**
 * Grace period in seconds before a late punch counts. Zero per the company rule
 * — named rather than inlined so the policy is visible and adjustable in one
 * place instead of being buried in a comparison.
 */
export const GRACE_SEC = 0;

/** Standard paid hours in a working day — the denominator for pro-rating. */
export const HOURS_PER_DAY = 8;

/** Seconds in a standard working day. */
const WORK_DAY_SEC = HOURS_PER_DAY * 3600;

/**
 * Seconds an employee was late, given their first punch of the day. Zero when
 * they arrived on time or within the grace period.
 */
export function latenessSeconds(firstPunchSec: number): number {
  const cutoff = SHIFT_START_SEC + GRACE_SEC;
  return firstPunchSec > cutoff ? firstPunchSec - cutoff : 0;
}

/**
 * Fraction of a working day lost to arriving late, in [0, 1].
 *
 * Capped at a whole day: a punch at 18:00 is 9 hours past the shift start, but
 * an employee cannot lose more than the one day's pay they were due — an
 * uncapped figure would deduct more than the day is worth.
 */
export function lateDayFraction(firstPunchSec: number): number {
  const late = latenessSeconds(firstPunchSec);
  if (late <= 0) return 0;
  return Math.min(1, late / WORK_DAY_SEC);
}

/** Whether this punch counts as late under the rule. */
export const isLate = (firstPunchSec: number) => latenessSeconds(firstPunchSec) > 0;

/** Parse `HH:MM:SS` (or `HH:MM`) to seconds since midnight; NaN-safe → 0. */
export function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  const [h, m, s] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  if ([h, m, s].some((n) => Number.isNaN(n))) return 0;
  return h * 3600 + m * 60 + s;
}

/** Format a lateness duration for display, e.g. "1h 25m" or "18m". */
export function formatLateness(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Round a day count to 4 dp — enough for per-second lateness, no float noise. */
export const roundDays = (days: number) => Math.round(days * 10000) / 10000;
