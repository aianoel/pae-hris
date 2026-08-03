import * as React from "react";
import { Upload, Printer, ChevronDown, Search, X, Pencil } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { AttendanceUploadDialog } from "@/components/attendance/AttendanceUploadDialog";
import {
  AttendanceEditDialog,
  type AttendanceEditTarget,
} from "@/components/attendance/AttendanceEditDialog";
import { buildTelecomReport, printTelecomReport } from "@/lib/telecomReport";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `YYYY-MM` → "July 2026". */
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
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

export function AttendancePage() {
  const { attendance, employees } = useStore();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  // The day being corrected by hand, or null when the editor is closed.
  const [editing, setEditing] = React.useState<AttendanceEditTarget | null>(null);

  // Distinct months present in the data (YYYY-MM), newest first.
  const months = React.useMemo(() => {
    const set = new Set(attendance.map((a) => a.date?.slice(0, 7)).filter(Boolean) as string[]);
    return [...set].sort().reverse();
  }, [attendance]);

  const [month, setMonth] = React.useState<string>("");
  React.useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const monthRecords = React.useMemo(
    () => attendance.filter((a) => a.date?.startsWith(month)),
    [attendance, month],
  );

  const allReports = React.useMemo(
    () => buildTelecomReport(monthRecords, employees),
    [monthRecords, employees],
  );

  // Filter report cards by employee name or Bio ID.
  const [query, setQuery] = React.useState("");
  const reports = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allReports;
    return allReports.filter(
      (r) => r.employeeName.toLowerCase().includes(q) || r.bioId.toLowerCase().includes(q),
    );
  }, [allReports, query]);

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  // `employeeId|date` → stored record. The report renders every calendar day in
  // the period, so a clicked row may have no record behind it — the editor then
  // creates one.
  const recordByDay = React.useMemo(
    () => new Map(attendance.map((a) => [`${a.employeeId}|${a.date}`, a])),
    [attendance],
  );

  const editDay = (employeeId: string, employeeName: string, date: string) =>
    setEditing({
      employeeId,
      employeeName,
      date,
      record: recordByDay.get(`${employeeId}|${date}`),
    });

  const onPrint = () => {
    const ok = printTelecomReport(reports, { subtitle: month ? monthLabel(month) : undefined });
    if (!ok) {
      toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print the report." });
    }
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Telecom Report — daily time in/out and total duty per employee."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={onPrint} disabled={reports.length === 0}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="lg" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" /> Upload attendance
            </Button>
          </div>
        }
      />

      {/* Month selector + search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={months.length === 0}
            className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus disabled:opacity-50"
          >
            {months.length === 0 && <option>No data</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee or Bio ID…"
            disabled={allReports.length === 0}
            className="w-64 rounded-lg border border-input bg-card py-1.5 pl-9 pr-8 text-sm text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus disabled:opacity-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {allReports.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {query
              ? `${reports.length} of ${allReports.length} employees`
              : `${allReports.length} employee${allReports.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {reports.length === 0 ? (
        <Card className="p-14 text-center text-sm text-muted-foreground">
          {allReports.length > 0 && query
            ? `No employee matches “${query}”.`
            : "No attendance for this month. Upload a biometric log to get started."}
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => {
            const isCollapsed = collapsed[r.employeeId];
            return (
              <Card key={r.employeeId} className="overflow-hidden">
                {/* Per-employee summary header */}
                <button
                  type="button"
                  onClick={() => toggle(r.employeeId)}
                  className="flex w-full items-center gap-4 border-b border-border bg-muted/50 px-5 py-3 text-left transition-colors hover:bg-muted"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{r.employeeName}</p>
                    <p className="text-xs text-muted-foreground">Bio ID {r.bioId}</p>
                  </div>
                  <dl className="hidden gap-6 sm:flex">
                    {[
                      ["Total Late", r.totalLate],
                      ["Undertime", r.totalUndertime],
                      ["Deduction", r.totalDeduction],
                      ["Excess", r.totalExcess],
                    ].map(([label, value]) => (
                      <div key={label} className="text-right">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="text-sm tabular-nums text-foreground">{value}</dd>
                      </div>
                    ))}
                    <div className="text-right">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Total of Duty</dt>
                      <dd className="text-sm font-semibold tabular-nums text-primary">
                        {r.totalDuty.toFixed(2)}
                      </dd>
                    </div>
                  </dl>
                </button>

                {/* Daily detail */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          {COLS.map((c, i) => (
                            <th
                              key={c}
                              className={cn(
                                "whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground",
                                i === 0 ? "text-left" : "text-right",
                              )}
                            >
                              {c}
                            </th>
                          ))}
                          <th className="w-10 px-3 py-2">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.days.map((d) => (
                          <tr
                            key={d.date}
                            className="group border-t border-border/60 even:bg-muted/20"
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-left tabular-nums text-foreground">
                              {d.date}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-foreground">
                              {d.timeIn || <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-foreground">
                              {d.timeOut || <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.late}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.undertime}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.deduction}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.excess}</td>
                            <td
                              className={cn(
                                "px-3 py-1.5 text-right tabular-nums",
                                d.dutyHours > 0 ? "font-medium text-foreground" : "text-muted-foreground/50",
                              )}
                            >
                              {d.dutyHours.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => editDay(r.employeeId, r.employeeName, d.date)}
                                // Kept in the layout at all times (opacity, not
                                // display) so the column never reflows on hover;
                                // always visible to keyboard focus.
                                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                                aria-label={`Edit attendance for ${r.employeeName} on ${d.date}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AttendanceUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <AttendanceEditDialog target={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  );
}
