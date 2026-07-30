import * as React from "react";
import {
  CalendarCheck,
  Plane,
  Wallet,
  Landmark,
  Banknote,
  Receipt,
  History,
  PencilLine,
  StickyNote,
  Paperclip,
  Download,
} from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  EARNING_FIELDS,
  DEDUCTION_FIELDS,
  grossPay,
  totalDeductions,
  netPay,
  type PayrollRow,
} from "@/lib/payroll";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      {children}
    </div>
  );
}

export function EmployeePayrollPanel({
  row,
  open,
  onOpenChange,
}: {
  row: PayrollRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-lg">
        {row && (
          <>
            <DrawerHeader>
              <div className="flex items-center gap-3 pr-8">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-sm">{initials(row.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DrawerTitle className="truncate">{row.name}</DrawerTitle>
                  <DrawerDescription className="truncate">
                    {row.employeeId} · {row.position} · {row.department}
                  </DrawerDescription>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-success/10 p-2 text-center">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Gross</p>
                  <p className="text-sm font-semibold tabular-nums text-success">{formatCurrency(grossPay(row))}</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-2 text-center">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Deductions</p>
                  <p className="text-sm font-semibold tabular-nums text-destructive">{formatCurrency(totalDeductions(row))}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2 text-center">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Net</p>
                  <p className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(netPay(row))}</p>
                </div>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto p-5">
              <Tabs defaultValue="overview">
                <TabsList className="flex w-full">
                  <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
                  <TabsTrigger value="earnings" className="flex-1">Earnings</TabsTrigger>
                  <TabsTrigger value="statutory" className="flex-1">Statutory</TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="space-y-4">
                  <Section icon={CalendarCheck} title="Attendance Summary">
                    <Row label="Days present" value="21 / 22" />
                    <Row label="Overtime hours" value="12h" />
                    <Row label="Late / Undertime" value="2 incidents" />
                  </Section>
                  <Section icon={Plane} title="Leave Summary">
                    <Row label="Vacation balance" value="8 days" />
                    <Row label="Sick balance" value="5 days" />
                    <Row label="Taken this period" value="1 day" />
                  </Section>
                  <Section icon={Wallet} title="Salary Details">
                    <Row label="Employee type" value={row.employeeType} />
                    <Row label="Monthly basic" value={formatCurrency(row.basic)} />
                    <Row label="Pay frequency" value="Semi-monthly" />
                  </Section>
                </TabsContent>

                {/* Earnings & deductions breakdown */}
                <TabsContent value="earnings" className="space-y-4">
                  <Section icon={Banknote} title="Earnings">
                    {EARNING_FIELDS.map((f) => (
                      <Row key={f.key} label={f.label} value={formatCurrency(row[f.key])} tone="pos" />
                    ))}
                  </Section>
                  <Section icon={Receipt} title="Deductions">
                    {DEDUCTION_FIELDS.map((f) => (
                      <Row key={f.key} label={f.label} value={formatCurrency(row[f.key])} tone="neg" />
                    ))}
                  </Section>
                </TabsContent>

                {/* Statutory */}
                <TabsContent value="statutory" className="space-y-4">
                  <Section icon={Landmark} title="Government Contributions">
                    <Row label="Social Security" value={formatCurrency(Math.round(row.govDeductions * 0.5))} tone="neg" />
                    <Row label="Health Insurance" value={formatCurrency(Math.round(row.govDeductions * 0.3))} tone="neg" />
                    <Row label="Retirement Fund" value={formatCurrency(Math.round(row.govDeductions * 0.2))} tone="neg" />
                  </Section>
                  <Section icon={Banknote} title="Loans">
                    <Row label="Company loan" value={formatCurrency(row.loans)} tone="neg" />
                    <Row label="Cash advance" value={formatCurrency(row.cashAdvance)} tone="neg" />
                  </Section>
                  <Section icon={Receipt} title="Tax Information">
                    <Row label="Taxable income" value={formatCurrency(Math.max(0, grossPay(row) - row.govDeductions))} />
                    <Row label="Withholding tax" value={formatCurrency(Math.round(grossPay(row) * 0.08))} tone="neg" />
                    <Row label="Tax status" value="S1" />
                  </Section>
                </TabsContent>

                {/* History */}
                <TabsContent value="history" className="space-y-4">
                  <Section icon={History} title="Previous Payroll">
                    <Row label="June 16 – 30, 2026" value={formatCurrency(Math.round(netPay(row) * 0.98))} />
                    <Row label="June 1 – 15, 2026" value={formatCurrency(Math.round(netPay(row) * 0.96))} />
                    <Row label="May 16 – 31, 2026" value={formatCurrency(Math.round(netPay(row) * 0.97))} />
                  </Section>
                  <Section icon={PencilLine} title="Recent Adjustments">
                    <Row label="Overtime approved" value="+ 4h" tone="pos" />
                    <Row label="Late deduction" value={formatCurrency(row.late)} tone="neg" />
                  </Section>
                  <Section icon={StickyNote} title="Payroll Notes">
                    <p className="text-sm text-muted-foreground">
                      No notes for this period. Adjustments and approvals will be logged here.
                    </p>
                  </Section>
                  <Section icon={Paperclip} title="Attachments">
                    <button className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary">
                      <span className="flex items-center gap-2 text-foreground">
                        <Paperclip className="h-4 w-4 text-muted-foreground" /> timesheet-jul.pdf
                      </span>
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Section>
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex items-center gap-2 border-t border-border p-4">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button className="flex-1">
                <Download className="h-4 w-4" /> Payslip
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
