import * as React from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import {
  CONTRIBUTION_TYPES,
  MONTHS,
  computeTotal,
  validateRate,
  type ContributionRate,
  type RateDraft,
  type ValidationResult,
} from "@/lib/contributions";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

const currentYear = 2026;
const YEARS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

interface RateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited, or null when creating. */
  editing: ContributionRate | null;
  /** Full table, for overlap/duplicate validation. */
  rates: ContributionRate[];
  onSubmit: (draft: RateDraft) => void;
}

const emptyDraft: RateDraft = {
  type: "SSS",
  salaryFrom: 0,
  salaryTo: 0,
  msc: 0,
  employerShare: 0,
  employeeShare: 0,
  effectiveMonth: 1,
  effectiveYear: currentYear,
  status: "active",
};

/** Create/edit form for a single contribution rate with live validation. */
export function RateFormDialog({
  open,
  onOpenChange,
  editing,
  rates,
  onSubmit,
}: RateFormDialogProps) {
  const [draft, setDraft] = React.useState<RateDraft>(emptyDraft);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTouched(false);
    setDraft(
      editing
        ? {
            type: editing.type,
            salaryFrom: editing.salaryFrom,
            salaryTo: editing.salaryTo,
            msc: editing.msc,
            employerShare: editing.employerShare,
            employeeShare: editing.employeeShare,
            effectiveMonth: editing.effectiveMonth,
            effectiveYear: editing.effectiveYear,
            status: editing.status,
          }
        : emptyDraft,
    );
  }, [open, editing]);

  const set = <K extends keyof RateDraft>(key: K, value: RateDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const total = computeTotal(draft.employerShare, draft.employeeShare);
  const validation: ValidationResult = validateRate(draft, rates, editing?.id);
  const err = (k: keyof ValidationResult["errors"]) =>
    touched ? validation.errors[k] : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validation.ok) return;
    onSubmit(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit contribution rate" : "New contribution rate"}</DialogTitle>
          <DialogDescription>
            Define the salary band and the employer / employee shares for this contribution type.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cr-type">Contribution type</Label>
              <Select
                id="cr-type"
                value={draft.type}
                onChange={(e) => set("type", e.target.value as RateDraft["type"])}
              >
                {CONTRIBUTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-status">Status</Label>
              <Select
                id="cr-status"
                value={draft.status}
                onChange={(e) => set("status", e.target.value as RateDraft["status"])}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-from">Salary range from</Label>
              <input
                id="cr-from"
                type="number"
                min={0}
                value={draft.salaryFrom}
                onChange={(e) => set("salaryFrom", Number(e.target.value))}
                className={fieldClass}
              />
              {err("salaryFrom") && <FieldError>{err("salaryFrom")}</FieldError>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-to">Salary range to</Label>
              <input
                id="cr-to"
                type="number"
                min={0}
                value={draft.salaryTo}
                onChange={(e) => set("salaryTo", Number(e.target.value))}
                className={fieldClass}
              />
              {err("salaryTo") && <FieldError>{err("salaryTo")}</FieldError>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cr-msc">Monthly Salary Credit (MSC)</Label>
              <input
                id="cr-msc"
                type="number"
                min={0}
                value={draft.msc}
                onChange={(e) => set("msc", Number(e.target.value))}
                className={fieldClass}
              />
              {err("msc") && <FieldError>{err("msc")}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-er">Employer share (ER)</Label>
              <input
                id="cr-er"
                type="number"
                min={0}
                value={draft.employerShare}
                onChange={(e) => set("employerShare", Number(e.target.value))}
                className={fieldClass}
              />
              {err("employerShare") && <FieldError>{err("employerShare")}</FieldError>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-ee">Employee share (EE)</Label>
              <input
                id="cr-ee"
                type="number"
                min={0}
                value={draft.employeeShare}
                onChange={(e) => set("employeeShare", Number(e.target.value))}
                className={fieldClass}
              />
              {err("employeeShare") && <FieldError>{err("employeeShare")}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-month">Effective month</Label>
              <Select
                id="cr-month"
                value={draft.effectiveMonth}
                onChange={(e) => set("effectiveMonth", Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-year">Effective year</Label>
              <Select
                id="cr-year"
                value={draft.effectiveYear}
                onChange={(e) => set("effectiveYear", Number(e.target.value))}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Auto-computed total */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total contribution (ER + EE)</span>
            <span className="text-lg font-semibold tabular-nums text-primary">
              {formatCurrency(total)}
            </span>
          </div>

          {touched && validation.errors.overlap && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{validation.errors.overlap}</span>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save changes" : "Add rate"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3 w-3" /> {children}
    </p>
  );
}
