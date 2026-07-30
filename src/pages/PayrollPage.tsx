import * as React from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Wallet, Play, Eye, CheckCircle2, ClipboardCheck, CalendarClock, XCircle, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusChip, type Status } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import type { PayrollRun, PayrollStatus } from "@/store/types";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  deptRegister,
  registerTotals,
  splitIntoHalves,
  PAYROLL_REGISTER_FIELDS,
  ALL_AGENCIES as REPORT_ALL_AGENCIES,
  type ReportFilters,
} from "@/lib/payrollReports";
import { cn } from "@/lib/utils";

// NOTE: the review modal renders one row per employee (deptRegister returns
// per-employee rows) with the full Payroll Register column set.

// Agency-scope options for a run. "All" runs every active employee; "Direct
// hire" scopes to staff with no agency; otherwise a specific agency's staff.
const ALL_AGENCIES = "All Agencies";
const DIRECT_HIRE = "Direct hire";

const statusChip: Record<PayrollStatus, Status> = {
  draft: "pending",
  processing: "pending",
  processed: "pending",
  paid: "approved",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Success illustration shown after a run proceeds — an inline SVG data URI
// (green circle + check) so no asset file is needed.
const PAYROLL_SUCCESS_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">` +
      `<circle cx="70" cy="70" r="64" fill="#16a34a" fill-opacity="0.12"/>` +
      `<circle cx="70" cy="70" r="46" fill="#16a34a"/>` +
      `<path d="M50 71l14 14 26-30" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`,
  );

export function PayrollPage() {
  const {
    payrollRuns,
    employees,
    agencies,
    payrollOverrides,
    runPayroll,
    markPayrollPaid,
    disapprovePayrollRun,
    removePayrollRun,
  } = useStore();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [detail, setDetail] = React.useState<PayrollRun | null>(null);
  const [agency, setAgency] = React.useState<string>(ALL_AGENCIES);
  // Whether the pre-run review modal (per-employee amounts) is open.
  const [reviewOpen, setReviewOpen] = React.useState(false);

  // Live headcount per agency scope, recomputed whenever employees/agencies
  // change. Keyed by the option value; "" is the Direct-hire bucket.
  const headcountByOption = React.useMemo(() => {
    const counts = new Map<string, number>();
    counts.set(ALL_AGENCIES, employees.length);
    for (const e of employees) {
      const key = e.agency || "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [employees]);

  // Agency options: registered agencies ∪ any already assigned to an employee.
  // "Direct hire" only appears when some active employee has no agency.
  const agencyOptions = React.useMemo(() => {
    const names = new Set<string>(agencies.map((a) => a.name));
    let hasDirect = false;
    for (const e of employees) {
      if (e.agency) names.add(e.agency);
      else hasDirect = true;
    }
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    return [ALL_AGENCIES, ...(hasDirect ? [DIRECT_HIRE] : []), ...sorted];
  }, [agencies, employees]);

  // Resolve an option label to its headcount bucket ("Direct hire" → "").
  const countFor = React.useCallback(
    (opt: string) =>
      opt === ALL_AGENCIES
        ? headcountByOption.get(ALL_AGENCIES) ?? 0
        : headcountByOption.get(opt === DIRECT_HIRE ? "" : opt) ?? 0,
    [headcountByOption],
  );

  // Employees included in the next run given the current agency scope.
  const scopedEmployees = React.useMemo(() => {
    if (agency === ALL_AGENCIES) return employees;
    const want = agency === DIRECT_HIRE ? "" : agency;
    return employees.filter((e) => (e.agency ?? "") === want);
  }, [employees, agency]);

  // Per-employee payroll amounts for the review modal — the full Payroll
  // Register column set (same builder the Payroll Report uses), scoped to the
  // selected agency. The report's ALL_AGENCIES sentinel matches this page's.
  // Paytype is "Full month" so the register shows the whole-month figures; the
  // review then presents them split into 1st-/2nd-half cutoffs below.
  const reviewFilters = React.useMemo<ReportFilters>(
    () => ({
      year: "2026",
      month: "JUL",
      payclass: "Tier 1",
      paytype: "Full month",
      agency: agency === ALL_AGENCIES ? REPORT_ALL_AGENCIES : agency,
    }),
    [agency],
  );

  const reviewRows = React.useMemo(
    () => deptRegister(employees, reviewFilters, payrollOverrides),
    [employees, reviewFilters, payrollOverrides],
  );

  const reviewTotals = React.useMemo(() => registerTotals(reviewRows), [reviewRows]);

  // The whole-month gross/net split evenly across the two semi-monthly cutoffs
  // (1st half = days 1–15, 2nd half = 16–end). Each half pays ½; together they
  // reconcile back to the whole-month figure shown in the register above.
  const halfBreakdown = React.useMemo(
    () => ({
      gross: splitIntoHalves(reviewTotals.gross_earnings ?? 0),
      dedn: splitIntoHalves(reviewTotals.total_dedn ?? 0),
      net: splitIntoHalves(reviewTotals.total_net ?? 0),
    }),
    [reviewTotals],
  );

  // Auto-detected payroll period from today's date, e.g. "July 2026". This is
  // the period the run defaults to — no manual month picking needed.
  const autoPeriod = React.useMemo(() => {
    const now = new Date();
    return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  // Flag when this agency scope has already been run for the detected period,
  // so the UI can warn before submitting a duplicate.
  const alreadyRun = React.useMemo(
    () => payrollRuns.some((r) => r.period === autoPeriod),
    [payrollRuns, autoPeriod],
  );

  const totalPaid = payrollRuns
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.gross, 0);

  // Proceed from the review modal: process the run directly so the period is
  // marked processed and its amounts show up in the Payroll Report. Scope maps
  // to runPayroll: undefined = all, "" = direct hires, else the agency name.
  const confirmRun = () => {
    const period = autoPeriod;
    const scope = agency === ALL_AGENCIES ? undefined : agency === DIRECT_HIRE ? "" : agency;
    runPayroll(period, scope);
    setReviewOpen(false);
    // Show a success illustration first; only go to the report when confirmed.
    void Swal.fire({
      imageUrl: PAYROLL_SUCCESS_IMAGE,
      imageWidth: 140,
      imageHeight: 140,
      imageAlt: "Payroll processed",
      title: "Payroll processed",
      text: `${period} · ${agency} (${reviewRows.length} ${reviewRows.length === 1 ? "employee" : "employees"}) is now processing.`,
      confirmButtonText: "View Payroll Report",
      showCancelButton: true,
      cancelButtonText: "Stay here",
    }).then((result) => {
      if (result.isConfirmed) navigate("/payroll/report");
    });
  };

  // Admin-only: revert a paid run back to "processed" (un-approve, keeps the run).
  const disapproveRun = (r: PayrollRun) => {
    disapprovePayrollRun(r.id);
    toast({ variant: "info", title: "Payroll disapproved", description: `${r.period} reverted to processed.` });
  };

  // Admin-only: permanently delete a run after confirmation.
  const deleteRun = (r: PayrollRun) => {
    void Swal.fire({
      icon: "warning",
      title: "Delete payroll run?",
      text: `This permanently removes the ${r.period} run. This cannot be undone.`,
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (!result.isConfirmed) return;
      removePayrollRun(r.id);
      toast({ variant: "info", title: "Payroll run deleted", description: `${r.period} run removed.` });
    });
  };

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Run payroll and review compensation."
        actions={
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payroll-agency">Agency</Label>
              <div className="flex items-center gap-2">
                <Select
                  id="payroll-agency"
                  className="h-11 w-44"
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                >
                  {agencyOptions.map((a) => (
                    <option key={a} value={a}>
                      {a} ({countFor(a)})
                    </option>
                  ))}
                </Select>
                {/* Live headcount for the selected agency scope. */}
                <span className="inline-flex h-11 items-center whitespace-nowrap rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary">
                  {scopedEmployees.length} {scopedEmployees.length === 1 ? "employee" : "employees"}
                </span>
              </div>
            </div>
            {/* Auto-detected payroll period (from today's date). */}
            <div className="space-y-1.5">
              <Label>Period (auto)</Label>
              <span
                className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-input bg-card px-3.5 text-sm font-medium text-foreground"
                title="Detected automatically from today's date"
              >
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                {autoPeriod}
                {alreadyRun && (
                  <span className="ml-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-600 dark:text-amber-400">
                    already run
                  </span>
                )}
              </span>
            </div>
            <Button
              size="lg"
              disabled={scopedEmployees.length === 0}
              onClick={() => setReviewOpen(true)}
            >
              <Play className="h-4 w-4" /> Run payroll
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card interactive>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Total paid (all runs)</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card interactive>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Headcount{agency !== ALL_AGENCIES && ` · ${agency}`}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{scopedEmployees.length}</p>
          </CardContent>
        </Card>
        <Card interactive>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Est. monthly gross</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatCurrency(Math.round(scopedEmployees.reduce((s, e) => s + e.salary, 0) / 12))}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {["Period", "Headcount", "Gross", "Status", "Created", ""].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payrollRuns.map((r) => (
                <tr key={r.id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                  <td className="px-4 py-3 pl-5 text-sm font-medium text-foreground">{r.period}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{r.headcount}</td>
                  <td className="px-4 py-3 text-sm font-medium tabular-nums">{formatCurrency(r.gross)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusChip status={statusChip[r.status]} />
                      {r.status === "processing" && (
                        <span className="text-xs text-muted-foreground">processing…</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View breakdown" onClick={() => setDetail(r)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {r.status !== "paid" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-success"
                          aria-label="Mark paid"
                          onClick={() => {
                            markPayrollPaid(r.id);
                            toast({ variant: "success", title: "Marked paid", description: `${r.period} completed.` });
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Admin-only: disapprove a paid run (revert to processed). */}
                      {isAdmin && r.status === "paid" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 dark:text-amber-400"
                          aria-label="Disapprove"
                          onClick={() => disapproveRun(r)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Admin-only: permanently delete a run. */}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label="Delete run"
                          onClick={() => deleteRun(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pre-run review: check every employee's amounts before proceeding. */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Review payroll — {autoPeriod}</DialogTitle>
            <DialogDescription>
              {agency} · {reviewRows.length} {reviewRows.length === 1 ? "employee" : "employees"}.
              Check every column below, then proceed to run.
              {alreadyRun && (
                <span className="mt-1 block font-medium text-amber-600 dark:text-amber-400">
                  A payroll run for {autoPeriod} already exists — submitting will create another.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="sticky left-0 z-20 whitespace-nowrap bg-muted/95 px-3 py-2.5 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Employee
                  </th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dept
                  </th>
                  {PAYROLL_REGISTER_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground last:pr-4"
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={PAYROLL_REGISTER_FIELDS.length + 2}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No employees in this scope.
                    </td>
                  </tr>
                ) : (
                  reviewRows.map((r) => (
                    <tr key={r.employee_id} className="border-t border-border even:bg-muted/25">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 pl-4 text-sm font-medium text-foreground">
                        {r.employee_name}
                        <span className="ml-1.5 text-xs text-muted-foreground">{r.employee_id}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">{r.dept_code}</td>
                      {PAYROLL_REGISTER_FIELDS.map((f) => (
                        <td
                          key={f.key}
                          className={cn(
                            "whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums last:pr-4",
                            f.key === "total_net" ? "font-semibold text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {formatCurrency(r[f.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-border bg-muted/60">
                <tr>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-muted/95 px-3 py-2.5 pl-4 text-sm font-semibold text-foreground">
                    Total ({reviewRows.length})
                  </td>
                  <td className="bg-muted/60 px-3 py-2.5" />
                  {PAYROLL_REGISTER_FIELDS.map((f) => (
                    <td
                      key={f.key}
                      className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground last:pr-4"
                    >
                      {formatCurrency(reviewTotals[f.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Whole-month total split into the two semi-monthly cutoffs. The
              register above shows the full month; each half pays ½ and the two
              halves reconcile back to it. */}
          {reviewRows.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "first" as const, label: "1st half", sub: "Days 1 – 15" },
                  { key: "second" as const, label: "2nd half", sub: "Days 16 – end" },
                ]
              ).map((half) => (
                <div
                  key={half.key}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">{half.label}</p>
                    <span className="text-xs text-muted-foreground">{half.sub}</span>
                  </div>
                  <div className="space-y-1.5">
                    {(
                      [
                        ["Gross", halfBreakdown.gross[half.key]],
                        ["Deductions", halfBreakdown.dedn[half.key]],
                        ["Net", halfBreakdown.net[half.key]],
                      ] as const
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between text-sm last:border-0"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            label === "Net" ? "font-semibold text-foreground" : "text-foreground",
                          )}
                        >
                          {formatCurrency(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRun} disabled={reviewRows.length === 0}>
              <ClipboardCheck className="h-4 w-4" /> Proceed &amp; run payroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.period} payroll</DialogTitle>
            <DialogDescription>Run {detail?.id}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              {[
                ["Headcount", String(detail.headcount)],
                ["Gross total", formatCurrency(detail.gross)],
                ["Avg. per employee", formatCurrency(Math.round(detail.gross / Math.max(detail.headcount, 1)))],
                ["Status", detail.status],
                ["Created", formatDate(detail.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium capitalize text-foreground">{v}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
