/**
 * Shared filter state for the Payroll Report module.
 *
 * Every tab (the four registers, Payslip, NET 15, NET 15/30) reads the same
 * Year / Month / Payclass / Paytype selection from here, so the period is
 * chosen once and every view follows it — instead of re-picking filters on each
 * tab. Tab-specific fields (agency, payroll date) stay local to their view.
 *
 * The initial period is the latest month that actually has a payroll run
 * (see `latestProcessedPeriod`), falling back to the current calendar month, so
 * the report opens on real data rather than a hardcoded default.
 */
import * as React from "react";

import { useStore } from "@/store/store-context";
import { latestProcessedPeriod, isPayrollProcessed } from "@/lib/payrollReports";
import { MONTHS, YEARS } from "./reportFilters";

export interface SharedReportFilters {
  year: string;
  month: string;
  payclass: string;
  paytype: string;
}

interface ReportFilterContextValue extends SharedReportFilters {
  /** Merge a partial selection into the shared filters. */
  patch: (p: Partial<SharedReportFilters>) => void;
  /** True when the selected month/year has any processed payroll run. */
  processed: boolean;
  /**
   * True when the selected month/year has been processed *for that agency*.
   * Tabs with an Agency filter use this instead of {@link processed}, so an
   * agency that was never run shows the "not processed" notice rather than
   * another agency's figures.
   */
  processedFor: (agency: string) => boolean;
}

const ReportFilterContext = React.createContext<ReportFilterContextValue | null>(null);

export function useReportFilters() {
  const ctx = React.useContext(ReportFilterContext);
  if (!ctx) throw new Error("useReportFilters must be used within <ReportFilterProvider>");
  return ctx;
}

/** Current month/year as report-filter values, clamped to the Year dropdown. */
function currentPeriod(): SharedReportFilters {
  const now = new Date();
  const year = String(now.getFullYear());
  return {
    year: YEARS.includes(year) ? year : YEARS[YEARS.length - 1],
    month: MONTHS[now.getMonth()],
    payclass: "Tier 1",
    paytype: "1st half",
  };
}

export function ReportFilterProvider({ children }: { children: React.ReactNode }) {
  const { payrollRuns, ready } = useStore();

  const [filters, setFilters] = React.useState<SharedReportFilters>(currentPeriod);
  // Only auto-pick the period once; after that the user's choice is authoritative.
  const seeded = React.useRef(false);

  // Smart default: as soon as the store has loaded, jump to the newest period
  // that actually has payroll processed. Skipped if the user already picked.
  React.useEffect(() => {
    if (seeded.current || !ready) return;
    const latest = latestProcessedPeriod(payrollRuns);
    seeded.current = true;
    if (latest) setFilters((f) => ({ ...f, ...latest }));
  }, [ready, payrollRuns]);

  const patch = React.useCallback((p: Partial<SharedReportFilters>) => {
    seeded.current = true; // a manual change wins over the smart default
    setFilters((f) => ({ ...f, ...p }));
  }, []);

  const processed = isPayrollProcessed(payrollRuns, filters.month, filters.year);

  const processedFor = React.useCallback(
    (agency: string) => isPayrollProcessed(payrollRuns, filters.month, filters.year, agency),
    [payrollRuns, filters.month, filters.year],
  );

  const value = React.useMemo(
    () => ({ ...filters, patch, processed, processedFor }),
    [filters, patch, processed, processedFor],
  );

  return <ReportFilterContext.Provider value={value}>{children}</ReportFilterContext.Provider>;
}
