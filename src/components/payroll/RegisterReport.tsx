import * as React from "react";
import { Printer, ArrowUpDown, Check, X } from "lucide-react";
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
  reportBrandFor,
  runCoversAgency,
  runsForPeriod,
  periodForFilters,
  ALL_AGENCIES,
  type DeptRegisterRow,
  type RegisterField,
  type RegisterNumericKey,
  type ReportFilters,
} from "@/lib/payrollReports";
import { fmt } from "./reportFilters";
import { useReportFilters } from "./reportFilterContext";
import { useSettledFilters } from "./useAutoReport";
import { ReportNotice } from "./ReportNotice";

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
 * Earning and Deductions Register tabs. Data is grouped by department for the
 * shared Year/Month/Payclass/Paytype period and reloads automatically as those
 * filters change (no GET button); sort any column, and print the full register
 * or an employee-level breakdown. Agency is the one filter local to each tab.
 * Columns come from `fields`; only the column set differs per tab.
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
  const {
    employees,
    agencies,
    payrollRuns,
    payrollOverrides,
    contributionRates,
    approvePayrollPeriod,
    disapprovePayrollPeriod,
  } = useStore();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const shared = useReportFilters();

  const agencyOptions = React.useMemo(() => agencyFilterOptions(employees), [employees]);

  const editableSet = React.useMemo(() => new Set(editableKeys ?? []), [editableKeys]);
  const computedSet = React.useMemo(() => new Set(computedKeys ?? []), [computedKeys]);
  const editable = editableSet.size > 0;

  // Agency is tab-local; the period filters come from the shared header.
  const [agency, setAgency] = React.useState(ALL_AGENCIES);
  const [sortKey, setSortKey] = React.useState<SortKey>("dept_code");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filters: ReportFilters = React.useMemo(
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
  // `contributionRates` is a dependency because the payroll engine reads the
  // configured brackets when deriving the statutory deduction lines — editing a
  // rate under Contributions must refresh the register.
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
      agencyProcessed ? deptRegister(employees, settled, payrollOverrides, {}, periodRuns) : [],
    [employees, settled, payrollOverrides, contributionRates, agencyProcessed, periodRuns],
  );
  const groupedRows = React.useMemo(() => registerByDept(employeeRows), [employeeRows]);

  // Editable overlay: the dept rows become mutable once loaded so inline edits
  // (and their recomputed totals) survive re-renders. Re-seeded on each reload.
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

  const scope = `${shared.month} ${shared.year} · ${shared.payclass} · ${shared.paytype} · ${agency}`;

  // Letterhead for the printout — set only when a specific agency is selected,
  // so "All Agencies" and "Direct hire" print unbranded.
  const brand = React.useMemo(() => reportBrandFor(agency, agencies), [agency, agencies]);

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
      toast({ variant: "info", title: "Nothing to print", description: `No ${registerName} data for this period.` });
      return;
    }
    const ok = printReport(registerName, toPrintable(rows, false), { subtitle: scope, brand });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  const printByEmployee = () => {
    if (!employeeRows.length) {
      toast({ variant: "info", title: "Nothing to print", description: `No ${registerName} data for this period.` });
      return;
    }
    const sorted = [...employeeRows].sort(
      (a, b) => a.dept_code.localeCompare(b.dept_code) || a.employee_name.localeCompare(b.employee_name),
    );
    const ok = printReport(`${registerName} by Employee`, toPrintable(sorted, true), { subtitle: scope, brand });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  // Approve/Disapprove act on the currently selected period's payroll run.
  const selectedPeriod = periodForFilters(shared.month, shared.year);
  // "Approved · paid" must reflect the agency on screen: a paid run for another
  // agency in the same period says nothing about this one.
  const periodPaid = React.useMemo(
    () =>
      payrollRuns.some(
        (r) => r.period === selectedPeriod && r.status === "paid" && runCoversAgency(r, agency),
      ),
    [payrollRuns, selectedPeriod, agency],
  );

  // Approve/disapprove only what is on screen — scoping by the selected agency
  // stops an action taken while viewing one agency from hitting the others.
  const scopeLabel = agency === ALL_AGENCIES ? selectedPeriod : `${selectedPeriod} · ${agency}`;

  const approve = () => {
    approvePayrollPeriod(selectedPeriod, agency);
    toast({ variant: "success", title: "Payroll approved", description: `${scopeLabel} marked paid.` });
  };

  const disapprove = () => {
    // Disapproving a processed payroll run is an admin-only action.
    if (!isAdmin) {
      toast({
        variant: "error",
        title: "Not permitted",
        description: "Only administrators can disapprove a payroll run.",
      });
      return;
    }
    // Destructive and hard to undo — keep the explicit confirmation here even
    // though the rest of the tab is now no-click.
    void Swal.fire({
      icon: "warning",
      title: "Disapprove payroll?",
      text: `This removes the ${scopeLabel} payroll run. The register will lock until payroll is re-run.`,
      showCancelButton: true,
      confirmButtonText: "Disapprove",
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (!result.isConfirmed) return;
      const removed = disapprovePayrollPeriod(selectedPeriod, agency);
      // The register locks itself: `agencyProcessed` goes false once the run
      // is gone, so the table empties without any extra state to reset.
      toast({
        variant: removed ? "info" : "error",
        title: removed ? "Payroll disapproved" : "Nothing to disapprove",
        description: removed
          ? `${scopeLabel} run removed — re-run payroll to view it again.`
          : `No payroll run found for ${scopeLabel}.`,
      });
    });
  };

  return (
    <div className="space-y-4">
      {/* Only Agency is tab-local — the period filters are shared and set once
          in the page header. The register reloads automatically. */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-agency`}>Agency</Label>
          <Select id={`${idPrefix}-agency`} className="h-11 w-44" value={agency} onChange={(e) => setAgency(e.target.value)}>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={printRegister}>
            <Printer className="h-4 w-4" /> PRINT {printLabel}
          </Button>
          <Button variant="outline" className="h-11" onClick={printByEmployee}>
            <Printer className="h-4 w-4" /> PRINT {printLabel} BY EMPLOYEE
          </Button>
        </div>
      </Card>

      {/* Approval actions */}
      <div className="flex flex-wrap items-center gap-2">
        {approvable && agencyProcessed && rows.length > 0 && (
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
          <p className="text-xs text-muted-foreground">{scope}</p>
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
                    <ReportNotice
                      blocked={!agencyProcessed}
                      settling={settling}
                      month={shared.month}
                      year={shared.year}
                      payclass={shared.payclass}
                      agency={agency}
                      noun={registerName.toLowerCase()}
                    />
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
