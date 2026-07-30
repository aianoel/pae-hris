import * as React from "react";
import { Printer, ArrowUpDown, Landmark, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { printReport, downloadCsv } from "@/lib/export";
import {
  payslipRows,
  bankFileRows,
  runsForPeriod,
  autoReportBrand,
  type PayslipRow,
} from "@/lib/payrollReports";
import { PAYROLL_PERIODS, FilterSelect, fmt } from "./reportFilters";
import { useReportFilters } from "./reportFilterContext";
import { useSettledFilters } from "./useAutoReport";
import { ReportNotice } from "./ReportNotice";

/** Sortable columns — the drag handle and row order are not sortable keys. */
type SortKey =
  | "employee_id" | "employee_name" | "department"
  | "basic" | "deductions" | "earnings" | "tax" | "net_pay";

const NUMERIC_COLUMNS: { key: Extract<SortKey, "basic" | "deductions" | "earnings" | "tax" | "net_pay">; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "deductions", label: "Deductions" },
  { key: "earnings", label: "Earnings" },
  { key: "tax", label: "Tax" },
  { key: "net_pay", label: "Net Pay" },
];

/**
 * Payslip report — one payslip line per employee for the shared Year/Month/
 * Payclass period, reloading automatically as those filters change (no Get
 * button). Payroll Period is local to this tab since it names the cutoff.
 *
 * Rows can be reordered by dragging the handle: the bank file and printout are
 * emitted in the on-screen order, so the payroll officer controls the sequence
 * of the disbursement batch. Sorting a column resets to that column's order.
 */
export function PayslipReport() {
  const { employees, agencies, payrollRuns, payrollOverrides, contributionRates } = useStore();
  const { toast } = useToast();
  const shared = useReportFilters();

  // Payroll Period defaults to the shared paytype but can be overridden here.
  const [period, setPeriod] = React.useState(shared.paytype);
  React.useEffect(() => setPeriod(shared.paytype), [shared.paytype]);

  const [sortKey, setSortKey] = React.useState<SortKey>("employee_name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filters = React.useMemo(
    () => ({ payclass: shared.payclass, month: shared.month, year: shared.year, period }),
    [shared.payclass, shared.month, shared.year, period],
  );
  const { settled, settling } = useSettledFilters(filters);

  // This tab reports every agency, so it only needs the period's runs to skip
  // employees whose agency was never processed.
  const periodRuns = React.useMemo(
    () => runsForPeriod(payrollRuns, shared.month, shared.year),
    [payrollRuns, shared.month, shared.year],
  );

  const loadedRows = React.useMemo(
    () => (shared.processed ? payslipRows(employees, settled, payrollOverrides, periodRuns) : []),
    // contributionRates: the statutory deduction lines are derived from the
    // configured brackets, so a rate edit must refresh these figures.
    [employees, settled, payrollOverrides, contributionRates, shared.processed, periodRuns],
  );

  const sorted = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...loadedRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [loadedRows, sortKey, sortDir]);

  // Manual row order (drag handle), re-seeded whenever the data or sort changes.
  const [rows, setRows] = React.useState<PayslipRow[]>([]);
  React.useEffect(() => setRows(sorted), [sorted]);

  const [dragId, setDragId] = React.useState<string | null>(null);

  /** Move the dragged row so it sits where `targetId` currently is. */
  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.employee_id === dragId);
      const to = prev.findIndex((r) => r.employee_id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const scope = `${shared.month} ${shared.year} · ${shared.payclass} · ${period}`;

  // Letterhead, detected from the payslips on the page: when they all belong to
  // one agency the printout is branded with its logo, otherwise it stays plain.
  const brand = React.useMemo(
    () => autoReportBrand(rows.map((r) => r.employee_id), employees, agencies),
    [rows, employees, agencies],
  );

  const totals = React.useMemo(
    () => ({
      basic: rows.reduce((s, r) => s + r.basic, 0),
      deductions: rows.reduce((s, r) => s + r.deductions, 0),
      earnings: rows.reduce((s, r) => s + r.earnings, 0),
      tax: rows.reduce((s, r) => s + r.tax, 0),
      net_pay: rows.reduce((s, r) => s + r.net_pay, 0),
    }),
    [rows],
  );

  const printPayslip = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "No payslips loaded for this period." });
      return;
    }
    const printable = rows.map((r) => ({
      "EMP CODE": r.employee_id,
      NAME: r.employee_name,
      DEPARTMENT: r.department,
      "ACCOUNT NO": r.account_no,
      BASIC: fmt(r.basic),
      DEDUCTIONS: fmt(r.deductions),
      EARNINGS: fmt(r.earnings),
      TAX: fmt(r.tax),
      "NET PAY": fmt(r.net_pay),
    }));
    const ok = printReport("Payslip", printable, {
      subtitle: scope,
      brand,
      totals: {
        "EMP CODE": "TOTAL",
        BASIC: fmt(totals.basic),
        DEDUCTIONS: fmt(totals.deductions),
        EARNINGS: fmt(totals.earnings),
        TAX: fmt(totals.tax),
        "NET PAY": fmt(totals.net_pay),
      },
    });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  // Bank disbursement file: one credit line per employee, in the on-screen order.
  const exportBankFile = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to export", description: "No payslips loaded for this period." });
      return;
    }
    // A CSV has no letterhead, so when the batch belongs to a single agency its
    // name goes in the filename — the only place the scope can be recorded.
    const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const agencyPart = brand ? `-${slug(brand.name)}` : "";
    downloadCsv(
      `bank-file-${shared.year}-${shared.month}-${slug(period)}${agencyPart}`,
      bankFileRows(rows),
    );
    toast({
      variant: "success",
      title: "Bank file exported",
      description: `${rows.length} credit lines · ${fmt(totals.net_pay)} total.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Only the tab-local filter lives here — Year/Month/Payclass are shared
          and set once in the page header. Data reloads automatically. */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <FilterSelect
          id="ps-period"
          label="Payroll Period"
          value={period}
          options={PAYROLL_PERIODS}
          onChange={setPeriod}
          className="w-44"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={exportBankFile}>
            <Landmark className="h-4 w-4" /> Export Bank File
          </Button>
          <Button variant="outline" className="h-11" onClick={printPayslip}>
            <Printer className="h-4 w-4" /> Print Payslip
          </Button>
        </div>
      </Card>

      {/* Payslip table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Payslip</h3>
          <p className="text-xs text-muted-foreground">
            {scope} · drag the handle to reorder — the bank file follows this order.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                <th className="w-10 px-3 py-3 pl-5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="sr-only">Reorder</span>
                </th>
                {([
                  { key: "employee_id", label: "Emp Code" },
                  { key: "employee_name", label: "Name" },
                  { key: "department", label: "Department" },
                ] as const).map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-foreground" : "opacity-40")} />
                    </button>
                  </th>
                ))}
                {NUMERIC_COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground last:pr-5">
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex flex-row-reverse items-center gap-1 hover:text-foreground">
                      {c.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-foreground" : "opacity-40")} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={NUMERIC_COLUMNS.length + 4} className="px-5 py-16 text-center">
                    <ReportNotice
                      blocked={!shared.processed}
                      settling={settling}
                      month={shared.month}
                      year={shared.year}
                      payclass={shared.payclass}
                      noun="payslips"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.employee_id}
                    draggable
                    onDragStart={() => setDragId(r.employee_id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder(r.employee_id)}
                    className={cn(
                      "border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70",
                      dragId === r.employee_id && "opacity-50",
                    )}
                  >
                    <td className="px-3 py-2.5 pl-5">
                      <GripVertical
                        className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing"
                        aria-label={`Reorder ${r.employee_name}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-foreground">{r.employee_id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-foreground">{r.employee_name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground">{r.department}</td>
                    {NUMERIC_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-foreground last:pr-5",
                          c.key === "net_pay" && "font-semibold",
                        )}
                      >
                        {fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="px-3 py-3 pl-5" />
                <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-foreground" colSpan={3}>
                  Total Result
                </td>
                {NUMERIC_COLUMNS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-foreground last:pr-5">
                    {fmt(totals[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
