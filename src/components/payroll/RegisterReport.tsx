import * as React from "react";
import { Printer, AlertTriangle, ArrowUpDown, Search, Check, X } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { cn } from "@/lib/utils";
import { printReport } from "@/lib/export";
import { Input } from "@/components/ui/input";
import {
  deptRegister,
  registerByDept,
  registerTotals,
  agencyFilterOptions,
  isPayrollProcessed,
  periodForFilters,
  ALL_AGENCIES,
  type DeptRegisterRow,
  type RegisterField,
  type RegisterNumericKey,
  type ReportFilters,
} from "@/lib/payrollReports";

const YEARS = ["2024", "2025", "2026", "2027"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PAYCLASSES = ["Tier 1", "Tier 2", "Tier 3", "Executive"];
const PAYTYPES = ["1st half", "2nd half", "Full month"];

const DEFAULT_FILTERS: ReportFilters = {
  year: "2026",
  month: "JUL",
  payclass: "Tier 1",
  paytype: "1st half",
  agency: ALL_AGENCIES,
};

/** Format a number to a fixed 2 decimals with thousands separators. */
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SortKey = "dept_code" | RegisterNumericKey;

export interface RegisterReportProps {
  /** Display name, e.g. "Payroll Register" — drives titles + print buttons. */
  registerName: string;
  /** Print-button verb, e.g. "PAYROLL REGISTER" / "EARNINGS REGISTER". */
  printLabel: string;
  /** Numeric columns for this tab (after the leading DEPT CODE column). */
  fields: RegisterField[];
  /** Unique id prefix for form controls (avoids duplicate ids across tabs). */
  idPrefix: string;
  /**
   * Enables inline editing. `editableKeys` become number inputs; `computedKeys`
   * stay read-only and are refreshed via `recompute` on every edit. Omit for a
   * read-only tab.
   */
  editableKeys?: RegisterNumericKey[];
  computedKeys?: RegisterNumericKey[];
  recompute?: (row: DeptRegisterRow) => Partial<Record<RegisterNumericKey, number>>;
  /** Show Approve/Disapprove for the loaded period's payroll run (Register tab). */
  approvable?: boolean;
}

/**
 * Generic dept-grouped register report — the shared shell behind the Payroll,
 * Earning and Deductions Register tabs. Filter by Year/Month/Payclass/Paytype,
 * hit GET to load the (in-memory, deterministically derived) data grouped by
 * department, sort any column, and print the full register or an employee-level
 * breakdown. Columns come from `fields`; only the column set differs per tab.
 */
export function RegisterReport({
  registerName,
  printLabel,
  fields,
  idPrefix,
  editableKeys,
  computedKeys,
  recompute,
  approvable,
}: RegisterReportProps) {
  const { employees, payrollRuns, payrollOverrides, approvePayrollPeriod, disapprovePayrollPeriod } =
    useStore();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const agencyOptions = React.useMemo(() => agencyFilterOptions(employees), [employees]);

  const editableSet = React.useMemo(() => new Set(editableKeys ?? []), [editableKeys]);
  const computedSet = React.useMemo(() => new Set(computedKeys ?? []), [computedKeys]);
  const editable = editableSet.size > 0;

  const [filters, setFilters] = React.useState<ReportFilters>(DEFAULT_FILTERS);
  // `applied` gates the empty state — nothing shows until GET is pressed.
  const [applied, setApplied] = React.useState<ReportFilters | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("dept_code");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const patch = (p: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...p }));

  // Raw per-employee rows (only recomputed when a query is applied via GET).
  const employeeRows = React.useMemo(
    () => (applied ? deptRegister(employees, applied, payrollOverrides) : []),
    [employees, applied, payrollOverrides],
  );
  const groupedRows = React.useMemo(() => registerByDept(employeeRows), [employeeRows]);

  // Editable overlay: the dept rows become mutable once loaded so inline edits
  // (and their recomputed totals) survive re-renders. Re-seeded on each GET.
  const [editedRows, setEditedRows] = React.useState<DeptRegisterRow[]>([]);
  React.useEffect(() => setEditedRows(groupedRows), [groupedRows]);
  const deptRows = editable ? editedRows : groupedRows;

  // Commit an edited cell, then refresh this row's computed roll-ups.
  const editCell = (deptCode: string, key: RegisterNumericKey, value: number) => {
    setEditedRows((prev) =>
      prev.map((r) => {
        if (r.dept_code !== deptCode) return r;
        const next = { ...r, [key]: value };
        return recompute ? { ...next, ...recompute(next) } : next;
      }),
    );
  };

  const rows = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...deptRows].sort((a, b) => {
      if (sortKey === "dept_code") return a.dept_code.localeCompare(b.dept_code) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [deptRows, sortKey, sortDir]);

  const totals = React.useMemo(() => registerTotals(deptRows), [deptRows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const onGet = () => {
    // Guard: refuse to load a register for a month/year that hasn't had payroll
    // processed yet — surface a SweetAlert instead of showing empty/derived data.
    if (!isPayrollProcessed(payrollRuns, filters.month, filters.year)) {
      void Swal.fire({
        icon: "warning",
        title: "Payroll not yet processed",
        text: `No payroll has been processed for ${filters.month} ${filters.year}. Process payroll for this period before viewing the ${registerName}.`,
        confirmButtonText: "OK",
      });
      return;
    }
    setApplied(filters);
    const n = registerByDept(deptRegister(employees, filters, payrollOverrides)).length;
    toast({
      variant: n ? "success" : "info",
      title: `${registerName} loaded`,
      description: `${filters.month} ${filters.year} · ${filters.payclass} · ${filters.paytype} · ${filters.agency} — ${n} departments.`,
    });
  };

  const scope = applied
    ? `${applied.month} ${applied.year} · ${applied.payclass} · ${applied.paytype} · ${applied.agency}`
    : undefined;

  // Build a print payload from the given rows (2-decimal formatted strings).
  const toPrintable = (source: DeptRegisterRow[], withEmployee: boolean) =>
    source.map((r) => {
      const base: Record<string, string> = { "DEPT CODE": r.dept_code };
      if (withEmployee) base["EMPLOYEE"] = r.employee_name || "—";
      for (const f of fields) base[f.label] = fmt(r[f.key]);
      return base;
    });

  const printRegister = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "Click GET to load data first." });
      return;
    }
    const ok = printReport(registerName, toPrintable(rows, false), { subtitle: scope });
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
    const ok = printReport(`${registerName} by Employee`, toPrintable(sorted, true), { subtitle: scope });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  // Approve/Disapprove act on the loaded period's payroll run. Only meaningful
  // once a period is applied (GET pressed) on an approvable tab.
  const appliedPeriod = applied ? periodForFilters(applied.month, applied.year) : null;
  const periodPaid = React.useMemo(
    () => Boolean(appliedPeriod) && payrollRuns.some((r) => r.period === appliedPeriod && r.status === "paid"),
    [payrollRuns, appliedPeriod],
  );

  const approve = () => {
    if (!appliedPeriod) return;
    approvePayrollPeriod(appliedPeriod);
    toast({ variant: "success", title: "Payroll approved", description: `${appliedPeriod} marked paid.` });
  };

  const disapprove = () => {
    if (!appliedPeriod) return;
    // Disapproving a processed payroll run is an admin-only action.
    if (!isAdmin) {
      toast({
        variant: "error",
        title: "Not permitted",
        description: "Only administrators can disapprove a payroll run.",
      });
      return;
    }
    void Swal.fire({
      icon: "warning",
      title: "Disapprove payroll?",
      text: `This removes the ${appliedPeriod} payroll run. The register will lock until payroll is re-run for this period.`,
      showCancelButton: true,
      confirmButtonText: "Disapprove",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (!result.isConfirmed) return;
      const removed = disapprovePayrollPeriod(appliedPeriod);
      setApplied(null); // lock the report again — the period is no longer processed
      toast({
        variant: removed ? "info" : "error",
        title: removed ? "Payroll disapproved" : "Nothing to disapprove",
        description: removed
          ? `${appliedPeriod} run removed — re-run payroll to view it again.`
          : `No payroll run found for ${appliedPeriod}.`,
      });
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter row: Year · Month · Payclass · Paytype · GET */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <ChipSelect id={`${idPrefix}-year`} label="Year" value={filters.year} options={YEARS} onChange={(v) => patch({ year: v })} />
        <ChipSelect id={`${idPrefix}-month`} label="Month" value={filters.month} options={MONTHS} onChange={(v) => patch({ month: v })} />
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-payclass`}>Payclass</Label>
          <Select id={`${idPrefix}-payclass`} className="h-11 w-40" value={filters.payclass} onChange={(e) => patch({ payclass: e.target.value })}>
            {PAYCLASSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-paytype`}>Paytype</Label>
          <Select id={`${idPrefix}-paytype`} className="h-11 w-40" value={filters.paytype} onChange={(e) => patch({ paytype: e.target.value })}>
            {PAYTYPES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-agency`}>Agency</Label>
          <Select id={`${idPrefix}-agency`} className="h-11 w-44" value={filters.agency} onChange={(e) => patch({ agency: e.target.value })}>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <Button className="h-11" onClick={onGet}>
          <Search className="h-4 w-4" /> GET
        </Button>
      </Card>

      {/* Print + approval actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={printRegister}>
          <Printer className="h-4 w-4" /> PRINT {printLabel}
        </Button>
        <Button variant="outline" onClick={printByEmployee}>
          <Printer className="h-4 w-4" /> PRINT {printLabel} BY EMPLOYEE
        </Button>
        {approvable && applied && (
          periodPaid ? (
            // Already approved (paid). Admins can still revert it via Disapprove.
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
                <Check className="h-4 w-4" /> Approved · paid
              </span>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={disapprove}
                >
                  <X className="h-4 w-4" /> Disapprove
                </Button>
              )}
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={disapprove}
                >
                  <X className="h-4 w-4" /> Disapprove
                </Button>
              )}
              <Button className="bg-success hover:bg-success/90" onClick={approve}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </div>
          )
        )}
      </div>

      {/* Register table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">{registerName}</h3>
          {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 pl-5 text-left align-bottom text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleSort("dept_code")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    DEPT CODE
                    <ArrowUpDown className={cn("h-3 w-3", sortKey === "dept_code" ? "text-foreground" : "opacity-40")} />
                  </button>
                </th>
                {fields.map((f) => (
                  <th
                    key={f.key}
                    className="whitespace-nowrap px-3 py-3 text-right align-bottom text-xs font-semibold uppercase tracking-wider text-muted-foreground last:pr-5"
                  >
                    {/* Earning-/deduction-code lookup rendered as subtext. */}
                    {f.code && (
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-primary/70">
                        {f.code}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSort(f.key)}
                      className="inline-flex flex-row-reverse items-center gap-1 hover:text-foreground"
                    >
                      {f.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === f.key ? "text-foreground" : "opacity-40")} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-6 w-6 text-amber-500" />
                      <span className="text-sm">Click Get to load data.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.dept_code} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                    <td className="whitespace-nowrap px-3 py-2.5 pl-5 text-sm font-medium text-foreground">{r.dept_code}</td>
                    {fields.map((f) => {
                      const isEditable = editableSet.has(f.key);
                      const isComputed = computedSet.has(f.key);
                      return (
                        <td
                          key={f.key}
                          className={cn(
                            "whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-foreground last:pr-5",
                            isComputed && "font-semibold",
                          )}
                        >
                          {isEditable ? (
                            <Input
                              type="number"
                              step="0.01"
                              aria-label={`${r.dept_code} ${f.label}`}
                              value={r[f.key]}
                              onChange={(e) =>
                                editCell(r.dept_code, f.key, Number(e.target.value) || 0)
                              }
                              className="h-8 w-28 px-2 py-1 text-right text-sm tabular-nums"
                            />
                          ) : (
                            fmt(r[f.key])
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="whitespace-nowrap px-3 py-3 pl-5 text-sm font-semibold text-foreground">Total Result</td>
                {fields.map((f) => (
                  <td key={f.key} className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-foreground last:pr-5">
                    {fmt(totals[f.key] ?? 0)}
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
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-3 text-primary">✓</span>
        <Select
          id={id}
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
