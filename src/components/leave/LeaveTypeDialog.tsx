import * as React from "react";
import { Check, Building2, Globe2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_AGENCIES,
  agencyScopeOptions,
  emptyLeaveDraft,
  normalizeAgencies,
  validateLeaveType,
  type LeaveType,
  type LeaveTypeDraft,
} from "@/lib/leave";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

const errorClass = "border-destructive focus:border-destructive";

/**
 * Create/edit form for a leave type.
 *
 * The agency picker is the substantive part: "All agencies" is mutually
 * exclusive with the named agencies, so ticking it clears the rest and ticking
 * a named agency clears it. That mirrors `normalizeAgencies`, which collapses
 * the selection on save — doing it live keeps the checkboxes honest about what
 * will actually be stored.
 */
export function LeaveTypeDialog({
  open,
  onOpenChange,
  editing,
  existing,
  agencies,
  employeeAgencies,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited, or null to create a new type. */
  editing: LeaveType | null;
  /** The full catalogue, for uniqueness checks. */
  existing: LeaveType[];
  agencies: { name: string }[];
  /** Agencies referenced by employees, so an unregistered one stays pickable. */
  employeeAgencies: (string | undefined)[];
  onSubmit: (draft: LeaveTypeDraft) => void;
}) {
  const [draft, setDraft] = React.useState<LeaveTypeDraft>(emptyLeaveDraft);
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof LeaveTypeDraft, string>>
  >({});

  // Reset the form whenever the dialog opens, so a cancelled edit doesn't leak
  // into the next one.
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setDraft(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            description: editing.description,
            daysPerYear: editing.daysPerYear,
            payRule: editing.payRule,
            agencies: editing.agencies,
            carryOver: editing.carryOver,
            requiresApproval: editing.requiresApproval,
            status: editing.status,
          }
        : emptyLeaveDraft(),
    );
  }, [open, editing]);

  const options = React.useMemo(
    () => agencyScopeOptions(agencies, employeeAgencies),
    [agencies, employeeAgencies],
  );

  const set = <K extends keyof LeaveTypeDraft>(key: K, value: LeaveTypeDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Clear the field's error as soon as it's touched — re-validated on submit.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const allSelected = draft.agencies.includes(ALL_AGENCIES);

  const toggleAgency = (value: string) => {
    setErrors((e) => (e.agencies ? { ...e, agencies: undefined } : e));
    setDraft((d) => {
      if (value === ALL_AGENCIES) {
        // Ticking "all" replaces everything; unticking it leaves an empty
        // selection the user must fill (validation catches it).
        return { ...d, agencies: d.agencies.includes(ALL_AGENCIES) ? [] : [ALL_AGENCIES] };
      }
      // Selecting a named agency drops the all-agencies sentinel.
      const base = d.agencies.filter((a) => a !== ALL_AGENCIES);
      return {
        ...d,
        agencies: base.includes(value)
          ? base.filter((a) => a !== value)
          : [...base, value],
      };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLeaveType(draft, existing, editing?.id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit({ ...draft, agencies: normalizeAgencies(draft.agencies) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit leave type" : "New leave type"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this leave category and the agencies it applies to."
              : "Define a leave category and choose which agencies it applies to."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="leave-name">Name</Label>
              <input
                id="leave-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                className={cn(fieldClass, errors.name && errorClass)}
                placeholder="Vacation Leave"
                autoFocus
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-code">Code</Label>
              <input
                id="leave-code"
                value={draft.code}
                onChange={(e) => set("code", e.target.value)}
                className={cn(fieldClass, "uppercase", errors.code && errorClass)}
                placeholder="VL"
                maxLength={8}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-desc">Description</Label>
            <textarea
              id="leave-desc"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus"
              placeholder="Planned time off, filed in advance."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="leave-days">Days per year</Label>
              <input
                id="leave-days"
                type="number"
                min={0}
                max={365}
                value={draft.daysPerYear}
                onChange={(e) => set("daysPerYear", Number(e.target.value))}
                className={cn(fieldClass, errors.daysPerYear && errorClass)}
              />
              {errors.daysPerYear ? (
                <p className="text-xs text-destructive">{errors.daysPerYear}</p>
              ) : (
                <p className="text-xs text-muted-foreground">0 = unlimited</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-pay">Pay rule</Label>
              <Select
                id="leave-pay"
                value={draft.payRule}
                onChange={(e) => set("payRule", e.target.value as LeaveTypeDraft["payRule"])}
              >
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-status">Status</Label>
              <Select
                id="leave-status"
                value={draft.status}
                onChange={(e) => set("status", e.target.value as LeaveTypeDraft["status"])}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          {/* ---- Agency scope ---- */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <Label>Applies to</Label>
              <span className="text-xs text-muted-foreground">
                {allSelected
                  ? "Every agency"
                  : `${draft.agencies.length} selected`}
              </span>
            </div>
            <div
              className={cn(
                "space-y-1 rounded-xl border border-input bg-secondary/30 p-2",
                errors.agencies && "border-destructive",
              )}
            >
              {options.map((opt) => {
                const checked = draft.agencies.includes(opt.value);
                const isAll = opt.value === ALL_AGENCIES;
                // Named agencies are visually dimmed while "all" is on — they're
                // still clickable, and clicking one switches to a named scope.
                const dimmed = allSelected && !isAll;
                return (
                  <label
                    key={opt.value || "__direct__"}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-card",
                      checked && "bg-card",
                      dimmed && "opacity-50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAgency(opt.value)}
                    />
                    {isAll ? (
                      <Globe2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={cn("text-foreground", isAll && "font-medium")}>
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.agencies && <p className="text-xs text-destructive">{errors.agencies}</p>}
          </div>

          {/* ---- Rules ---- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-secondary/40">
              <Checkbox
                className="mt-0.5"
                checked={draft.carryOver}
                onCheckedChange={(v) => set("carryOver", v === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-foreground">Carry over</span>
                <span className="block text-xs text-muted-foreground">
                  Unused days roll into next year.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-secondary/40">
              <Checkbox
                className="mt-0.5"
                checked={draft.requiresApproval}
                onCheckedChange={(v) => set("requiresApproval", v === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-foreground">
                  Requires approval
                </span>
                <span className="block text-xs text-muted-foreground">
                  Must be filed before it&apos;s taken.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Check className="h-4 w-4" />
              {editing ? "Save changes" : "Create leave type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
