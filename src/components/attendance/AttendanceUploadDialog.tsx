import * as React from "react";
import { Upload, FileText, AlertTriangle, CheckCircle2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { parseAttendanceText, type ParseResult } from "@/lib/attendanceImport";
import { formatLateness } from "@/lib/tardiness";
import type { TimekeepingByEmployee } from "@/lib/payroll";
import type { Employee } from "@/store/types";

/** Accept plain-text logs (.txt/.csv/.log/.tsv) plus anything text/*. */
const ACCEPT = ".txt,.csv,.log,.tsv,text/plain";

/** An empty parse result, matching the shape the parser returns. */
const EMPTY_RESULT: ParseResult = {
  records: [],
  lwop: [],
  unmatchedBioIds: [],
  errors: [],
  range: null,
  workingDays: 0,
};

/**
 * Build a runnable biometric-log sample from real employees, so "Load sample"
 * always parses. Each line is one punch: `bioId  YYYY-MM-DD HH:MM:SS  …`.
 *
 * The sample is shaped to exercise each LWOP rule at once: employee A is on
 * time all week (no deduction), employee B punches in late every day (pro-rata
 * tardiness LWOP) and skips two days (whole-day LWOP), and one device row
 * matches no employee.
 */
function buildSample(employees: Employee[]): string {
  const withBio = employees.filter((e) => e.bioId);
  const [a, b] = withBio;
  const lines = ["# bioId  timestamp  verify  in/out  workcode  state  ext"];
  const punch = (bio: string, day: number, hh: string) =>
    `${bio}\t2026-07-${String(day).padStart(2, "0")} ${hh}\t1\t1\t${bio}\tI\t0`;

  // a: present and on time Mon–Fri (2026-07-13 is a Monday). Out at 18:00 so
  // the Telecom Report has a duty figure to show.
  if (a?.bioId) {
    for (let d = 13; d <= 17; d++) {
      lines.push(punch(a.bioId, d, "08:01:12"));
      lines.push(punch(a.bioId, d, "18:02:40"));
    }
  }
  // b: in at 09:45 on Mon & Tue (45 min late each → pro-rata LWOP), then absent
  // Wed–Fri (3 whole LWOP days).
  if (b?.bioId) {
    for (let d = 13; d <= 14; d++) {
      lines.push(punch(b.bioId, d, "09:45:00"));
      lines.push(punch(b.bioId, d, "18:00:00"));
    }
  }
  // An unmatched device id, to exercise the "unmatched" warning.
  lines.push(punch("99999", 13, "07:58:00"));
  return lines.join("\n");
}

export function AttendanceUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { employees, leaveRecords, importAttendance, setImportedLwop } = useStore();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const sample = React.useMemo(() => buildSample(employees), [employees]);

  // Parse live as the text changes so the preview stays in sync. Approved leave
  // is passed in so a filed leave day isn't charged as an absence — see the
  // module note in lib/attendanceImport.
  const result: ParseResult = React.useMemo(
    () => (text.trim() ? parseAttendanceText(text, employees, leaveRecords) : EMPTY_RESULT),
    [text, employees, leaveRecords],
  );

  const reset = () => {
    setFileName(null);
    setText("");
    setDragging(false);
  };

  const readFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: "error", title: "File too large", description: "Attendance files must be 5 MB or smaller." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.onerror = () =>
      toast({ variant: "error", title: "Couldn't read file", description: "Please try a plain-text file." });
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const doImport = () => {
    if (!result.records.length) return;
    const { added, updated } = importAttendance(result.records);

    // Hand the itemised timekeeping to the store so payroll can deduct each
    // charge on its own line: unpaid leave → LWOP, unexcused days → absences,
    // late arrivals → late. Approved paid leave is absent by construction.
    const timekeeping: TimekeepingByEmployee = {};
    for (const l of result.lwop) {
      if (l.lwopDays <= 0) continue;
      timekeeping[l.employeeId] = {
        absentDays: l.absentDays,
        unpaidLeaveDays: l.unpaidLeaveDays,
        tardyDays: l.tardyDays,
      };
    }
    if (Object.keys(timekeeping).length) setImportedLwop(timekeeping);

    const withLwop = result.lwop.filter((l) => l.lwopDays > 0).length;
    const lateDays = result.lwop.reduce((s, l) => s + l.lateCount, 0);
    const paidLeave = result.lwop.reduce((s, l) => s + l.paidLeaveDays, 0);
    toast({
      variant: "success",
      title: "Attendance imported",
      description: [
        `${added} added, ${updated} updated`,
        withLwop && `LWOP for ${withLwop} employee(s)`,
        lateDays && `${lateDays} late day(s) charged`,
        paidLeave && `${paidLeave} paid leave day(s) not deducted`,
        result.errors.length && `${result.errors.length} line(s) skipped`,
      ]
        .filter(Boolean)
        .join(" · ") + ".",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload attendance</DialogTitle>
          <DialogDescription>
            Import a biometric / timekeeping device log — one punch per line,
            starting with the Bio ID and a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">YYYY-MM-DD HH:MM:SS</code>{" "}
            timestamp. We match punches to employees by Bio ID and compute
            attendance plus leave-without-pay (LWOP) over the file's date range.
            A first punch after <strong>09:00</strong> is charged as LWOP
            pro-rata to the time missed, and days covered by approved leave are
            not deducted — paid leave costs nothing, unpaid leave deducts the day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone / file picker */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30",
            )}
          >
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readFile(file);
            }} />
            {fileName ? (
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText className="h-4 w-4 text-primary" /> {fileName}
                <button
                  type="button"
                  onClick={reset}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag a text file here, or{" "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => fileRef.current?.click()}>
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">.txt, .csv, .log, .tsv — up to 5 MB</p>
              </>
            )}
          </div>

          {/* Editable text — pre-filled from the file, or paste directly */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="att-text" className="text-sm font-medium text-foreground">
                Contents
              </label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setText(sample)}
              >
                Load sample
              </button>
            </div>
            <textarea
              id="att-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (!fileName) setFileName(null);
              }}
              rows={6}
              spellCheck={false}
              placeholder={sample}
              className="w-full rounded-xl border border-input bg-card p-3 font-mono text-xs text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus"
            />
          </div>

          {/* Parse summary */}
          {text.trim() && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                {result.records.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                {result.records.length} attendance record{result.records.length === 1 ? "" : "s"} ready
                {result.errors.length > 0 && ` · ${result.errors.length} line(s) skipped`}
              </div>

              {result.range && (
                <p className="text-xs text-muted-foreground">
                  Covers {result.range.from} → {result.range.to} · {result.workingDays} working day
                  {result.workingDays === 1 ? "" : "s"} (Mon–Fri).
                </p>
              )}

              {/* LWOP per employee, itemised by source so the total is
                  explainable: unexplained absences, approved unpaid leave, and
                  time lost to arriving after 09:00. Approved paid leave shows
                  in its own column precisely because it costs nothing. */}
              {result.lwop.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1 text-left font-medium">Employee</th>
                        <th className="px-2 py-1 text-right font-medium">Present</th>
                        <th className="px-2 py-1 text-right font-medium">Absent</th>
                        <th className="px-2 py-1 text-right font-medium" title="Approved paid leave — not deducted">
                          Paid leave
                        </th>
                        <th className="px-2 py-1 text-right font-medium" title="Approved unpaid leave — deducted">
                          Unpaid leave
                        </th>
                        <th className="px-2 py-1 text-right font-medium" title="Time lost to arriving after 09:00">
                          Late
                        </th>
                        <th className="px-2 py-1 text-right font-medium">LWOP days</th>
                        <th className="px-2 py-1 text-right font-medium">LWOP amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lwop.map((l) => (
                        <tr key={l.employeeId} className="border-b border-border/50 last:border-0">
                          <td className="whitespace-nowrap px-2 py-1 text-foreground">{l.employeeName}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                            {l.presentDays}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1 text-right tabular-nums",
                              l.absentDays > 0 ? "text-amber-600" : "text-muted-foreground",
                            )}
                          >
                            {l.absentDays || "—"}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1 text-right tabular-nums",
                              l.paidLeaveDays > 0 ? "text-emerald-600" : "text-muted-foreground",
                            )}
                          >
                            {l.paidLeaveDays || "—"}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1 text-right tabular-nums",
                              l.unpaidLeaveDays > 0 ? "text-amber-600" : "text-muted-foreground",
                            )}
                          >
                            {l.unpaidLeaveDays || "—"}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-2 py-1 text-right tabular-nums",
                              l.lateCount > 0 ? "text-amber-600" : "text-muted-foreground",
                            )}
                            title={
                              l.lateCount > 0
                                ? `${l.lateCount} late day(s) — ${l.tardyDays} day(s) deducted`
                                : undefined
                            }
                          >
                            {l.lateCount > 0 ? formatLateness(l.lateSeconds) : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1 text-right tabular-nums",
                              l.lwopDays > 0 ? "font-medium text-amber-600" : "text-muted-foreground",
                            )}
                          >
                            {l.lwopDays}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-foreground">
                            {l.amount > 0 ? formatCurrency(l.amount) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.unmatchedBioIds.length > 0 && (
                <p className="text-xs text-amber-600">
                  {result.unmatchedBioIds.length} Bio ID(s) matched no employee:{" "}
                  {result.unmatchedBioIds.slice(0, 8).join(", ")}
                  {result.unmatchedBioIds.length > 8 && "…"}
                </p>
              )}

              {result.errors.length > 0 && (
                <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-destructive">
                  {result.errors.slice(0, 20).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 20 && <li>…and {result.errors.length - 20} more.</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={doImport} disabled={result.records.length === 0}>
            <Upload className="h-4 w-4" /> Import {result.records.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
