import * as React from "react";
import { Printer, AlertTriangle, ArrowUpDown, Search } from "lucide-react";
import Swal from "sweetalert2";

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
  isPayrollProcessed,
  ALL_AGENCIES,
  OT_RATE_BANDS,
  OVERTIME_NUMERIC_COLUMNS,
  type OvertimeRow,
  type OvertimeFilters,
  type OvertimeNumericColumn,
} from "@/lib/payrollReports";

/** Column definitions in display order — dept code first, then the numerics. */
const COLUMNS: { key: "dept_code" | OvertimeNumericColumn; label: string; numeric: boolean }[] = [
  { key: "dept_code", label: "DEPT CODE", numeric: false },
  { key: "ndot_8_hrs", label: "NDOT 8 Hrs", numeric: true },
  { key: "ndot_8_pay", label: "NDOT 8 Pay", numeric: true },
  { key: "ot_hrs", label: "OT Hrs", numeric: true },
  ...OT_RATE_BANDS.map((b) => ({ key: `rate_${b}` as OvertimeNumericColumn, label: `${b}%`, numeric: true })),
];

const YEARS = ["2024", "2025", "2026", "2027"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PAYCLASSES = ["Tier 1", "Tier 2", "Tier 3", "Executive"];
const PAYTYPES = ["1st half", "2nd half", "Full month"];

const DEFAULT_FILTERS: OvertimeFilters = {
  year: "2026",
  month: "JUL",
  payclass: "Tier 1",
  paytype: "1st half",
  agency: ALL_AGENCIES,
};

/** Format a number to a fixed 2 decimals with thousands separators. */
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SortKey = "dept_code" | OvertimeNumericColumn;

/**
 * Overtime Register — filter by Year/Month/Payclass/Paytype, hit GET to load the
 * (in-memory, deterministically derived) data grouped by department, sort any
 * column, and print the full register or an employee-level breakdown.
 */
export function OvertimeRegister() {
  const { employees, payrollRuns, payrollOverrides } = useStore();
  const { toast } = useToast();

  const agencyOptions = React.useMemo(() => agencyFilterOptions(employees), [employees]);

  const [filters, setFilters] = React.useState<OvertimeFilters>(DEFAULT_FILTERS);
  // `loaded` gates the empty state — nothing shows until GET is pressed.
  const [applied, setApplied] = React.useState<OvertimeFilters | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("dept_code");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const patch = (p: Partial<OvertimeFilters>) => setFilters((f) => ({ ...f, ...p }));

  // Raw per-employee rows (only recomputed when a query is applied via GET).
  const employeeRows = React.useMemo(
    () => (applied ? overtimeRegister(employees, applied, payrollOverrides) : []),
    [employees, applied, payrollOverrides],
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

  const onGet = () => {
    // Guard: refuse to load overtime for a month/year that hasn't had payroll
    // processed yet — surface a SweetAlert instead of showing empty/derived data.
    if (!isPayrollProcessed(payrollRuns, filters.month, filters.year)) {
      void Swal.fire({
        icon: "warning",
        title: "Payroll not yet processed",
        text: `No payroll has been processed for ${filters.month} ${filters.year}. Process payroll for this period before viewing the Overtime Register.`,
        confirmButtonText: "OK",
      });
      return;
    }
    setApplied(filters);
    const n = overtimeRegister(employees, filters, payrollOverrides).length;
    toast({
      variant: n ? "success" : "info",
      title: "Overtime loaded",
      description: `${filters.month} ${filters.year} · ${filters.payclass} · ${filters.paytype} · ${filters.agency} — ${n} employees with OT.`,
    });
  };

  const scope = applied
    ? `${applied.month} ${applied.year} · ${applied.payclass} · ${applied.paytype} · ${applied.agency}`
    : undefined;

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
      toast({ variant: "info", title: "Nothing to print", description: "Click GET to load data first." });
      return;
    }
    const ok = printReport("Overtime Register", toPrintable(rows, false), { subtitle: scope });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  const printByEmployee = () => {
    if (!employeeRows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "Click GET to load data first." });
      return;
    }
    const sorted = [...employeeRows].sort(
      (a, b) => a.dept_code.localeCompare(b.dept_code) || a.employee_name.localeCompare(b.employee_name),
    );
    const ok = printReport("Overtime Register by Employee", toPrintable(sorted, true), { subtitle: scope });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  return (
    <div className="space-y-4">
      {/* Filter row: Year · Month · Payclass · Paytype · GET */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <ChipSelect label="Year" value={filters.year} options={YEARS} onChange={(v) => patch({ year: v })} />
        <ChipSelect label="Month" value={filters.month} options={MONTHS} onChange={(v) => patch({ month: v })} />
        <div className="space-y-1.5">
          <Label htmlFor="ot-payclass">Payclass</Label>
          <Select id="ot-payclass" className="h-11 w-40" value={filters.payclass} onChange={(e) => patch({ payclass: e.target.value })}>
            {PAYCLASSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-paytype">Paytype</Label>
          <Select id="ot-paytype" className="h-11 w-40" value={filters.paytype} onChange={(e) => patch({ paytype: e.target.value })}>
            {PAYTYPES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-agency">Agency</Label>
          <Select id="ot-agency" className="h-11 w-44" value={filters.agency} onChange={(e) => patch({ agency: e.target.value })}>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <Button className="h-11" onClick={onGet}>
          <Search className="h-4 w-4" /> GET
        </Button>
      </Card>

      {/* Print actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={printRegister}>
          <Printer className="h-4 w-4" /> PRINT OVERTIME REGISTER
        </Button>
        <Button variant="outline" onClick={printByEmployee}>
          <Printer className="h-4 w-4" /> PRINT OVERTIME REGISTER BY EMPLOYEE
        </Button>
      </div>

      {/* Overtime Register table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Overtime Register</h3>
          {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
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
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-6 w-6 text-amber-500" />
                      <span className="text-sm">Click Get to load data.</span>
                    </div>
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

/** A labelled select styled as a "chip" showing the selected value + checkmark. */
function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`ot-${label}`}>{label}</Label>
      <div className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-3 text-primary">✓</span>
        <Select
          id={`ot-${label}`}
          className="h-11 w-28 pl-8 font-medium text-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o} className="text-foreground">{o}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
