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

export function EmployeeGrowthChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={employeeGrowth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
        <YAxis {...axisProps} width={40} />
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
        <Area
          type="monotone"
          dataKey="left"
          name="Left"
          stroke="hsl(var(--chart-4))"
          strokeWidth={2}
          fill="url(#leftGrad)"
          animationDuration={1300}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AttendanceChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={attendanceData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={4}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="day" {...axisProps} />
        <YAxis {...axisProps} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
        <Bar dataKey="present" name="Present" stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} animationDuration={900} />
        <Bar dataKey="remote" name="Remote" stackId="a" fill="hsl(var(--chart-3))" animationDuration={900} />
        <Bar dataKey="absent" name="Absent" stackId="a" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PayrollTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={payrollTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} width={40} tickFormatter={(v) => `$${v}M`} />
        <Tooltip
          content={<ChartTooltip valueFormatter={(v) => `$${v.toFixed(2)}M`} />}
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

export function DepartmentDonut() {
  const total = departmentDistribution.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={departmentDistribution}
            dataKey="value"
            nameKey="name"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={3}
            stroke="none"
            animationDuration={1000}
          >
            {departmentDistribution.map((entry) => (
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

export function LoginActivityChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={loginActivity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="hour" {...axisProps} tickFormatter={(v) => `${v}:00`} />
        <YAxis {...axisProps} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
        <Bar dataKey="logins" name="Logins" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}
