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
  statutoryFor,
  ancillaryFor,
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
                  {/* Drawn from the row's own timekeeping drivers — the counts
                      the attendance import resolved — so this agrees with the
                      deductions on the Statutory tab instead of contradicting
                      them with placeholder figures. */}
                  <Section icon={CalendarCheck} title="Attendance Summary">
                    <Row label="Overtime hours" value={`${row.overtimeHours}h`} />
                    <Row label="Night differential" value={`${row.nightDiffHours}h`} />
                    <Row label="Absent (no leave filed)" value={`${row.absentDays} d`} />
                    <Row label="Days lost to lateness" value={`${row.tardyDays} d`} />
                    <Row label="Approved unpaid leave" value={`${row.lwopDays} d`} />
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

                {/* Statutory — itemised from the configured contribution
                    brackets (Contributions module), the same figures that make
                    up Government Deductions and the register's SSS/PHIC/HDMF
                    and BASE TAX lines. */}
                <TabsContent value="statutory" className="space-y-4">
                  {(() => {
                    const stat = statutoryFor(row);
                    return (
                      <>
                        <Section icon={Landmark} title="Government Contributions">
                          <Row label="SSS" value={formatCurrency(stat.sss)} tone="neg" />
                          <Row label="PhilHealth" value={formatCurrency(stat.philHealth)} tone="neg" />
                          <Row label="HDMF (Pag-IBIG)" value={formatCurrency(stat.pagIbig)} tone="neg" />
                          <Row
                            label="Total contributions"
                            value={formatCurrency(stat.sss + stat.philHealth + stat.pagIbig)}
                            tone="neg"
                          />
                          {/* The base each bracket was matched on — basic pay plus
                              whatever the Contribution Matrix includes — so the
                              chosen bracket is explainable, not just asserted. */}
                          <p className="pt-2 text-xs text-muted-foreground">
                            Bracketed on {formatCurrency(stat.base.SSS)} (SSS) ·{" "}
                            {formatCurrency(stat.base.PhilHealth)} (PhilHealth) ·{" "}
                            {formatCurrency(stat.base["Pag-IBIG"])} (HDMF)
                          </p>
                          {stat.unmatched.length > 0 && (
                            <p className="pt-1 text-xs text-amber-600">
                              No configured bracket for {stat.unmatched.join(", ")} — the
                              built-in statutory formula was used. Add the band under
                              Contributions.
                            </p>
                          )}
                        </Section>
                        {/* Loan lines from the employee's actual Loans-page and
                            ledger records. An employee with no loans on file is
                            deducted nothing here — nothing is synthesised. */}
                        <Section icon={Banknote} title="Loans">
                          {(() => {
                            const a = ancillaryFor(row);
                            const lines: [string, number][] = [
                              ["SSS loan", a.sssLoan],
                              ["HDMF (Pag-IBIG) loan", a.hdmfLoan],
                              ["PECEWA loan", a.pecewaLoan],
                              ["Cooperative loan", a.coopLoan],
                              ["Pag-IBIG additional", a.pagibigAd],
                              ["Other loans", a.otherLoans],
                            ];
                            const active = lines.filter(([, amount]) => amount > 0);
                            return (
                              <>
                                {active.length === 0 && (
                                  <p className="py-1 text-sm text-muted-foreground">
                                    No loans on file for this employee.
                                  </p>
                                )}
                                {active.map(([label, amount]) => (
                                  <Row key={label} label={label} value={formatCurrency(amount)} tone="neg" />
                                ))}
                                <Row label="Total loans" value={formatCurrency(row.loans)} tone="neg" />
                                <Row label="Cash advance" value={formatCurrency(row.cashAdvance)} tone="neg" />
                              </>
                            );
                          })()}
                        </Section>
                        {/* Unpaid time, itemised by cause — each charged from its
                            own count, so a day never lands on two lines. */}
                        <Section icon={CalendarCheck} title="Unpaid Time">
                          <Row
                            label={`Absent, no leave filed (${row.absentDays} d)`}
                            value={formatCurrency(row.absences)}
                            tone="neg"
                          />
                          <Row
                            label={`Late arrivals (${row.tardyDays} d)`}
                            value={formatCurrency(row.late)}
                            tone="neg"
                          />
                          <Row
                            label={`Approved unpaid leave (${row.lwopDays} d)`}
                            value={formatCurrency(row.lwop)}
                            tone="neg"
                          />
                          <Row
                            label={`Undertime (${row.undertimeMinutes} min)`}
                            value={formatCurrency(row.undertime)}
                            tone="neg"
                          />
                        </Section>
                        <Section icon={Receipt} title="Tax Information">
                          {/* Withholding is computed on basic net of the three
                              contributions — the same base the engine uses. */}
                          <Row
                            label="Taxable income"
                            value={formatCurrency(
                              Math.max(0, stat.base.Tax - (stat.sss + stat.philHealth + stat.pagIbig)),
                            )}
                          />
                          <Row label="Withholding tax" value={formatCurrency(stat.tax)} tone="neg" />
                          <Row label="Tax status" value="S1" />
                        </Section>
                      </>
                    );
                  })()}
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
