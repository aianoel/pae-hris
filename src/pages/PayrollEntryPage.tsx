import * as React from "react";
import { motion } from "framer-motion";
import {
  Undo2,
  Redo2,
  Save,
  Copy,
  Lock,
  ClipboardCheck,
  ChevronDown,
  Check,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import type { PayrollApproval } from "@/store/types";
import { cn, errorMessage } from "@/lib/utils";
import { downloadCsv } from "@/lib/export";
import { formatCurrency } from "@/lib/format";
import {
  buildPayrollRows,
  autoFillRow,
  recalcDerived,
  grossPay,
  totalDeductions,
  netPay,
  type PayrollRow,
  type PayrollFieldKey,
} from "@/lib/payroll";
import {
  DEFAULT_FILTERS,
  ALL_AGENCIES,
  DIRECT_HIRE,
  type PayrollFilters,
} from "@/components/payroll/PayrollFilterPanel";
import { PayrollGrid } from "@/components/payroll/PayrollGrid";
import { EmployeePayrollPanel } from "@/components/payroll/EmployeePayrollPanel";
import { BulkUpdateDialog, type BulkMode } from "@/components/payroll/BulkUpdateDialog";
import { QuickActionsMenu, buildQuickActions } from "@/components/payroll/QuickActionsMenu";

type RunStatus = "Draft" | "Processing" | "Completed" | "Locked";

const STATUS_BADGE: Record<RunStatus, string> = {
  Draft: "bg-secondary text-muted-foreground",
  Processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Completed: "bg-success/10 text-success",
  Locked: "bg-primary/10 text-primary",
};

export function PayrollEntryPage() {
  const {
    employees,
    addLog,
    timekeepingByEmployee,
    payrollOverrides,
    contributionRates,
    loans,
    employeeLoanEntries,
    payrollApprovals,
    approvePayroll,
    disapprovePayroll,
    savePayrollEntries,
  } = useStore();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  // Batch pending disapproval — confirmed before it is returned to Payroll.
  const [disapproving, setDisapproving] = React.useState<PayrollApproval | null>(null);

  // Once a batch is approved its amounts are frozen — the grid becomes
  // read-only until the approved batch is cleared/paid.
  const hasApproved = React.useMemo(
    () => payrollApprovals.some((a) => a.status === "approved"),
    [payrollApprovals],
  );

  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<RunStatus>("Draft");
  const [filters, setFilters] = React.useState<PayrollFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = React.useState<PayrollFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [panelRow, setPanelRow] = React.useState<PayrollRow | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  // Undo/redo history of the row set. Unpaid time (LWOP / absences / late) comes
  // from the latest biometric attendance import, keyed by employee id.
  const base = React.useMemo(
    () => buildPayrollRows(employees, timekeepingByEmployee, payrollOverrides),
    // contributionRates: Government Deductions is derived from the configured
    // SSS/PhilHealth/HDMF/Tax brackets, so a rate edit must rebuild the grid.
    // loans/employeeLoanEntries: the engine reads the resolved loan deductions
    // from module state (see setDeductionInputs), so a ledger change is not
    // visible in the grid unless it also invalidates this memo.
    [
      employees,
      timekeepingByEmployee,
      payrollOverrides,
      contributionRates,
      loans,
      employeeLoanEntries,
    ],
  );
  const [history, setHistory] = React.useState<PayrollRow[][]>([base]);
  const [cursor, setCursor] = React.useState(0);
  const rows = history[cursor];
  // Approved batches freeze the amounts, so the grid is locked either when the
  // user locks it manually or when an approved batch exists.
  const locked = status === "Locked" || hasApproved;

  React.useEffect(() => {
    // Rebuild when the underlying employees change (e.g. first load).
    setHistory([base]);
    setCursor(0);
  }, [base]);

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  // Apply agency / department / type filters to the visible rows.
  const visibleRows = React.useMemo(() => {
    return rows.filter((r) => {
      const agencyOk =
        appliedFilters.agency === ALL_AGENCIES ||
        (appliedFilters.agency === DIRECT_HIRE ? !r.agency : r.agency === appliedFilters.agency);
      const deptOk =
        appliedFilters.department === "All Departments" || r.department === appliedFilters.department;
      const typeOk =
        appliedFilters.employeeType === "All Types" || r.employeeType === appliedFilters.employeeType;
      return agencyOk && deptOk && typeOk;
    });
  }, [rows, appliedFilters]);

  const totals = React.useMemo(() => {
    const earnings = visibleRows.reduce((s, r) => s + grossPay(r), 0);
    const deductions = visibleRows.reduce((s, r) => s + totalDeductions(r), 0);
    return {
      employees: visibleRows.length,
      earnings,
      deductions,
      net: earnings - deductions,
    };
  }, [visibleRows]);

  // ---- History-aware mutation -------------------------------------------
  const commitRows = React.useCallback(
    (next: PayrollRow[]) => {
      setHistory((h) => [...h.slice(0, cursor + 1), next]);
      setCursor((c) => c + 1);
    },
    [cursor],
  );

  const editCell = (id: string, key: PayrollFieldKey, value: number) => {
    // Re-derive overtime/nightDiff/govDeductions/lwop after every edit so the
    // auto-calculated amounts (and gross/deductions/net) stay in sync.
    commitRows(rows.map((r) => (r.id === id ? recalcDerived({ ...r, [key]: value }) : r)));
    if (status === "Draft") setStatus("Processing");
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const applyBulk = (field: PayrollFieldKey, mode: BulkMode, amount: number) => {
    commitRows(
      rows.map((r) =>
        selected[r.id]
          ? recalcDerived({ ...r, [field]: mode === "set" ? amount : r[field] + amount })
          : r,
      ),
    );
    toast({ variant: "success", title: "Bulk update applied", description: `${selectedIds.length} employees updated.` });
    setSelected({});
  };

  const undo = () => cursor > 0 && setCursor((c) => c - 1);
  const redo = () => cursor < history.length - 1 && setCursor((c) => c + 1);

  // Persist the full row set for the selected period to the database.
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const count = await savePayrollEntries(appliedFilters.period, rows);
      toast({
        variant: "success",
        title: "Payroll saved",
        description: `${count} employee ${count === 1 ? "entry" : "entries"} saved for ${appliedFilters.period}.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Couldn't save payroll",
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  };

  // ---- Approval queue actions -------------------------------------------
  // Approving locks the batch amounts and starts the actual payroll run;
  // disapproving drops it and returns the batch to the Payroll module.
  const handleApprove = (a: PayrollApproval) => {
    approvePayroll(a.id);
    toast({
      variant: "success",
      title: "Payroll approved",
      description: `${a.period} · ${a.agencyLabel} approved — amounts are locked and the run has started.`,
    });
  };

  const handleDisapprove = (a: PayrollApproval) => {
    disapprovePayroll(a.id);
    toast({
      variant: "info",
      title: "Payroll disapproved",
      description: `${a.period} · ${a.agencyLabel} returned to the Payroll module for editing.`,
    });
  };

  const openEmployee = (row: PayrollRow) => {
    setPanelRow(row);
    setPanelOpen(true);
  };

  const exportRows = () => {
    downloadCsv(
      `payroll-${appliedFilters.period.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      visibleRows.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        department: r.department,
        position: r.position,
        agency: r.agency || "Direct hire",
        gross: grossPay(r),
        deductions: totalDeductions(r),
        net: netPay(r),
        status: r.status,
      })),
    );
    toast({ variant: "success", title: "Export ready", description: `${visibleRows.length} rows exported to CSV.` });
  };

  const quickActions = buildQuickActions({
    generate: () => {
      setStatus("Processing");
      addLog("payroll", `generated payroll for ${filters.period}`, `${totals.employees} employees`);
      toast({ variant: "info", title: "Payroll generated", description: `Draft created for ${filters.period}.` });
    },
    autofill: () => {
      commitRows(rows.map((r) => autoFillRow(r)));
      if (status === "Draft") setStatus("Processing");
      addLog("payroll", `auto-filled payroll for ${filters.period}`, `${rows.length} employees`);
      toast({ variant: "success", title: "Payroll auto-filled", description: "Earnings and deductions recomputed from HR data. All cells remain editable." });
    },
    import: () => toast({ variant: "info", title: "Import", description: "Drop an Excel or CSV file to import payroll." }),
    export: exportRows,
    pdf: () => toast({ variant: "info", title: "Export PDF", description: "Preparing a PDF of the current batch…" }),
    print: () => toast({ variant: "info", title: "Print", description: "Opening the print dialog…" }),
    email: () => toast({ variant: "info", title: "Email payslips", description: `Queued ${totals.employees} payslips.` }),
    preview: () => toast({ variant: "info", title: "Preview", description: "Opening payroll preview…" }),
    approve: () => {
      setStatus("Completed");
      addLog("payroll", `approved payroll for ${appliedFilters.period}`, `${totals.employees} employees`);
      toast({ variant: "success", title: "Payroll approved", description: `${appliedFilters.period} marked completed.` });
    },
  });

  return (
    <>
      <PageHeader
        title="Payroll Data Entry"
        description="Manage employee payroll adjustments, earnings, deductions, overtime, and allowances."
        actions={
          <div className="flex items-center gap-2">
            <div className="mr-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status</span>
              {(() => {
                // An approved batch freezes the grid regardless of the manual
                // run status, so reflect that in the badge.
                const displayStatus: RunStatus = hasApproved ? "Locked" : status;
                return (
                  <motion.span
                    key={displayStatus}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                      STATUS_BADGE[displayStatus],
                    )}
                  >
                    {hasApproved ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                    {displayStatus}
                  </motion.span>
                );
              })()}
            </div>
            <Button variant="outline" size="icon" aria-label="Undo" disabled={cursor === 0} onClick={undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Redo" disabled={cursor >= history.length - 1} onClick={redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setHistory([base]);
                setCursor(0);
                toast({ variant: "info", title: "Duplicated previous payroll", description: "Loaded last period as a starting point." });
              }}
            >
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            <QuickActionsMenu actions={quickActions} />
            <Button onClick={handleSave} disabled={saving || locked}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      <div className="space-y-6 pb-20">
        {/* Approval queue: batches submitted from the Run-payroll review. */}
        {payrollApprovals.length > 0 && (
          <Card className="overflow-hidden border-primary/30">
            <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Payroll approvals</h3>
              <span className="text-xs text-muted-foreground">
                Batches submitted from the Run-payroll review, awaiting approval.
              </span>
            </div>
            <div className="divide-y divide-border">
              {payrollApprovals.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {a.period} · {a.agencyLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.headcount} {a.headcount === 1 ? "employee" : "employees"} · Gross{" "}
                      {formatCurrency(a.gross)} · Net {formatCurrency(a.net)}
                    </p>
                  </div>
                  <ApprovalStatusMenu
                    approval={a}
                    onApprove={() => handleApprove(a)}
                    onDisapprove={() => setDisapproving(a)}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        <PayrollGrid
          rows={visibleRows}
          loading={loading}
          locked={locked}
          selected={selected}
          onSelectedChange={setSelected}
          onEdit={editCell}
          onOpenEmployee={openEmployee}
          onBulk={() => setBulkOpen(true)}
          onClearFilters={() => {
            setFilters(DEFAULT_FILTERS);
            setAppliedFilters(DEFAULT_FILTERS);
          }}
        />
      </div>

      <EmployeePayrollPanel row={panelRow} open={panelOpen} onOpenChange={setPanelOpen} />

      <BulkUpdateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selectedIds.length}
        onApply={applyBulk}
      />

      {/* Disapproving discards the submitted batch, so confirm it first.
          Approving is not confirmed here — it is reversible from the Payroll
          Report (Disapprove reverts a paid run). */}
      <ConfirmDialog
        open={Boolean(disapproving)}
        onOpenChange={(o) => !o && setDisapproving(null)}
        title="Disapprove payroll?"
        description={
          disapproving
            ? `${disapproving.period} · ${disapproving.agencyLabel} will be removed from the approval queue and returned to the Payroll module for editing.`
            : undefined
        }
        confirmLabel="Disapprove"
        destructive
        onConfirm={() => {
          if (disapproving) handleDisapprove(disapproving);
        }}
      />
    </>
  );
}

/**
 * Status control for a queued batch: the current approval state doubles as the
 * dropdown trigger, so the approver changes it in place rather than hunting for
 * a separate action. Approved batches keep the menu (with Approve marked and
 * disabled) so the state stays legible and Disapprove remains reachable.
 */
function ApprovalStatusMenu({
  approval,
  onApprove,
  onDisapprove,
}: {
  approval: PayrollApproval;
  onApprove: () => void;
  onDisapprove: () => void;
}) {
  const approved = approval.status === "approved";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Approval status for ${approval.period} — ${approval.agencyLabel}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            approved
              ? "bg-success/10 text-success hover:bg-success/20"
              : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {approved ? (
            <>
              <Lock className="h-3.5 w-3.5" /> Approved · locked
            </>
          ) : (
            <>
              <ClipboardCheck className="h-3.5 w-3.5" /> Pending approval
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Set approval status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={approved}
          onSelect={() => onApprove()}
          className="[&_svg]:text-success"
        >
          <Check /> Approve
          {approved && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => onDisapprove()}>
          <X /> Disapprove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
