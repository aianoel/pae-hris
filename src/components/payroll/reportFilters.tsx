/**
 * Filter primitives and option lists shared by every Payroll Report tab —
 * the register tables (Payroll/Earning/Deductions/Overtime) plus the Payslip,
 * NET 15 and NET 15/30 views. Keeping the option lists in one place means
 * Payclass/Paytype/Period stay consistent across tabs.
 */
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const YEARS = ["2024", "2025", "2026", "2027"];
export const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
export const PAYCLASSES = ["Tier 1", "Tier 2", "Rank And File", "Confidentials"];
export const PAYTYPES = ["1st half", "2nd half", "Full month"];

/** Payroll Period options on the Payslip tab — same cutoffs as Paytype. */
export const PAYROLL_PERIODS = PAYTYPES;

/** Format a peso amount to a fixed 2 decimals with thousands separators. */
export const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A labelled select styled as a "chip" showing the selected value + checkmark. */
export function ChipSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-3 text-primary">✓</span>
        <Select
          id={id}
          className="h-11 w-28 pl-8 font-medium text-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o} className="text-foreground">{o}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** A plain labelled select for the wider filter fields (Payclass, Paytype…). */
export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  className = "w-40",
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        className={`h-11 ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </div>
  );
}
