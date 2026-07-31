import * as React from "react";
import { CalendarDays, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PAY_RULE_LABEL, leaveTypesForAgency, type LeaveType } from "@/lib/leave";
import {
  emptyLeaveRecordDraft,
  validateLeaveRecord,
  workingDaysInRecord,
  type LeaveRecord,
  type LeaveRecordDraft,
  type NewLeaveRecord,
} from "@/lib/leaveRecords";
import type { Employee } from "@/store/types";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

const errorClass = "border-destructive focus:border-destructive";

/** Today as ISO `YYYY-MM-DD`, in local time (not UTC — see parseIsoDate). */
function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Employee-facing leave application.
 *
 * Deliberately not the HR dialog with the employee field removed. Two rules
 * differ and both matter:
 *
 *  - The employee is fixed to the signed-in user and never selectable, so
 *    nobody can file against a colleague.
 *  - Status is forced to `pending`. HR's dialog can file something already
 *    approved, which is right for recording leave granted offline — but an
 *    employee approving their own request would defeat the approval queue, and
 *    `approved` is the status payroll honours when deciding whether to deduct.
 *
 * Everything else — validation, overlap detection, the pay-rule preview — is
 * the shared logic in lib/leaveRecords.ts, so a filing made here is subject to
 * exactly the same rules as one made by HR.
 */
export function ApplyLeaveDialog({
  open,
  onOpenChange,
  employee,
  leaveTypes,
  existing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The signed-in user's own employee record. */
  employee: Employee;
  leaveTypes: LeaveType[];
  /** This employee's existing records, for the overlap check. */
  existing: LeaveRecord[];
  onSubmit: (draft: NewLeaveRecord) => void;
}) {
  const [draft, setDraft] = React.useState<LeaveRecordDraft>(() => ({
    ...emptyLeaveRecordDraft(todayIso()),
    employeeId: employee.id,
    employeeName: employee.name,
  }));
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof LeaveRecordDraft | "overlap", string>>
  >({});

  // Reset on open so a cancelled filing doesn't leak into the next one. The
  // employee identity is re-applied here, never taken from user input.
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setDraft({
      ...emptyLeaveRecordDraft(todayIso()),
      employeeId: employee.id,
      employeeName: employee.name,
    });
  }, [open, employee.id, employee.name]);

  // Only the types this employee's agency entitles them to — an agency contract
  // may grant different leave from a direct hire's.
  const availableTypes = React.useMemo(
    () => leaveTypesForAgency(leaveTypes, employee.agency),
    [leaveTypes, employee.agency],
  );

  const selectedType = availableTypes.find((t) => t.id === draft.leaveTypeId);
  const workingDays = draft.startDate && draft.endDate ? workingDaysInRecord(draft) : 0;

  const set = <K extends keyof LeaveRecordDraft>(key: K, value: LeaveRecordDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] || e.overlap ? { ...e, [key]: undefined, overlap: undefined } : e));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLeaveRecord(draft, existing, leaveTypes);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    // Status is pinned server-of-record side, not read from the form: an
    // employee files a request, they do not grant it.
    onSubmit({
      employeeId: employee.id,
      employeeName: employee.name,
      leaveTypeId: draft.leaveTypeId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      reason: draft.reason,
      status: "pending",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Your request goes to HR for approval. You&apos;ll see it as pending until it&apos;s
            reviewed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="leave-type">Leave type</Label>
            <select
              id="leave-type"
              className={cn(fieldClass, errors.leaveTypeId && errorClass)}
              value={draft.leaveTypeId}
              onChange={(e) => set("leaveTypeId", e.target.value)}
            >
              <option value="">Select a leave type…</option>
              {availableTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
            {errors.leaveTypeId && (
              <p className="text-xs text-destructive">{errors.leaveTypeId}</p>
            )}
            {availableTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No leave types are available for your engagement. Contact HR.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-start">First day</Label>
              <input
                id="leave-start"
                type="date"
                className={cn(fieldClass, errors.startDate && errorClass)}
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-end">Last day</Label>
              <input
                id="leave-end"
                type="date"
                className={cn(fieldClass, errors.endDate && errorClass)}
                value={draft.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-reason">Reason</Label>
            <textarea
              id="leave-reason"
              rows={3}
              placeholder="Briefly explain your request…"
              className={cn(fieldClass, "h-auto py-3 leading-relaxed")}
              value={draft.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          </div>

          {/* The consequential fact: whether these days are paid. Surfaced
              before submitting so it is not a surprise found on the payslip. */}
          {selectedType && workingDays > 0 && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3.5 text-sm",
                selectedType.payRule === "paid"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-amber-500/20 bg-amber-500/5",
              )}
            >
              <Info
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  selectedType.payRule === "paid" ? "text-emerald-600" : "text-amber-600",
                )}
              />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  {workingDays} working {workingDays === 1 ? "day" : "days"}
                </span>{" "}
                · {PAY_RULE_LABEL[selectedType.payRule]}
                {selectedType.payRule === "unpaid" && " — these days will be deducted from your pay."}
              </p>
            </div>
          )}

          {errors.overlap && (
            <p className="text-sm text-destructive">{errors.overlap}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={availableTypes.length === 0}>
              <CalendarDays className="h-4 w-4" /> Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
