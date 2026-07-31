import * as React from "react";
import { Check, CalendarDays, Info } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/payroll/SearchableSelect";
import { cn } from "@/lib/utils";
import { PAY_RULE_LABEL, leaveTypesForAgency, type LeaveType } from "@/lib/leave";
import {
  LEAVE_RECORD_STATUSES,
  LEAVE_STATUS_LABEL,
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
 * File-leave form.
 *
 * The leave-type list is scoped to the selected employee's agency: an agency's
 * contract may grant different leave from a direct hire's, so offering every
 * type would let HR file leave the employee isn't entitled to. Changing the
 * employee therefore clears a type that no longer applies.
 *
 * The pay-rule preview is the important affordance — it tells the filer, before
 * they save, whether these days will cost the employee pay. That is the single
 * fact that decides whether payroll deducts, so it should not be a surprise
 * discovered on the payslip.
 */
export function LeaveRecordDialog({
  open,
  onOpenChange,
  employees,
  leaveTypes,
  existing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  leaveTypes: LeaveType[];
  /** Existing records, for the overlap check. */
  existing: LeaveRecord[];
  onSubmit: (draft: NewLeaveRecord) => void;
}) {
  const [draft, setDraft] = React.useState<LeaveRecordDraft>(() =>
    emptyLeaveRecordDraft(todayIso()),
  );
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof LeaveRecordDraft | "overlap", string>>
  >({});

  // Reset on open so a cancelled filing doesn't leak into the next one.
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setDraft(emptyLeaveRecordDraft(todayIso()));
  }, [open]);

  // Only active staff can file leave; sorted so the picker is scannable.
  const options = React.useMemo(
    () =>
      employees
        .filter((e) => e.status !== "inactive")
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b)),
    [employees],
  );

  const selectedEmployee = React.useMemo(
    () => employees.find((e) => e.id === draft.employeeId),
    [employees, draft.employeeId],
  );

  // Types available to this employee's agency. Before an employee is picked we
  // show the active catalogue so the field isn't mysteriously empty.
  const availableTypes = React.useMemo(
    () =>
      selectedEmployee
        ? leaveTypesForAgency(leaveTypes, selectedEmployee.agency)
        : leaveTypes.filter((t) => t.status === "active"),
    [leaveTypes, selectedEmployee],
  );

  const selectedType = availableTypes.find((t) => t.id === draft.leaveTypeId);
  const workingDays = draft.startDate && draft.endDate ? workingDaysInRecord(draft) : 0;

  const set = <K extends keyof LeaveRecordDraft>(key: K, value: LeaveRecordDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] || e.overlap ? { ...e, [key]: undefined, overlap: undefined } : e));
  };

  const pickEmployee = (name: string) => {
    const emp = employees.find((e) => e.name === name);
    setErrors((e) => ({ ...e, employeeId: undefined, overlap: undefined }));
    setDraft((d) => {
      // Drop a type that doesn't apply to the new employee's agency, rather than
      // silently filing leave they aren't entitled to.
      const stillValid =
        emp && leaveTypesForAgency(leaveTypes, emp.agency).some((t) => t.id === d.leaveTypeId);
      return {
        ...d,
        employeeId: emp?.id ?? "",
        employeeName: emp?.name ?? "",
        leaveTypeId: stillValid ? d.leaveTypeId : "",
      };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLeaveRecord(draft, existing, leaveTypes);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File leave</DialogTitle>
          <DialogDescription>
            Record an employee&apos;s leave application. Once approved, an
            attendance import will mark these days as leave instead of deducting
            them as absences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lvr-employee">Employee</Label>
              <SearchableSelect
                id="lvr-employee"
                value={draft.employeeName}
                onChange={pickEmployee}
                options={options}
                placeholder="Select an employee…"
                aria-label="Employee"
              />
              {errors.employeeId && (
                <p className="text-xs text-destructive">{errors.employeeId}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lvr-type">Leave type</Label>
              <Select
                id="lvr-type"
                value={draft.leaveTypeId}
                onChange={(e) => set("leaveTypeId", e.target.value)}
                className={cn(errors.leaveTypeId && errorClass)}
              >
                <option value="">Select a type…</option>
                {availableTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name} ({PAY_RULE_LABEL[t.payRule]})
                  </option>
                ))}
              </Select>
              {errors.leaveTypeId ? (
                <p className="text-xs text-destructive">{errors.leaveTypeId}</p>
              ) : (
                availableTypes.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No active leave types apply to this employee&apos;s agency.
                  </p>
                )
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lvr-start">Start date</Label>
              <input
                id="lvr-start"
                type="date"
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={cn(fieldClass, errors.startDate && errorClass)}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lvr-end">End date</Label>
              <input
                id="lvr-end"
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(e) => set("endDate", e.target.value)}
                className={cn(fieldClass, errors.endDate && errorClass)}
              />
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lvr-status">Status</Label>
              <Select
                id="lvr-status"
                value={draft.status}
                onChange={(e) =>
                  set("status", e.target.value as LeaveRecordDraft["status"])
                }
              >
                {LEAVE_RECORD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAVE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lvr-reason">Reason</Label>
            <textarea
              id="lvr-reason"
              value={draft.reason}
              onChange={(e) => set("reason", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus"
              placeholder="Family matter."
            />
          </div>

          {errors.overlap && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive">
              {errors.overlap}
            </p>
          )}

          {/* Payroll effect — the one thing the filer must not be surprised by. */}
          {selectedType && workingDays > 0 && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs",
                selectedType.payRule === "paid"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
              )}
            >
              {selectedType.payRule === "paid" ? (
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                <strong>
                  {workingDays} working day{workingDays === 1 ? "" : "s"}
                </strong>{" "}
                (Mon–Fri).{" "}
                {selectedType.payRule === "paid"
                  ? "Paid leave — once approved, payroll will not deduct these days."
                  : "Unpaid leave — payroll will deduct these days as LWOP."}
                {draft.status !== "approved" && (
                  <>
                    {" "}
                    Only <strong>approved</strong> leave affects payroll; this is
                    filed as {LEAVE_STATUS_LABEL[draft.status].toLowerCase()}.
                  </>
                )}
              </span>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Check className="h-4 w-4" /> File leave
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
