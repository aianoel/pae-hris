/**
 * Manual correction of one employee's day on the Attendance screen.
 *
 * The biometric import is the normal source of attendance, but it can't cover
 * everything: a device that failed to read a finger, someone who worked off-site,
 * a day that should have been filed as leave. This dialog is the by-hand path for
 * those — it writes the same `attendance_records` row the import would, so the
 * Telecom Report and the payroll deductions pick the correction up unchanged.
 *
 * Times are entered as `HH:MM` (the native time input) and stored as `HH:MM:SS`,
 * matching the device export. Seconds from an imported punch are preserved when
 * the field is left untouched — re-saving a row must not silently round its
 * punch times.
 */
import * as React from "react";
import { Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { timeToSeconds } from "@/lib/tardiness";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, AttendanceState } from "@/store/types";

const STATES: { value: AttendanceState; label: string; hint: string }[] = [
  { value: "present", label: "Present", hint: "On site — punch times count toward duty and lateness." },
  { value: "remote", label: "Remote", hint: "Worked off site. Times are optional." },
  { value: "absent", label: "Absent", hint: "No work performed — deducted as LWOP." },
  { value: "on-leave", label: "On leave", hint: "Covered by leave — exempt from a late charge." },
];

/** `HH:MM:SS` → `HH:MM` for the native time input (which rejects seconds). */
const toInputTime = (hms?: string) => (hms ? hms.slice(0, 5) : "");

/**
 * `HH:MM` → `HH:MM:SS`, keeping the original seconds when the minute is
 * unchanged. An admin who opens a row to fix the *state* shouldn't have the
 * imported punch quietly re-written from 08:01:12 to 08:01:00.
 */
function toStoredTime(input: string, original?: string): string | undefined {
  if (!input) return undefined;
  if (original && original.slice(0, 5) === input) return original;
  return `${input}:00`;
}

export interface AttendanceEditTarget {
  employeeId: string;
  employeeName: string;
  date: string;
  /** The stored record, when the day already has one. */
  record?: AttendanceRecord;
}

export function AttendanceEditDialog({
  target,
  onOpenChange,
}: {
  /** The day being edited; null closes the dialog. */
  target: AttendanceEditTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { upsertAttendanceDay, removeAttendanceDay } = useStore();
  const { toast } = useToast();

  const [state, setState] = React.useState<AttendanceState>("present");
  const [timeIn, setTimeIn] = React.useState("");
  const [timeOut, setTimeOut] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Reload the form whenever a different day is opened.
  React.useEffect(() => {
    if (!target) return;
    setState(target.record?.state ?? "present");
    setTimeIn(toInputTime(target.record?.timeIn));
    setTimeOut(toInputTime(target.record?.timeOut));
    setError(null);
  }, [target]);

  if (!target) return null;
  const { record } = target;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Mirrors the DB's chk_attendance_times constraint. Catching it here turns
    // a failed write into an inline message instead of a "couldn't save" toast.
    if (timeIn && timeOut && timeToSeconds(timeOut) < timeToSeconds(timeIn)) {
      setError("Time out must be at or after time in.");
      return;
    }
    // A time-out with no time-in has no duty span to measure and reads as a
    // half-recorded day; require the pair or neither.
    if (timeOut && !timeIn) {
      setError("Enter a time in as well, or clear the time out.");
      return;
    }

    upsertAttendanceDay({
      employeeId: target.employeeId,
      date: target.date,
      state,
      timeIn: toStoredTime(timeIn, record?.timeIn),
      timeOut: toStoredTime(timeOut, record?.timeOut),
    });
    toast({
      variant: "success",
      title: "Attendance updated",
      description: `${target.employeeName} — ${target.date}.`,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!record) return;
    removeAttendanceDay(record.id);
    toast({
      variant: "success",
      title: "Attendance removed",
      description: `${target.employeeName} — ${target.date}.`,
    });
    onOpenChange(false);
  };

  const fieldClass =
    "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{record ? "Edit attendance" : "Add attendance"}</DialogTitle>
          <DialogDescription>
            {target.employeeName} — {target.date}
            {!record && ". No record exists for this day yet; saving creates one."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="att-state">Status</Label>
            <Select
              id="att-state"
              value={state}
              onChange={(e) => setState(e.target.value as AttendanceState)}
            >
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {STATES.find((s) => s.value === state)?.hint}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="att-in">Time in</Label>
              <input
                id="att-in"
                type="time"
                value={timeIn}
                onChange={(e) => {
                  setTimeIn(e.target.value);
                  setError(null);
                }}
                className={cn(fieldClass, error && "border-destructive/70")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-out">Time out</Label>
              <input
                id="att-out"
                type="time"
                value={timeOut}
                onChange={(e) => {
                  setTimeOut(e.target.value);
                  setError(null);
                }}
                className={cn(fieldClass, error && "border-destructive/70")}
              />
            </div>
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Leave both blank for a day with no punches. Arriving after 09:00 is
              charged pro-rata as LWOP unless the day is on leave.
            </p>
          )}

          <DialogFooter className="mt-2">
            {/* Only offered for a stored row — there is nothing to delete on a
                blank day, and the button would be a no-op. */}
            {record && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                className="mr-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{record ? "Save changes" : "Add record"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
