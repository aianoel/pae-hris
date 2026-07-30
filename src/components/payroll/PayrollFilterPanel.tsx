import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Filter,
  Play,
  RefreshCw,
  Check,
  Eraser,
  Lock,
  CalendarRange,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "./SearchableSelect";

export interface PayrollFilters {
  agency: string;
  month: string;
  year: string;
  period: string;
  group: string;
  department: string;
  employeeType: string;
  frequency: string;
  holidayCount: string;
  cutoff: string;
}

export const ALL_AGENCIES = "All Agencies";
export const DIRECT_HIRE = "Direct hire";

export const DEFAULT_FILTERS: PayrollFilters = {
  agency: ALL_AGENCIES,
  month: "July",
  year: "2026",
  period: "July 1 – 15, 2026",
  group: "All Groups",
  department: "All Departments",
  employeeType: "All Types",
  frequency: "Semi-monthly",
  holidayCount: "1",
  cutoff: "Standard (1st – 15th)",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = ["2024", "2025", "2026", "2027"];
const PERIODS = ["July 1 – 15, 2026", "July 16 – 31, 2026", "June 16 – 30, 2026", "August 1 – 15, 2026"];
const GROUPS = ["All Groups", "Executives", "Managers", "Individual Contributors", "Interns"];
const TYPES = ["All Types", "Regular", "Probationary", "Contractual", "Part-time"];
const FREQUENCIES = ["Weekly", "Bi-weekly", "Semi-monthly", "Monthly"];
const CUTOFFS = ["Standard (1st – 15th)", "Mid-month (16th – 31st)", "End-of-month", "Custom range"];

interface PayrollFilterPanelProps {
  filters: PayrollFilters;
  departments: string[];
  /** Agency names available to scope the batch by (excludes the "All" sentinel). */
  agencies: string[];
  onChange: (patch: Partial<PayrollFilters>) => void;
  onGenerate: () => void;
  onApply: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onLock: () => void;
  locked?: boolean;
}

export function PayrollFilterPanel({
  filters,
  departments,
  agencies,
  onChange,
  onGenerate,
  onApply,
  onRefresh,
  onClear,
  onLock,
  locked,
}: PayrollFilterPanelProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  const fields: {
    key: keyof PayrollFilters;
    label: string;
    options?: string[];
    numeric?: boolean;
  }[] = [
    { key: "agency", label: "Agency", options: [ALL_AGENCIES, DIRECT_HIRE, ...agencies] },
    { key: "month", label: "Payroll Month", options: MONTHS },
    { key: "year", label: "Payroll Year", options: YEARS },
    { key: "period", label: "Payroll Period", options: PERIODS },
    { key: "group", label: "Payroll Group", options: GROUPS },
    { key: "department", label: "Department", options: ["All Departments", ...departments] },
    { key: "employeeType", label: "Employee Type", options: TYPES },
    { key: "frequency", label: "Pay Frequency", options: FREQUENCIES },
    { key: "holidayCount", label: "Holiday Count", numeric: true },
    { key: "cutoff", label: "Payroll Cut-off", options: CUTOFFS },
  ];

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Filter className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Payroll Period</p>
          <p className="text-xs text-muted-foreground">Scope the batch before you generate or lock it.</p>
        </div>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
          <CalendarRange className="h-3.5 w-3.5" />
          {filters.period}
        </span>
        <motion.span
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.2 }}
          className="ml-2 text-muted-foreground sm:ml-3"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f, i) => (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
            className="space-y-1.5"
          >
            <Label htmlFor={`filter-${f.key}`}>{f.label}</Label>
            {f.numeric ? (
              <Input
                id={`filter-${f.key}`}
                type="number"
                min={0}
                className="h-11"
                value={filters[f.key]}
                onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<PayrollFilters>)}
              />
            ) : (
              <SearchableSelect
                id={`filter-${f.key}`}
                aria-label={f.label}
                value={filters[f.key]}
                options={f.options ?? []}
                onChange={(v) => onChange({ [f.key]: v } as Partial<PayrollFilters>)}
              />
            )}
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-4">
        <Button onClick={onGenerate} disabled={locked}>
          <Play className="h-4 w-4" /> Generate Payroll
        </Button>
        <Button variant="outline" onClick={onApply}>
          <Check className="h-4 w-4" /> Apply
        </Button>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button variant="ghost" onClick={onClear}>
          <Eraser className="h-4 w-4" /> Clear Filters
        </Button>
              <Button
                variant="outline"
                className="ml-auto border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={onLock}
              >
                <Lock className="h-4 w-4" /> {locked ? "Payroll Locked" : "Lock Payroll"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
