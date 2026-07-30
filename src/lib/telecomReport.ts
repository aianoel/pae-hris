/**
 * "Telecom Report" — the per-employee daily timekeeping report that mirrors the
 * biometric device export (see `Pae attendance (1).pdf`). For each employee it
 * lists every calendar day in the period with TIME IN / TIME OUT and the derived
 * durations, plus a per-employee summary line.
 *
 * TOTAL OF DUTY = (time out − time in) − 1 hour lunch, in decimal hours. A day
 * with fewer than two punches contributes 0. Late / undertime / deduction /
 * excess require a shift schedule the app doesn't model, so they render as zero
 * (matching the sample, where no schedule was configured).
 */
import type { AttendanceRecord, Employee } from "@/store/types";

/** Paid lunch break deducted from raw duty time, in hours. */
const LUNCH_HOURS = 1;

export interface TelecomDayRow {
  date: string; // ISO YYYY-MM-DD
  timeIn: string; // "H:MM AM" or "" when absent
  timeOut: string;
  late: string; // "HH:MM"
  undertime: string; // "0.00"
  deduction: string; // "0.00"
  excess: string; // "HH:MM" excess after 09:00
  dutyHours: number; // decimal hours
}

export interface TelecomEmployeeReport {
  employeeId: string;
  employeeName: string;
  bioId: string;
  days: TelecomDayRow[];
  totalLate: string; // "HH:MM"
  totalUndertime: string; // "0.00"
  totalDeduction: string; // "0.00"
  totalExcess: string; // "HH:MM"
  totalDuty: number; // sum of dutyHours, decimal
}

/** ISO date → seconds since midnight for an `HH:MM:SS` time string. */
function toSeconds(hms?: string): number | null {
  if (!hms) return null;
  const [h, m, s] = hms.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 3600 + (m || 0) * 60 + (s || 0);
}

/** `HH:MM:SS` (24h) → `H:MM AM/PM` as shown in the device export. */
function to12h(hms?: string): string {
  const sec = toSeconds(hms);
  if (sec == null) return "";
  let h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

/** Enumerate every ISO date in [from, to] inclusive. */
function eachIsoDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Build one Telecom report section per employee from the month's attendance
 * records. `records` should already be scoped to the desired period (e.g. the
 * selected month); the report covers every calendar day between the first and
 * last dated record, so absent days appear as blank rows just like the export.
 */
export function buildTelecomReport(
  records: AttendanceRecord[],
  employees: Employee[] = [],
): TelecomEmployeeReport[] {
  if (records.length === 0) return [];

  const dates = records.map((r) => r.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const allDays = eachIsoDate(from, to);

  // Live employee lookup so name + Bio ID always reflect the current HR record
  // rather than the value snapshotted onto the attendance record at import time.
  const empById = new Map(employees.map((e) => [e.id, e]));

  // Group records by employee.
  const byEmployee = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, []);
    byEmployee.get(r.employeeId)!.push(r);
  }

  const reports: TelecomEmployeeReport[] = [];
  for (const [employeeId, recs] of byEmployee) {
    const first = recs[0];
    const emp = empById.get(employeeId);
    // Prefer the live employee's name/Bio ID; fall back to the record snapshot.
    const employeeName = emp?.name ?? first.employeeName;
    const bioId = emp?.bioId ?? first.bioId ?? "—";
    const byDate = new Map(recs.map((r) => [r.date, r]));

    let totalDuty = 0;
    const days: TelecomDayRow[] = allDays.map((date) => {
      const rec = byDate.get(date);
      const inSec = toSeconds(rec?.timeIn);
      const outSec = toSeconds(rec?.timeOut);
      let dutyHours = 0;
      if (inSec != null && outSec != null && outSec > inSec) {
        dutyHours = Math.max(0, (outSec - inSec) / 3600 - LUNCH_HOURS);
        dutyHours = Math.round(dutyHours * 100) / 100;
      }
      totalDuty += dutyHours;
      return {
        date,
        timeIn: to12h(rec?.timeIn),
        timeOut: to12h(rec?.timeOut),
        late: "00:00",
        undertime: "0.00",
        deduction: "0.00",
        excess: "00:00",
        dutyHours,
      };
    });

    reports.push({
      employeeId,
      employeeName,
      bioId,
      days,
      totalLate: "00:00",
      totalUndertime: "0.00",
      totalDeduction: "0.00",
      totalExcess: "00:00",
      totalDuty: Math.round(totalDuty * 100) / 100,
    });
  }

  reports.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return reports;
}

const COLS = [
  "DATE",
  "TIME IN",
  "TIME OUT",
  "LATE",
  "UNDERTIME",
  "TOTAL FOR DEDUCTION",
  "EXCESS TIME AFTER 09:00",
  "TOTAL OF DUTY",
];

/**
 * Open a print window rendering the Telecom Report in the device-export layout:
 * a title, then one block per employee (summary line + daily table). Returns
 * false if the popup was blocked.
 */
export function printTelecomReport(
  reports: TelecomEmployeeReport[],
  opts?: { subtitle?: string },
): boolean {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const duty = (n: number) => n.toFixed(2);

  const blocks = reports
    .map((r) => {
      const summary = `
        <table class="summary"><thead><tr>
          <th>EMPLOYEE</th><th>BIO ID</th><th>TOTAL LATE</th><th>TOTAL UNDERTIME</th>
          <th>TOTAL FOR DEDUCTION</th><th>EXCESS TIME AFTER 09:00</th><th>TOTAL OF DUTY</th>
        </tr></thead><tbody><tr>
          <td class="name">${esc(r.employeeName)}</td><td>${esc(r.bioId)}</td>
          <td>${r.totalLate}</td><td>${r.totalUndertime}</td><td>${r.totalDeduction}</td>
          <td>${r.totalExcess}</td><td class="duty">${duty(r.totalDuty)}</td>
        </tr></tbody></table>`;

      const rows = r.days
        .map(
          (d) => `<tr>
            <td>${esc(d.date)}</td><td>${esc(d.timeIn)}</td><td>${esc(d.timeOut)}</td>
            <td>${d.late}</td><td>${d.undertime}</td><td>${d.deduction}</td>
            <td>${d.excess}</td><td class="duty">${duty(d.dutyHours)}</td>
          </tr>`,
        )
        .join("");

      const daily = `
        <table class="daily"><thead><tr>${COLS.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table>`;

      return `<section class="employee">${summary}${daily}</section>`;
    })
    .join("");

  const meta = [opts?.subtitle, `${new Date().toLocaleDateString()}`, `${reports.length} employees`]
    .filter(Boolean)
    .join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Telecom Report</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:28px}
      h1{font-size:18px;margin:0 0 2px}
      p.meta{color:#64748b;margin:0 0 18px;font-size:12px}
      section.employee{margin:0 0 22px}
      section.employee{break-inside:avoid}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #e2e8f0;padding:4px 8px;text-align:left;white-space:nowrap}
      th{background:#f1f5f9;text-transform:uppercase;font-size:9px;letter-spacing:.03em;color:#475569}
      table.summary{margin-bottom:6px}
      table.summary th{background:#e2e8f0}
      table.summary td{font-weight:600;background:#f8fafc}
      table.summary td.name{color:#0f172a}
      td.duty{text-align:right;font-variant-numeric:tabular-nums}
      table.daily tbody tr:nth-child(even) td{background:#f8fafc}
      @page{size:landscape;margin:14mm}
    </style></head><body>
    <h1>PECO, Administrator | Telecom Report</h1>
    <p class="meta">${esc(meta)}</p>
    ${blocks}
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
