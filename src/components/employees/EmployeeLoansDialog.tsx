import * as React from "react";
import { Plus, Trash2, Wallet } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store-context";
import type { Employee } from "@/store/types";
import {
  LOAN_TABS,
  type LoanEntry,
  type LoanTab,
  type LoanTabKey,
  computePerMonth,
  loanCutoffSplit,
  summarize,
  totalPerMonth,
  unpaidOf,
} from "@/lib/employeeLoans";

interface EmployeeLoansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

/** Blank add-form values for a tab (prefilled term for the fixed-plan tabs). */
function emptyDraft(tab: LoanTab) {
  return {
    amount: "",
    term: tab.fixedTermMonths ? String(tab.fixedTermMonths) : "",
    type: "",
    paid: "",
    date: todayIso(),
  };
}

type Draft = ReturnType<typeof emptyDraft>;

export function EmployeeLoansDialog({ open, onOpenChange, employee }: EmployeeLoansDialogProps) {
  const { toast } = useToast();
  const { loansForEmployee, addEmployeeLoanEntry, removeEmployeeLoanEntry } = useStore();
  const [active, setActive] = React.useState<LoanTabKey>(LOAN_TABS[0].key);

  // The employee's ledger, grouped per tab — derived from store state so it
  // updates live as entries are added/removed (persisted to the database).
  const loans = React.useMemo(
    () => loansForEmployee(employee?.id ?? ""),
    [loansForEmployee, employee?.id],
  );

  // Reset to the first tab whenever the dialog opens for a (different) record.
  React.useEffect(() => {
    if (open) setActive(LOAN_TABS[0].key);
  }, [open, employee]);

  const addEntry = (tab: LoanTab, draft: Omit<LoanEntry, "id" | "control" | "perMonth">) => {
    if (!employee) return;
    addEmployeeLoanEntry(draft);
    toast({
      variant: "success",
      title: `${tab.label} added`,
      description: `${formatCurrency(draft.amount)} recorded.`,
    });
  };

  const removeEntry = (id: string) => removeEmployeeLoanEntry(id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Loans — {employee?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            Track loans and deductions per category. Amounts are in PHP and saved automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={active} onValueChange={(v) => setActive(v as LoanTabKey)}>
          <TabsList className="flex h-auto flex-wrap">
            {LOAN_TABS.map((t) => {
              const count = loans[t.key].length;
              return (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                  {t.label}
                  {count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1 text-[0.65rem] font-semibold text-primary">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {LOAN_TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="space-y-4">
              <LoanTabPanel
                tab={t}
                entries={loans[t.key]}
                employeeId={employee?.id ?? ""}
                payClass={employee?.payClass}
                onAdd={(draft) => addEntry(t, draft)}
                onRemove={removeEntry}
              />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface LoanTabPanelProps {
  tab: LoanTab;
  entries: LoanEntry[];
  /** Owning employee — stamped onto each new ledger line. */
  employeeId: string;
  /** Employee pay class — drives how the monthly deduction splits across cutoffs. */
  payClass?: string;
  onAdd: (draft: Omit<LoanEntry, "id" | "control" | "perMonth">) => void;
  onRemove: (id: string) => void;
}

function LoanTabPanel({ tab, entries, employeeId, payClass, onAdd, onRemove }: LoanTabPanelProps) {
  const [draft, setDraft] = React.useState<Draft>(() => emptyDraft(tab));
  const [errors, setErrors] = React.useState<Partial<Record<keyof Draft, string>>>({});

  // Reset the add form when switching to a different tab.
  React.useEffect(() => {
    setDraft(emptyDraft(tab));
    setErrors({});
  }, [tab]);

  const summary = React.useMemo(() => summarize(entries), [entries]);

  // How this category's total monthly deduction lands across the two payroll
  // cutoffs, per the employee's pay class (Confidentials = 1st-half only,
  // Rank And File / others = split evenly).
  const monthly = React.useMemo(() => totalPerMonth(entries), [entries]);
  const cutoff = React.useMemo(() => loanCutoffSplit(monthly, payClass), [monthly, payClass]);
  const isConfidential = payClass === "Confidentials";

  const amountNum = Number(draft.amount);
  const paidNum = Number(draft.paid || 0);
  const previewPerMonth = computePerMonth(amountNum || 0, draft.term);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.amount || Number.isNaN(amountNum) || amountNum <= 0)
      next.amount = "Enter an amount greater than zero.";
    if (!draft.term.trim()) next.term = "Term is required.";
    if (paidNum < 0) next.paid = "Cannot be negative.";
    if (paidNum > amountNum) next.paid = "Paid can't exceed the amount.";
    if (!draft.date) next.date = "Date is required.";
    setErrors(next);
    if (Object.keys(next).length) return;

    onAdd({
      employeeId,
      tab: tab.key,
      amount: Math.round(amountNum),
      term: draft.term.trim(),
      type: draft.type.trim(),
      date: draft.date,
      paid: Math.round(paidNum),
    });
    setDraft(emptyDraft(tab));
    setErrors({});
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Entries" value={String(summary.count)} />
        <SummaryTile label="Total Amount" value={formatCurrency(summary.totalAmount)} />
        <SummaryTile label="Total Paid" value={formatCurrency(summary.totalPaid)} tone="success" />
        <SummaryTile label="Total Unpaid" value={formatCurrency(summary.totalUnpaid)} tone="warning" />
      </div>

      {/* Cutoff split — how the monthly deduction lands across the two halves,
          driven by the employee's pay class. */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Monthly deduction</p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(monthly)}</p>
          </div>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              isConfidential
                ? "bg-primary/10 text-primary"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {payClass ?? "Tier 1"}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">1st half</p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(cutoff.first)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">2nd half</p>
            <p className="text-base font-semibold tabular-nums text-muted-foreground">
              {formatCurrency(cutoff.second)}
            </p>
          </div>
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {isConfidential
          ? "Confidentials: the full loan is deducted once, in the 1st half."
          : `${payClass ?? "Rank And File"}: the loan is split evenly across the 1st and 2nd half.`}
      </p>

      {/* Entries table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5">Amount</th>
              <th className="px-3 py-2.5">{tab.termLabel}</th>
              <th className="px-3 py-2.5">Per Month</th>
              <th className="px-3 py-2.5">{tab.typeLabel}</th>
              <th className="px-3 py-2.5">Paid</th>
              <th className="px-3 py-2.5">Unpaid</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Control</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No {tab.label} entries yet. Add one below.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums">
                    {formatCurrency(entry.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{entry.term}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {formatCurrency(entry.perMonth)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{entry.type || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-success">
                    {formatCurrency(Math.min(entry.paid, entry.amount))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {formatCurrency(unpaidOf(entry))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {formatDate(entry.date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {entry.control}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onRemove(entry.id)}
                      aria-label="Remove entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="rounded-xl border border-dashed border-border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Add {tab.label}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${tab.key}-amount`}>Amount (PHP)</Label>
            <input
              id={`${tab.key}-amount`}
              type="number"
              min={0}
              step={100}
              value={draft.amount}
              onChange={(e) => set("amount", e.target.value)}
              className={cn(fieldClass, errors.amount && "border-destructive/70")}
              placeholder="0"
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${tab.key}-term`}>{tab.termLabel}</Label>
            <input
              id={`${tab.key}-term`}
              value={draft.term}
              onChange={(e) => set("term", e.target.value)}
              disabled={Boolean(tab.fixedTermMonths)}
              className={cn(fieldClass, errors.term && "border-destructive/70", tab.fixedTermMonths && "opacity-70")}
              placeholder={tab.termPlaceholder}
            />
            {errors.term && <p className="text-xs text-destructive">{errors.term}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Per Month</Label>
            <div className={cn(fieldClass, "flex items-center bg-muted/40 tabular-nums text-muted-foreground")}>
              {formatCurrency(previewPerMonth)}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${tab.key}-type`}>{tab.typeLabel}</Label>
            <input
              id={`${tab.key}-type`}
              value={draft.type}
              onChange={(e) => set("type", e.target.value)}
              className={fieldClass}
              placeholder={tab.typePlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${tab.key}-paid`}>Paid (optional)</Label>
            <input
              id={`${tab.key}-paid`}
              type="number"
              min={0}
              step={100}
              value={draft.paid}
              onChange={(e) => set("paid", e.target.value)}
              className={cn(fieldClass, errors.paid && "border-destructive/70")}
              placeholder="0"
            />
            {errors.paid && <p className="text-xs text-destructive">{errors.paid}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${tab.key}-date`}>Date Created</Label>
            <input
              id={`${tab.key}-date`}
              type="date"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
              className={cn(fieldClass, errors.date && "border-destructive/70")}
            />
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit">
            <Plus className="h-4 w-4" /> Add entry
          </Button>
        </div>
      </form>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums tracking-tight",
          tone === "success" && "text-success",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
