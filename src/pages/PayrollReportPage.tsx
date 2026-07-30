import * as React from "react";
import { Receipt } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OvertimeRegister } from "@/components/payroll/OvertimeRegister";
import { RegisterReport } from "@/components/payroll/RegisterReport";
import { PayslipReport } from "@/components/payroll/PayslipReport";
import { Net15Report } from "@/components/payroll/Net15Report";
import { Net1530Report } from "@/components/payroll/Net1530Report";
import { ReportTabNav, type ReportTab } from "@/components/payroll/ReportTabNav";
import { ReportFilterProvider, useReportFilters } from "@/components/payroll/reportFilterContext";
import { YEARS, MONTHS, PAYCLASSES, PAYTYPES, ChipSelect, FilterSelect } from "@/components/payroll/reportFilters";
import { Card } from "@/components/ui/card";
import { useStore } from "@/store/store-context";
import {
  PAYROLL_REGISTER_FIELDS,
  EARNING_REGISTER_FIELDS,
  DEDUCTION_REGISTER_FIELDS,
  PAYROLL_DEDUCTION_KEYS,
  PAYROLL_COMPUTED_KEYS,
  recomputePayrollTotals,
} from "@/lib/payrollReports";

/** Top-level report views. */
type ReportView = "dashboard" | "payslip" | "net15" | "net1530";

/** Dashboard sub-tabs — the four dept-grouped register tables. */
type RegisterTab = "register" | "earnings" | "deductions" | "overtime";

export function PayrollReportPage() {
  return (
    <ReportFilterProvider>
      <PayrollReportViews />
    </ReportFilterProvider>
  );
}

/**
 * Period filter bar shared by every tab — set the Year/Month/Payclass/Paytype
 * once and all four views follow it, reloading automatically. Tab-specific
 * filters (agency, payroll period, payroll date) stay on their own tab.
 */
function SharedFilterBar() {
  const { year, month, payclass, paytype, patch, processed } = useReportFilters();

  return (
    <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
      <ChipSelect id="rpt-year" label="Year" value={year} options={YEARS} onChange={(v) => patch({ year: v })} />
      <ChipSelect id="rpt-month" label="Month" value={month} options={MONTHS} onChange={(v) => patch({ month: v })} />
      <FilterSelect id="rpt-payclass" label="Payclass" value={payclass} options={PAYCLASSES} onChange={(v) => patch({ payclass: v })} />
      <FilterSelect id="rpt-paytype" label="Paytype" value={paytype} options={PAYTYPES} onChange={(v) => patch({ paytype: v })} />
      <p className="ml-auto max-w-xs text-xs text-muted-foreground">
        {processed
          ? "Reports update automatically as you change these filters."
          : `No payroll processed for ${month} ${year}.`}
      </p>
    </Card>
  );
}

function PayrollReportViews() {
  const { payrollRuns } = useStore();
  const [view, setView] = React.useState<ReportView>("dashboard");

  // Dashboard badge: payroll runs still awaiting approval (not yet paid) — the
  // pending/unprocessed items the payroll officer needs to act on.
  const pendingCount = React.useMemo(
    () => payrollRuns.filter((r) => r.status !== "paid").length,
    [payrollRuns],
  );

  const tabs: ReportTab<ReportView>[] = [
    { value: "dashboard", label: "Dashboard", badge: pendingCount },
    { value: "payslip", label: "Payslip" },
    { value: "net15", label: "NET 15" },
    { value: "net1530", label: "NET 15/30" },
  ];

  return (
    <>
      {/* Page header: "Reports" title top-left, tab nav top-right. */}
      <div className="mb-6 flex flex-col gap-4 border-b border-border sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2.5 pb-4 sm:pb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Receipt className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Reports
          </h1>
        </div>
        <ReportTabNav tabs={tabs} value={view} onChange={setView} />
      </div>

      {/* Period filters, shared by every tab — pick once, all views follow. */}
      <SharedFilterBar />

      {/* Views reload automatically off the shared filters (no Get button) and
          stay mounted, so per-tab state survives switching between them. */}
      <div hidden={view !== "dashboard"}>
        <DashboardView />
      </div>
      <div hidden={view !== "payslip"}>
        <PayslipReport />
      </div>
      <div hidden={view !== "net15"}>
        <Net15Report />
      </div>
      <div hidden={view !== "net1530"}>
        <Net1530Report />
      </div>
    </>
  );
}

/**
 * Dashboard view — the payroll registers. Each sub-tab owns its filter bar,
 * GET, print buttons and dataset; filter state is preserved per sub-tab because
 * every panel stays mounted.
 */
function DashboardView() {
  const [tab, setTab] = React.useState<RegisterTab>("register");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as RegisterTab)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="register">Payroll Register</TabsTrigger>
        <TabsTrigger value="earnings">Earning Register</TabsTrigger>
        <TabsTrigger value="deductions">Deductions Register</TabsTrigger>
        <TabsTrigger value="overtime">Overtime Register</TabsTrigger>
      </TabsList>

      <TabsContent value="register" forceMount hidden={tab !== "register"}>
        <RegisterReport
          idPrefix="reg"
          registerName="Payroll Register"
          printLabel="PAYROLL REGISTER"
          fields={PAYROLL_REGISTER_FIELDS}
          editableKeys={["gross_earnings", ...PAYROLL_DEDUCTION_KEYS]}
          computedKeys={PAYROLL_COMPUTED_KEYS}
          recompute={recomputePayrollTotals}
          approvable
        />
      </TabsContent>

      <TabsContent value="earnings" forceMount hidden={tab !== "earnings"}>
        <RegisterReport
          idPrefix="earn"
          registerName="Earning Register"
          printLabel="EARNINGS REGISTER"
          fields={EARNING_REGISTER_FIELDS}
        />
      </TabsContent>

      <TabsContent value="deductions" forceMount hidden={tab !== "deductions"}>
        <RegisterReport
          idPrefix="dedn"
          registerName="Deductions Register"
          printLabel="DEDUCTIONS REGISTER"
          fields={DEDUCTION_REGISTER_FIELDS}
        />
      </TabsContent>

      <TabsContent value="overtime">
        <OvertimeRegister />
      </TabsContent>
    </Tabs>
  );
}
