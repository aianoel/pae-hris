import * as React from "react";
import { Printer, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { printReport } from "@/lib/export";
import {
  overtimeRegister,
  overtimeByDept,
  overtimeTotals,
  overtimeCell,
  agencyFilterOptions,
  reportBrandFor,
  runsForPeriod,
  ALL_AGENCIES,
  OT_RATE_BANDS,
  OVERTIME_NUMERIC_COLUMNS,
  type OvertimeRow,
  type OvertimeFilters,
  type OvertimeNumericColumn,
} from "@/lib/payrollReports";
import { fmt } from "./reportFilters";
import { useReportFilters } from "./reportFilterContext";
import { useSettledFilters } from "./useAutoReport";
import { ReportNotice } from "./ReportNotice";

/** Column definitions in display order — dept code first, then the numerics. */
const COLUMNS: { key: "dept_code" | OvertimeNumericColumn; label: string; numeric: boolean }[] = [
  { key: "dept_code", label: "DEPT CODE", numeric: false },
  { key: "ndot_8_hrs", label: "NDOT 8 Hrs", numeric: true },
  { key: "ndot_8_pay", label: "NDOT 8 Pay", numeric: true },
  { key: "ot_hrs", label: "OT Hrs", numeric: true },
  ...OT_RATE_BANDS.map((b) => ({ key: `rate_${b}` as OvertimeNumericColumn, label: `${b}%`, numeric: true })),
];

type SortKey = "dept_code" | OvertimeNumericColumn;

/**
 * Overtime Register — dept-grouped overtime for the shared Year/Month/Payclass/
 * Paytype period, reloading automatically as those filters change (no GET
 * button). Sort any column, and print the full register or an employee-level
 * breakdown. Agency is the one filter that stays local to this tab.
 */
export function OvertimeRegister() {
  const { employees, agencies, payrollRuns, payrollOverrides } = useStore();
  const { toast } = useToast();
  const shared = useReportFilters();

  const agencyOptions = React.useMemo(() => agencyFilterOptions(employees), [employees]);

  const [agency, setAgency] = React.useState(ALL_AGENCIES);
  const [sortKey, setSortKey] = React.useState<SortKey>("dept_code");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filters: OvertimeFilters = React.useMemo(
    () => ({
      year: shared.year,
      month: shared.month,
      payclass: shared.payclass,
      paytype: shared.paytype,
      agency,
    }),
    [shared.year, shared.month, shared.payclass, shared.paytype, agency],
  );
  const { settled, settling } = useSettledFilters(filters);

  // Raw per-employee rows, recomputed automatically as the filters settle.
  // Processed-ness is per agency: an agency that was never run must stay empty
  // even when another agency has been processed for the same period.
  const agencyProcessed = shared.processedFor(agency);

  // The period's runs, so "All Agencies" reports only the agencies actually
  // processed rather than every employee on file.
  const periodRuns = React.useMemo(
    () => runsForPeriod(payrollRuns, shared.month, shared.year),
    [payrollRuns, shared.month, shared.year],
  );

  const employeeRows = React.useMemo(
    () =>
      agencyProcessed ? overtimeRegister(employees, settled, payrollOverrides, periodRuns) : [],
    [employees, settled, payrollOverrides, agencyProcessed, periodRuns],
  );
  const deptRows = React.useMemo(() => overtimeByDept(employeeRows), [employeeRows]);

  const rows = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...deptRows].sort((a, b) => {
      if (sortKey === "dept_code") return a.dept_code.localeCompare(b.dept_code) * dir;
      return (overtimeCell(a, sortKey) - overtimeCell(b, sortKey)) * dir;
    });
  }, [deptRows, sortKey, sortDir]);

  const totals = React.useMemo(() => overtimeTotals(deptRows), [deptRows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const scope = `${shared.month} ${shared.year} · ${shared.payclass} · ${shared.paytype} · ${agency}`;

  // Letterhead for the printout — set only when a specific agency is selected,
  // so "All Agencies" and "Direct hire" print unbranded.
  const brand = React.useMemo(() => reportBrandFor(agency, agencies), [agency, agencies]);

  // Build a print payload from the given rows (2-decimal formatted strings).
  const toPrintable = (source: OvertimeRow[], withEmployee: boolean) =>
    source.map((r) => {
      const base: Record<string, string> = { "DEPT CODE": r.dept_code };
      if (withEmployee) base["EMPLOYEE"] = r.employee_name || "—";
      for (const col of COLUMNS) {
        if (col.key === "dept_code") continue;
        base[col.label] = fmt(overtimeCell(r, col.key as OvertimeNumericColumn));
      }
      return base;
    });

  const printRegister = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "No overtime data for this period." });
      return;
    }
    const ok = printReport("Overtime Register", toPrintable(rows, false), { subtitle: scope, brand });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  const printByEmployee = () => {
    if (!employeeRows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "No overtime data for this period." });
      return;
    }
    const sorted = [...employeeRows].sort(
      (a, b) => a.dept_code.localeCompare(b.dept_code) || a.employee_name.localeCompare(b.employee_name),
    );
    const ok = printReport("Overtime Register by Employee", toPrintable(sorted, true), { subtitle: scope, brand });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  return (
    <div className="space-y-4">
      {/* Only Agency is tab-local — the period filters are shared and set once
          in the page header. The register reloads automatically. */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="ot-agency">Agency</Label>
          <Select id="ot-agency" className="h-11 w-44" value={agency} onChange={(e) => setAgency(e.target.value)}>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={printRegister}>
            <Printer className="h-4 w-4" /> PRINT OVERTIME REGISTER
          </Button>
          <Button variant="outline" className="h-11" onClick={printByEmployee}>
            <Printer className="h-4 w-4" /> PRINT OVERTIME REGISTER BY EMPLOYEE
          </Button>
        </div>
      </Card>

      {/* Overtime Register table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Overtime Register</h3>
          <p className="text-xs text-muted-foreground">{scope}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5",
                      col.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", col.numeric && "flex-row-reverse")}
                    >
                      {col.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === col.key ? "text-foreground" : "opacity-40")} />
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
                      blocked={!agencyProcessed}
                      settling={settling}
                      month={shared.month}
                      year={shared.year}
                      payclass={shared.payclass}
                      agency={agency}
                      noun="overtime"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.dept_code} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-sm first:pl-5 last:pr-5",
                          col.numeric ? "text-right tabular-nums text-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {col.key === "dept_code" ? r.dept_code : fmt(overtimeCell(r, col.key as OvertimeNumericColumn))}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="whitespace-nowrap px-3 py-3 pl-5 text-sm font-semibold text-foreground">Total Result</td>
                {OVERTIME_NUMERIC_COLUMNS.map((col) => (
                  <td key={col} className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-foreground last:pr-5">
                    {fmt(totals[col] ?? 0)}
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
