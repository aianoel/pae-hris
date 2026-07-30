import * as React from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OvertimeRegister } from "@/components/payroll/OvertimeRegister";
import { RegisterReport } from "@/components/payroll/RegisterReport";
import {
  PAYROLL_REGISTER_FIELDS,
  EARNING_REGISTER_FIELDS,
  DEDUCTION_REGISTER_FIELDS,
  PAYROLL_DEDUCTION_KEYS,
  PAYROLL_COMPUTED_KEYS,
  recomputePayrollTotals,
} from "@/lib/payrollReports";

/** Page tabs — three dept-grouped register tables plus the Overtime register. */
type PageTab = "register" | "earnings" | "deductions" | "overtime";

export function PayrollReportPage() {
  const [tab, setTab] = React.useState<PageTab>("register");

  return (
    <>
      <PageHeader
        title="Payroll Report"
        description="Dept-grouped payroll registers — payroll, earnings, deductions and overtime, filtered by pay period."
      />

      {/* Each tab owns its filter bar, GET, print buttons and dataset — filter
          state is preserved per tab because every panel stays mounted. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as PageTab)} className="space-y-4">
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
    </>
  );
}
