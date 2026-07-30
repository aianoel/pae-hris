import { Calendar, Download } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  AttendanceChart,
  DepartmentDonut,
  EmployeeGrowthChart,
  LoginActivityChart,
  PayrollTrendChart,
} from "@/components/dashboard/charts";
import { departmentDistribution } from "@/lib/data";

const engagementStats = [
  { label: "Daily active users", value: 78, tint: "bg-primary" },
  { label: "Weekly retention", value: 64, tint: "bg-chart-3" },
  { label: "Feature adoption", value: 52, tint: "bg-chart-4" },
  { label: "Satisfaction (CSAT)", value: 91, tint: "bg-success" },
];

export function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Deep-dive into workforce, engagement, and cost metrics."
        actions={
          <>
            <Button variant="outline" size="lg">
              <Calendar className="h-4 w-4" /> Last 12 months
            </Button>
            <Button size="lg">
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Employee growth"
          description="Hires vs. departures"
          className="lg:col-span-2"
        >
          <EmployeeGrowthChart />
        </ChartCard>
        <ChartCard title="Department distribution" description="Headcount by team">
          <DepartmentDonut />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Payroll cost" description="Monthly total (PHP millions)">
          <PayrollTrendChart />
        </ChartCard>
        <ChartCard title="Monthly attendance" description="Present · remote · absent">
          <AttendanceChart />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Login statistics"
          description="User activity by hour of day"
          className="lg:col-span-2"
        >
          <LoginActivityChart />
        </ChartCard>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-base font-semibold tracking-tight">User engagement</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Key product signals</p>
            <div className="mt-5 space-y-5">
              {engagementStats.map((s) => (
                <div key={s.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.value}%</span>
                  </div>
                  <Progress value={s.value} indicatorClassName={s.tint} />
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Largest team</p>
              <p className="mt-0.5 text-lg font-semibold">
                {
                  [...departmentDistribution].sort((a, b) => b.value - a.value)[0]
                    ?.name ?? "—"
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
