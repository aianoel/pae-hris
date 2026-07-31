import * as React from "react";
import { Search, Layers, CheckSquare, Square, Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  MATRIX_TYPES,
  EARNING_TYPES,
  CONTRIBUTION_DISPLAY_NAME,
  TYPE_TINT,
  type ContributionType,
  type EarningCode,
  type EarningsMatrix,
} from "@/lib/contributions";

interface ContributionMatrixProps {
  /** The earning codes included in each contribution's base. */
  matrix: EarningsMatrix;
  /** Toggle one earning code for the selected contribution type. */
  onToggle: (type: ContributionType, code: EarningCode) => void;
  /** Bulk set every earning for the selected type (Select all / Clear). */
  onSetAll: (type: ContributionType, codes: EarningCode[]) => void;
}

/**
 * Contribution Matrix — defines which earning types count toward the base used
 * to compute each contribution. Left panel selects a contribution type; right
 * panel checks the earnings included in that type's contributable/taxable base.
 */
export function ContributionMatrix({ matrix, onToggle, onSetAll }: ContributionMatrixProps) {
  const [selectedType, setSelectedType] = React.useState<ContributionType>(MATRIX_TYPES[0]);
  const [query, setQuery] = React.useState("");

  const included = matrix[selectedType] ?? [];

  const visibleEarnings = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EARNING_TYPES;
    return EARNING_TYPES.filter(
      (e) => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
    );
  }, [query]);

  const allCodes = React.useMemo(() => EARNING_TYPES.map((e) => e.code), []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
      {/* Panel A — Contributions (single-select) */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-3">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Contributions</h3>
        </div>
        <ul className="divide-y divide-border">
          {MATRIX_TYPES.map((type) => {
            const active = type === selectedType;
            const count = matrix[type]?.length ?? 0;
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    active ? "bg-primary/5" : "hover:bg-secondary/40",
                  )}
                  aria-pressed={active}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active ? "border-primary" : "border-muted-foreground/40",
                    )}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {CONTRIBUTION_DISPLAY_NAME[type]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {count} earning{count === 1 ? "" : "s"} in base
                    </span>
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-medium", TYPE_TINT[type])}>
                    {type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Panel B — Earnings Affected (checklist) */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex flex-col gap-3 border-b border-border bg-secondary/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Earnings Affected</h3>
            <p className="text-xs text-muted-foreground">
              Added to basic pay to form the base for{" "}
              <span className="font-medium text-foreground">{CONTRIBUTION_DISPLAY_NAME[selectedType]}</span>
              . Payroll brackets against this base, so a change here moves what is
              deducted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => onSetAll(selectedType, allCodes)}>
              <CheckSquare className="h-3.5 w-3.5" /> Select all
            </Button>
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => onSetAll(selectedType, [])}>
              <Square className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="sm:w-72">
            <Input
              placeholder="Search earnings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leadingIcon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-2.5 font-semibold">Incl.</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleEarnings.map((earning) => {
              const checked = included.includes(earning.code);
              return (
                <tr
                  key={earning.code}
                  className="cursor-pointer transition-colors hover:bg-secondary/40"
                  onClick={() => onToggle(selectedType, earning.code)}
                >
                  <td className="px-4 py-2.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(selectedType, earning.code)}
                      aria-label={`Include ${earning.label}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{earning.label}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{earning.description}</td>
                </tr>
              );
            })}
            {visibleEarnings.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Info className="h-6 w-6 opacity-50" />
                    <p className="text-sm">No earnings match “{query}”.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {included.length} of {EARNING_TYPES.length} earnings included
          </span>
        </div>
      </div>
    </div>
  );
}
