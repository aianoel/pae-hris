import * as React from "react";
import { Printer, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { printReport } from "@/lib/export";
import {
  net1530Rows,
  net1530Totals,
  runsForPeriod,
  autoReportBrand,
  type Net1530Row,
} from "@/lib/payrollReports";
import { fmt } from "./reportFilters";
import { useReportFilters } from "./reportFilterContext";
import { useSettledFilters } from "./useAutoReport";
import { ReportNotice } from "./ReportNotice";

type SortKey = "employee_name" | "account_no" | "net_15" | "net_30" | "total_net";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "employee_name", label: "Emp Name", numeric: false },
  { key: "account_no", label: "Account No.", numeric: false },
  { key: "net_15", label: "Net 15", numeric: true },
  { key: "net_30", label: "Net 30", numeric: true },
  { key: "total_net", label: "Total Net", numeric: true },
];

/**
 * NET 15/30 — both semi-monthly nets side by side per employee, with the
 * whole-month total. Data reloads automatically from the shared period filters;
 * only the payroll date (a print detail) is entered here.
 */
export function Net1530Report() {
  const { employees, agencies, payrollRuns, payrollOverrides, contributionRates } = useStore();
  const { toast } = useToast();
  const shared = useReportFilters();

  const [payrollDate, setPayrollDate] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("employee_name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filters = React.useMemo(
    () => ({ year: shared.year, month: shared.month, payclass: shared.payclass }),
    [shared.year, shared.month, shared.payclass],
  );
  const { settled, settling } = useSettledFilters(filters);

  // This tab reports every agency, so it only needs the period's runs to skip
  // employees whose agency was never processed.
  const periodRuns = React.useMemo(
    () => runsForPeriod(payrollRuns, shared.month, shared.year),
    [payrollRuns, shared.month, shared.year],
  );

  const loadedRows = React.useMemo(
    () => (shared.processed ? net1530Rows(employees, settled, payrollOverrides, periodRuns) : []),
    // contributionRates: net pay depends on the configured statutory brackets.
    [employees, settled, payrollOverrides, contributionRates, shared.processed, periodRuns],
  );

  const rows = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...loadedRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [loadedRows, sortKey, sortDir]);

  const totals = React.useMemo(() => net1530Totals(rows), [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const scope = [payrollDate, `${shared.month} ${shared.year}`, shared.payclass]
    .filter(Boolean)
    .join(" · ");

  // Letterhead, detected from the employees on the page: when they all belong to
  // one agency the printout is branded with its logo, otherwise it stays plain.
  const brand = React.useMemo(
    () => autoReportBrand(rows.map((r) => r.employee_id), employees, agencies),
    [rows, employees, agencies],
  );

  const print = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "No NET 15/30 data for this period." });
      return;
    }
    const printable = rows.map((r) => ({
      "EMP NAME": r.employee_name,
      "ACCOUNT NO.": r.account_no,
      "NET 15": fmt(r.net_15),
      "NET 30": fmt(r.net_30),
      "TOTAL NET": fmt(r.total_net),
    }));
    const ok = printReport("NET 15/30", printable, {
      subtitle: scope,
      brand,
      totals: {
        "EMP NAME": "TOTAL",
        "NET 15": fmt(totals.net_15),
        "NET 30": fmt(totals.net_30),
        "TOTAL NET": fmt(totals.total_net),
      },
    });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  return (
    <div className="space-y-4">
      {/* Only the payroll date lives here — the period filters are shared. */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="n1530-date">Payroll Date</Label>
          <Input
            id="n1530-date"
            type="date"
            value={payrollDate}
            onChange={(e) => setPayrollDate(e.target.value)}
            className="h-11 w-44"
          />
        </div>
        <Button variant="outline" className="ml-auto h-11" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </Card>

      {/* NET 15/30 table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">NET 15/30</h3>
          <p className="text-xs text-muted-foreground">{scope}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", c.numeric && "flex-row-reverse")}
                    >
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
                  <td colSpan={COLUMNS.length} className="px-5 py-16 text-center">
                    <ReportNotice
                      blocked={!shared.processed}
                      settling={settling}
                      month={shared.month}
                      year={shared.year}
                      payclass={shared.payclass}
                      noun="NET 15/30 data"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r: Net1530Row) => (
                  <tr key={r.employee_id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                    <td className="whitespace-nowrap px-3 py-2.5 pl-5 text-sm font-medium text-foreground">{r.employee_name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums text-muted-foreground">{r.account_no}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-foreground">{fmt(r.net_15)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-foreground">{fmt(r.net_30)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(r.total_net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="whitespace-nowrap px-3 py-3 pl-5 text-sm font-semibold text-foreground" colSpan={2}>
                  TOTAL
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(totals.net_15)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(totals.net_30)}</td>
                <td className="whitespace-nowrap px-3 py-3 pr-5 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(totals.total_net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
