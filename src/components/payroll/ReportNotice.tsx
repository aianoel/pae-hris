/**
 * Inline empty/blocked state for an auto-loading report table.
 *
 * With auto-load there is no GET button to attach a modal to, so an unprocessed
 * period is surfaced quietly in the table body rather than as a SweetAlert that
 * would fire on every filter change.
 */
import { AlertTriangle, Loader2 } from "lucide-react";

import { ALL_AGENCIES } from "@/lib/payrollReports";

export function ReportNotice({
  blocked,
  settling,
  month,
  year,
  payclass,
  agency,
  /** What this report lists, e.g. "payslips" — used in the empty message. */
  noun,
}: {
  blocked: boolean;
  settling: boolean;
  month: string;
  year: string;
  payclass: string;
  /**
   * Agency the tab is filtered to. Named in the message so it is clear that
   * *this* agency is unprocessed — the period may well be processed for others.
   * Omitted by tabs that have no agency filter.
   */
  agency?: string;
  noun: string;
}) {
  if (settling) {
    return (
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm">Loading {noun}…</span>
      </div>
    );
  }

  // Name the agency when the tab is scoped to one, so "not processed" can't be
  // misread as the whole period being unprocessed.
  const scoped = agency && agency !== ALL_AGENCIES;
  const blockedMessage = scoped
    ? `No payroll has been processed for ${agency} for ${month} ${year}. Process payroll for this agency to see ${noun}.`
    : `No payroll has been processed for ${month} ${year}. Process payroll for this period to see ${noun}.`;

  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-6 w-6 text-amber-500" />
      <span className="text-sm">
        {blocked
          ? blockedMessage
          : `No employees registered in ${payclass} for ${month} ${year}.`}
      </span>
    </div>
  );
}
