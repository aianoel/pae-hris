import * as React from "react";
import {
  CalendarDays,
  CalendarPlus,
  Receipt,
  Wallet,
  UserX,
  CheckCircle2,
  Laptop,
  XCircle,
  Plane,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { ApplyLeaveDialog } from "@/components/self/ApplyLeaveDialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  payslipRows,
  runsForPeriod,
  ALL_PAY_CLASSES,
  ALL_AGENCIES as REPORT_ALL_AGENCIES,
} from "@/lib/payrollReports";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TINT,
  workingDaysInRecord,
  type NewLeaveRecord,
} from "@/lib/leaveRecords";
import {
  employeeForEmail,
  attendanceForEmployee,
  leaveForEmployee,
  attendanceInMonth,
  monthsWithAttendance,
  summariseAttendance,
  formatMonthKey,
  approvedLeaveDaysThisYear,
} from "@/lib/selfService";
import type { AttendanceState } from "@/store/types";

const MONTH_CODES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Split a run's display period ("July 2026") back into the month code and year
 * the report engine takes. Returns null for anything unparseable rather than
 * guessing — a period we can't read is a period we can't cost.
 */
function parsePeriod(period: string): { code: string; year: string; sortKey: string } | null {
  const [monthName, year] = period.split(" ");
  const index = MONTH_NAMES.indexOf(monthName);
  if (index === -1 || !/^\d{4}$/.test(year ?? "")) return null;
  return {
    code: MONTH_CODES[index],
    year,
    // Zero-padded so a plain string sort orders periods chronologically.
    sortKey: `${year}-${String(index + 1).padStart(2, "0")}`,
  };
}

/** Visual treatment per attendance outcome. */
const STATE_STYLE: Record<AttendanceState, { label: string; tint: string; icon: typeof CheckCircle2 }> = {
  present: {
    label: "Present",
    tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  remote: {
    label: "Remote",
    tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    icon: Laptop,
  },
  absent: {
    label: "Absent",
    tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    icon: XCircle,
  },
  "on-leave": {
    label: "On leave",
    tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Plane,
  },
};

type Tab = "payslips" | "leave" | "attendance";

const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
  { key: "payslips", label: "Payslips", icon: Receipt },
  { key: "leave", label: "Leave", icon: CalendarDays },
  { key: "attendance", label: "Attendance", icon: CheckCircle2 },
];

/**
 * Employee self-service.
 *
 * Everything here is scoped to the signed-in user's own employee record,
 * resolved by email (see lib/selfService.ts). This is a presentation scope, not
 * an authorization boundary — Row Level Security is what must actually stop one
 * employee reading another's payroll.
 *
 * The page is reachable by every signed-in user, unlike the admin modules which
 * are gated on the per-user access list.
 */
export function MyWorkspacePage() {
  const { user } = useAuth();
  const {
    employees,
    attendance,
    leaveRecords,
    leaveTypes,
    payrollRuns,
    payrollOverrides,
    contributionRates,
    fileLeave,
  } = useStore();
  const { toast } = useToast();

  const [tab, setTab] = React.useState<Tab>("payslips");
  const [applyOpen, setApplyOpen] = React.useState(false);

  const employee = React.useMemo(
    () => employeeForEmail(employees, user?.email),
    [employees, user?.email],
  );

  // ---- Attendance --------------------------------------------------------

  const myAttendance = React.useMemo(
    () => (employee ? attendanceForEmployee(attendance, employee.id) : []),
    [attendance, employee],
  );

  const months = React.useMemo(() => monthsWithAttendance(myAttendance), [myAttendance]);
  const [month, setMonth] = React.useState<string>("");

  // Default to the newest month that has data, and correct the selection if the
  // available months change underneath it (e.g. a fresh import lands).
  React.useEffect(() => {
    if (months.length === 0) {
      if (month) setMonth("");
      return;
    }
    if (!months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const monthAttendance = React.useMemo(
    () => (month ? attendanceInMonth(myAttendance, month) : []),
    [myAttendance, month],
  );
  const summary = React.useMemo(() => summariseAttendance(monthAttendance), [monthAttendance]);

  // ---- Leave -------------------------------------------------------------

  const myLeave = React.useMemo(
    () => (employee ? leaveForEmployee(leaveRecords, employee.id) : []),
    [leaveRecords, employee],
  );

  const leaveDaysUsed = React.useMemo(
    () => approvedLeaveDaysThisYear(myLeave, new Date().getFullYear(), workingDaysInRecord),
    [myLeave],
  );

  const pendingLeave = myLeave.filter((r) => r.status === "pending").length;

  const submitLeave = (draft: NewLeaveRecord) => {
    const created = fileLeave(draft);
    if (created) {
      toast({
        variant: "success",
        title: "Leave requested",
        description: `${created.leaveTypeName} · ${formatDate(created.startDate)} – ${formatDate(created.endDate)}. Awaiting approval.`,
      });
    } else {
      toast({
        variant: "error",
        title: "Couldn't file leave",
        description: "That leave type is no longer available. Please try again.",
      });
    }
  };

  // ---- Payslips ----------------------------------------------------------

  /**
   * One payslip per processed run covering this employee, newest first.
   *
   * Only processed periods are listed: an unprocessed month would otherwise
   * show a computed figure the employee was never actually paid. Each period is
   * costed through the same `payslipRows` engine the Payroll Report uses, so
   * what an employee sees reconciles with what payroll issued.
   */
  const myPayslips = React.useMemo(() => {
    if (!employee) return [];

    // Distinct periods that have a run, newest first. Runs carry a display
    // period ("July 2026"), so parse back to the month/year the engine wants.
    const periods = [...new Set(payrollRuns.map((r) => r.period))];

    return periods
      .map((period) => {
        const parsed = parsePeriod(period);
        if (!parsed) return null;

        const periodRuns = runsForPeriod(payrollRuns, parsed.code, parsed.year);
        // Nothing processed for this period → no payslip to show.
        if (periodRuns.length === 0) return null;

        const rows = payslipRows(
          employees,
          {
            payclass: ALL_PAY_CLASSES,
            month: parsed.code,
            year: parsed.year,
            period: "Full month",
            agency: REPORT_ALL_AGENCIES,
          },
          payrollOverrides,
          periodRuns,
        );

        // Scoped by employee id — never by name, which is not unique.
        const mine = rows.find((r) => r.employee_id === employee.id);
        if (!mine) return null;

        return { period, sortKey: parsed.sortKey, row: mine };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    // contributionRates: statutory deductions come from the configured
    // brackets, so a rate edit must refresh these figures.
  }, [employee, employees, payrollRuns, payrollOverrides, contributionRates]);

  const latestPayslip = myPayslips[0] ?? null;

  // ---- No matching employee record --------------------------------------

  if (!employee) {
    return (
      <>
        <PageHeader
          title="My workspace"
          description="Your payslips, leave and attendance."
        />
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <UserX className="h-7 w-7" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">No employee record</h2>
              <p className="text-sm text-muted-foreground">
                Your sign-in ({user?.email}) isn&apos;t linked to an employee record, so there
                is nothing to show here yet. Ask HR to check the email on your profile.
              </p>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const kpis = [
    {
      label: "Latest net pay",
      value: latestPayslip ? formatCurrency(latestPayslip.row.net_pay) : "—",
      sub: latestPayslip ? latestPayslip.period : "No payslip yet",
      icon: Wallet,
    },
    {
      label: "Leave taken",
      value: `${leaveDaysUsed} ${leaveDaysUsed === 1 ? "day" : "days"}`,
      sub: `${new Date().getFullYear()} · ${pendingLeave} pending`,
      icon: CalendarDays,
    },
    {
      label: "Attendance",
      value: month ? `${summary.rate}%` : "—",
      sub: month ? formatMonthKey(month) : "No records",
      icon: CheckCircle2,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${employee.name.split(" ")[0]}`}
        description={`${employee.role} · ${employee.department}`}
        actions={
          <Button onClick={() => setApplyOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> Apply for leave
          </Button>
        }
      />

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <k.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </p>
                <p className="truncate text-xl font-semibold tabular-nums text-foreground">
                  {k.value}
                </p>
                <p className="truncate text-xs text-muted-foreground">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/40 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Payslips ---- */}
      {tab === "payslips" && (
        <Card>
          <CardContent className="p-0">
            {myPayslips.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payslips yet"
                body="Payslips appear here once payroll has been processed for a period."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-muted/60">
                    <tr>
                      <Th className="text-left">Period</Th>
                      <Th>Basic</Th>
                      <Th>Earnings</Th>
                      <Th>Tax</Th>
                      <Th>Deductions</Th>
                      <Th>Net pay</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPayslips.map(({ period, row }) => (
                      <tr key={period} className="border-t border-border even:bg-muted/25">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                          {period}
                        </td>
                        <Td>{formatCurrency(row.basic)}</Td>
                        <Td>{formatCurrency(row.earnings)}</Td>
                        <Td>{formatCurrency(row.tax)}</Td>
                        <Td>{formatCurrency(row.deductions)}</Td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(row.net_pay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Leave ---- */}
      {tab === "leave" && (
        <Card>
          <CardContent className="p-0">
            {myLeave.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No leave filed"
                body="Your leave requests and their approval status will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-muted/60">
                    <tr>
                      <Th className="text-left">Type</Th>
                      <Th className="text-left">Dates</Th>
                      <Th>Days</Th>
                      <Th className="text-left">Reason</Th>
                      <Th className="text-left">Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLeave.map((r) => (
                      <tr key={r.id} className="border-t border-border even:bg-muted/25">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                          {r.leaveTypeName}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {r.payRule === "unpaid" ? "Unpaid" : "Paid"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(r.startDate)} – {formatDate(r.endDate)}
                        </td>
                        <Td>{workingDaysInRecord(r)}</Td>
                        <td className="max-w-[20rem] truncate px-4 py-3 text-sm text-muted-foreground">
                          {r.reason || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                              LEAVE_STATUS_TINT[r.status],
                            )}
                          >
                            {LEAVE_STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Attendance ---- */}
      {tab === "attendance" && (
        <Card>
          <CardContent className="p-0">
            {months.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No attendance records"
                body="Your daily attendance will appear here once timekeeping has been imported."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["Present", summary.present, "text-emerald-600 dark:text-emerald-400"],
                        ["Remote", summary.remote, "text-sky-600 dark:text-sky-400"],
                        ["Absent", summary.absent, "text-rose-600 dark:text-rose-400"],
                        ["On leave", summary.onLeave, "text-amber-600 dark:text-amber-400"],
                      ] as const
                    ).map(([label, count, tone]) => (
                      <span
                        key={label}
                        className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                      >
                        {label} <span className={cn("font-semibold tabular-nums", tone)}>{count}</span>
                      </span>
                    ))}
                  </div>

                  <select
                    aria-label="Attendance month"
                    className="h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-soft outline-none focus:border-primary"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {formatMonthKey(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="bg-muted/60">
                      <tr>
                        <Th className="text-left">Date</Th>
                        <Th className="text-left">Day</Th>
                        <Th className="text-left">Time in</Th>
                        <Th className="text-left">Time out</Th>
                        <Th className="text-left">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthAttendance.map((a) => {
                        const style = STATE_STYLE[a.state];
                        return (
                          <tr key={a.id} className="border-t border-border even:bg-muted/25">
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                              {formatDate(a.date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                              {a.day}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-muted-foreground">
                              {a.timeIn || "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-muted-foreground">
                              {a.timeOut || "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                                  style.tint,
                                )}
                              >
                                <style.icon className="h-3.5 w-3.5" />
                                {style.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ApplyLeaveDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        employee={employee}
        leaveTypes={leaveTypes}
        existing={myLeave}
        onSubmit={submitLeave}
      />
    </>
  );
}

// ---- Small presentational helpers ---------------------------------------

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
      {children}
    </td>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Receipt;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
