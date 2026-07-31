import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Download, Plus, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { SystemStats } from "@/components/dashboard/SystemStats";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import {
  AttendanceChart,
  DepartmentDonut,
  EmployeeGrowthChart,
} from "@/components/dashboard/charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { downloadCsv } from "@/lib/export";
import {
  attendanceByWeekdayFrom,
  departmentDistributionFrom,
  employeeGrowthFrom,
} from "@/lib/analytics";
import { kpis, type Kpi } from "@/lib/data";

export function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { employees, departments, attendance } = useStore();
  const { user } = useAuth();
  const firstName = (user?.name ?? "there").split(" ")[0];

  // Same derivations as the Analytics page, so the two screens can never
  // disagree about headcount or attendance.
  const growth = React.useMemo(() => employeeGrowthFrom(employees, 12), [employees]);
  const distribution = React.useMemo(
    () => departmentDistributionFrom(employees, departments),
    [employees, departments],
  );
  const attendanceSeries = React.useMemo(
    () => attendanceByWeekdayFrom(attendance),
    [attendance],
  );

  // Live stat card derived from the store, so it stays accurate in an empty
  // workspace where the curated mock `kpis` array is empty.
  const activeCount = employees.filter((e) => e.status === "active").length;
  const activePct =
    employees.length > 0 ? Math.round((activeCount / employees.length) * 100) : 0;
  const activeKpi: Kpi = {
    id: "active-employees",
    title: "Active employees",
    value: activeCount,
    suffix: employees.length > 0 ? ` / ${employees.length}` : "",
    deltaPct: activePct,
    trend: "up",
    spark: [activeCount],
    icon: "Users",
    accent: "text-primary",
  };

  // Derive the live "Total Employees" figure from the store; the rest stay as
  // curated mock KPIs.
  const liveKpis = [
    activeKpi,
    ...kpis.map((k) =>
      k.id === "employees" ? { ...k, value: employees.length } : k,
    ),
  ];

  return (
    <>
      <PageHeader
        title={`Good morning, ${firstName} 👋`}
        description="Here's what's happening across your organization today."
        actions={
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                downloadCsv(
                  "org-overview",
                  departments.map((d) => ({ department: d.name, lead: d.lead, budget: d.budget })),
                );
                toast({ variant: "success", title: "Export complete", description: "Organization overview downloaded." });
              }}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="lg" onClick={() => navigate("/reports")}>
              <Plus className="h-4 w-4" /> New report
            </Button>
          </>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {liveKpis.map((kpi, i) => (
          <KpiCard key={kpi.id} kpi={kpi} index={i} />
        ))}
      </div>

      {/* System monitoring */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          System monitoring
        </h2>
        <SystemStats />
      </section>

      {/* Charts */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Employee growth"
          description="Hires vs. departures over the last 12 months"
          className="lg:col-span-2"
          action={
            <Tabs defaultValue="year">
              <TabsList className="h-8">
                <TabsTrigger value="month" className="text-xs">
                  Month
                </TabsTrigger>
                <TabsTrigger value="quarter" className="text-xs">
                  Quarter
                </TabsTrigger>
                <TabsTrigger value="year" className="text-xs">
                  Year
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <EmployeeGrowthChart data={growth} />
        </ChartCard>

        <ChartCard title="By department" description="Headcount distribution">
          <DepartmentDonut data={distribution} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Weekly attendance"
          description="Present, remote, and absent this week"
          className="lg:col-span-2"
        >
          <AttendanceChart data={attendanceSeries} />
        </ChartCard>

        {/* Activity + AI insight */}
        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary to-indigo-600 text-white">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  AI insight
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/90">
                Attendance dips ~14% on Fridays. Consider a flexible remote policy to
                keep engagement steady heading into the weekend.
              </p>
              <button
                onClick={() => navigate("/analytics")}
                className="mt-4 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/25"
              >
                Explore recommendation
              </button>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-2">
              <h3 className="text-base font-semibold tracking-tight">Recent activity</h3>
            </CardHeader>
            <CardContent className="pt-0">
              <ActivityTimeline />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
