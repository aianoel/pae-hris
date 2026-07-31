import * as React from "react";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  AttendanceChart,
  DepartmentDonut,
  EmployeeGrowthChart,
  LoginActivityChart,
  PayrollTrendChart,
} from "@/components/dashboard/charts";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { downloadCsv } from "@/lib/export";
import { formatCurrency } from "@/lib/format";
import {
  attendanceByWeekdayFrom,
  departmentDistributionFrom,
  employeeGrowthFrom,
  headlineStatsFrom,
  loginActivityFrom,
  payrollTrendFrom,
} from "@/lib/analytics";

/** Trailing windows offered by the range selector. */
const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "24", label: "Last 24 months" },
] as const;

export function AnalyticsPage() {
  const { employees, departments, attendance, payrollRuns, logs, ready } = useStore();
  const { toast } = useToast();
  const [range, setRange] = React.useState("12");

  const months = Number(range);

  // All five series derive from live store collections. Recomputed only when
  // the underlying records or the window change — these walk every employee and
  // attendance row, so they shouldn't re-run on unrelated renders.
  const growth = React.useMemo(
    () => employeeGrowthFrom(employees, months),
    [employees, months],
  );
  const distribution = React.useMemo(
    () => departmentDistributionFrom(employees, departments),
    [employees, departments],
  );
  const attendanceSeries = React.useMemo(
    () => attendanceByWeekdayFrom(attendance),
    [attendance],
  );
  const payroll = React.useMemo(
    () => payrollTrendFrom(payrollRuns, months),
    [payrollRuns, months],
  );
  const logins = React.useMemo(() => loginActivityFrom(logs), [logs]);
  const stats = React.useMemo(
    () => headlineStatsFrom(employees, attendance, payrollRuns),
    [employees, attendance, payrollRuns],
  );

  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? "";

  /**
   * Exports the figures actually on screen, one row per month, so the CSV
   * reconciles with the charts rather than re-deriving from a different window.
   */
  function exportCsv() {
    const rows = growth.map((g, i) => ({
      month: g.month,
      hired: g.hired,
      headcount: g.headcount,
      payroll_gross_php: Math.round((payroll[i]?.cost ?? 0) * 1_000_000),
    }));

    if (rows.length === 0) {
      toast({
        variant: "error",
        title: "Nothing to export",
        description: "There is no data in the selected range.",
      });
      return;
    }

    downloadCsv("analytics", rows);
    toast({
      variant: "success",
      title: "Export complete",
      description: `Analytics for the ${rangeLabel.toLowerCase()} downloaded.`,
    });
  }

  // Engagement signals are computed from the audit log and attendance rather
  // than hardcoded, so the bars move with real usage.
  const signedInUsers = new Set(
    logs
      .filter((l) => l.type === "auth" && l.action.toLowerCase().startsWith("signed in"))
      .map((l) => l.actorEmail ?? l.actor),
  ).size;
  const totalLogins = logins.reduce((s, l) => s + l.logins, 0);
  const engagementStats = [
    {
      label: "Staff active",
      value: stats.activePct,
      tint: "bg-primary",
      hint: `${stats.headcount} on the books`,
    },
    {
      label: "Attendance rate",
      value: stats.attendanceRate,
      tint: "bg-chart-3",
      hint: `${attendance.length} day(s) recorded`,
    },
    {
      label: "Departments staffed",
      value: departments.length
        ? Math.round((distribution.filter((d) => d.name !== "Unassigned").length / departments.length) * 100)
        : 0,
      tint: "bg-chart-4",
      hint: `${departments.length} department(s)`,
    },
  ];

  const largestTeam = distribution[0];

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Deep-dive into workforce, engagement, and cost metrics."
        actions={
          <>
            <Select
              aria-label="Reporting range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="h-11 w-[11rem]"
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Button size="lg" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
      />

      {/* Headline figures — every one derived from live records. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Headcount" value={stats.headcount.toLocaleString()} />
        <StatTile label="Active" value={`${stats.activePct}%`} />
        <StatTile
          label="Median tenure"
          value={
            stats.medianTenureMonths >= 12
              ? `${(stats.medianTenureMonths / 12).toFixed(1)} yrs`
              : `${stats.medianTenureMonths} mo`
          }
        />
        <StatTile
          label={`Payroll (${rangeLabel.toLowerCase()})`}
          value={formatCurrency(stats.payrollTotal, { maximumFractionDigits: 0 })}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Employee growth"
          description={`Hires per month · ${rangeLabel.toLowerCase()}`}
          className="lg:col-span-2"
        >
          <EmployeeGrowthChart data={growth} />
        </ChartCard>
        <ChartCard title="Department distribution" description="Headcount by team">
          <DepartmentDonut data={distribution} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Payroll cost"
          description={`Monthly gross (PHP millions) · ${rangeLabel.toLowerCase()}`}
        >
          <PayrollTrendChart data={payroll} />
        </ChartCard>
        <ChartCard title="Attendance by weekday" description="Present · remote · absent">
          <AttendanceChart data={attendanceSeries} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Login statistics"
          description={`Sign-ins by hour of day · ${totalLogins} total`}
          className="lg:col-span-2"
        >
          <LoginActivityChart data={logins} />
        </ChartCard>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-base font-semibold tracking-tight">Workspace signals</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {signedInUsers > 0
                ? `${signedInUsers} user(s) have signed in`
                : "No sign-ins recorded yet"}
            </p>
            <div className="mt-5 space-y-5">
              {engagementStats.map((s) => (
                <div key={s.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.value}%</span>
                  </div>
                  <Progress value={s.value} indicatorClassName={s.tint} />
                  <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Largest team</p>
              <p className="mt-0.5 text-lg font-semibold">
                {largestTeam ? largestTeam.name : "—"}
              </p>
              {largestTeam && (
                <p className="text-xs text-muted-foreground">
                  {largestTeam.value} staff
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {!ready && (
        <p className="mt-4 text-center text-sm text-muted-foreground">Loading workspace data…</p>
      )}
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
