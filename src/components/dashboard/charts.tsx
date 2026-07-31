import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import type {
  AttendancePoint,
  DepartmentSlice,
  GrowthPoint,
  LoginPoint,
  PayrollPoint,
} from "@/lib/analytics";
import {
  attendanceData,
  departmentDistribution,
  employeeGrowth,
  loginActivity,
  payrollTrend,
} from "@/lib/data";

const axisProps = {
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const;

const gridProps = {
  strokeDasharray: "4 4",
  stroke: "hsl(var(--border))",
  vertical: false,
} as const;

/**
 * Shown in place of a chart when there is nothing to plot. Recharts renders
 * bare axes for an empty series, which reads as a broken chart rather than an
 * empty workspace — this says which action would populate it.
 */
function NoData({ message, height = 280 }: { message: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-center"
      style={{ height }}
    >
      <p className="max-w-[22rem] text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** True when every numeric field across the series is zero (or the series is empty). */
function isBlank<T extends object>(rows: T[], keys: (keyof T)[]): boolean {
  if (rows.length === 0) return true;
  return rows.every((r) => keys.every((k) => !Number(r[k])));
}

export function EmployeeGrowthChart({
  data = employeeGrowth as GrowthPoint[],
}: {
  data?: GrowthPoint[];
}) {
  if (isBlank(data, ["hired", "left"])) {
    return <NoData message="No hires recorded in this period. Add employees to see growth over time." />;
  }

  // The Employee record has no termination date, so departures can't be dated;
  // hide the band entirely rather than draw a flat zero line implying none.
  const showLeft = data.some((d) => d.left > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="hiredGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="leftGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
        <Area
          type="monotone"
          dataKey="hired"
          name="Hired"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2.5}
          fill="url(#hiredGrad)"
          animationDuration={1100}
        />
        {showLeft && (
          <Area
            type="monotone"
            dataKey="left"
            name="Left"
            stroke="hsl(var(--chart-4))"
            strokeWidth={2}
            fill="url(#leftGrad)"
            animationDuration={1300}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AttendanceChart({
  data = attendanceData as AttendancePoint[],
}: {
  data?: AttendancePoint[];
}) {
  if (isBlank(data, ["present", "remote", "absent", "onLeave"])) {
    return <NoData message="No attendance recorded yet. Import biometric data to see the weekly pattern." />;
  }

  const showLeave = data.some((d) => Number(d.onLeave) > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={4}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="day" {...axisProps} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
        <Bar dataKey="present" name="Present" stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} animationDuration={900} />
        <Bar dataKey="remote" name="Remote" stackId="a" fill="hsl(var(--chart-3))" animationDuration={900} />
        {/* On-leave stays distinct from absent: an approved leave day is
            accounted for, and payroll must not treat it as unexplained. */}
        {showLeave && (
          <Bar dataKey="onLeave" name="On leave" stackId="a" fill="hsl(var(--chart-2))" animationDuration={900} />
        )}
        <Bar dataKey="absent" name="Absent" stackId="a" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PayrollTrendChart({
  data = payrollTrend as PayrollPoint[],
}: {
  data?: PayrollPoint[];
}) {
  if (isBlank(data, ["cost"])) {
    return <NoData message="No payroll has been run yet. Completed runs appear here as monthly cost." />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => `₱${Number(v).toFixed(1)}M`} />
        <Tooltip
          content={<ChartTooltip valueFormatter={(v) => `₱${v.toFixed(2)}M`} />}
          cursor={{ stroke: "hsl(var(--border))" }}
        />
        <Line
          type="monotone"
          dataKey="cost"
          name="Payroll cost"
          stroke="hsl(var(--chart-5))"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "hsl(var(--chart-5))", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          animationDuration={1200}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DepartmentDonut({
  data = departmentDistribution as DepartmentSlice[],
}: {
  data?: DepartmentSlice[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <NoData message="No staff assigned to a department yet. Add employees to see the split." />;
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={3}
            stroke="none"
            animationDuration={1000}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconType="circle"
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -ml-[3.2rem] -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">Total staff</p>
      </div>
    </div>
  );
}

export function LoginActivityChart({
  data = loginActivity as LoginPoint[],
}: {
  data?: LoginPoint[];
}) {
  if (isBlank(data, ["logins"])) {
    return (
      <NoData
        height={220}
        message="No sign-ins recorded yet. Activity is drawn from the audit log as users log in."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="hour" {...axisProps} tickFormatter={(v) => `${v}:00`} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
        <Bar dataKey="logins" name="Logins" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}
