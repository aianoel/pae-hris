import * as React from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONTRIBUTION_TYPES,
  MONTHS,
  type ContributionRate,
  type ContributionType,
} from "@/lib/contributions";

const ANY = "__any__";

interface GroupDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: ContributionRate[];
  onConfirm: (filter: { type?: ContributionType; month?: number; year?: number }) => void;
}

/** Bulk-delete contribution rates by type / month / year, with a match count. */
export function GroupDeleteDialog({ open, onOpenChange, rates, onConfirm }: GroupDeleteDialogProps) {
  const [type, setType] = React.useState<string>(ANY);
  const [month, setMonth] = React.useState<string>(ANY);
  const [year, setYear] = React.useState<string>(ANY);

  React.useEffect(() => {
    if (open) {
      setType(ANY);
      setMonth(ANY);
      setYear(ANY);
    }
  }, [open]);

  const years = React.useMemo(
    () => Array.from(new Set(rates.map((r) => r.effectiveYear))).sort((a, b) => b - a),
    [rates],
  );

  const filter = {
    type: type === ANY ? undefined : (type as ContributionType),
    month: month === ANY ? undefined : Number(month),
    year: year === ANY ? undefined : Number(year),
  };

  const matchCount = rates.filter(
    (r) =>
      (filter.type === undefined || r.type === filter.type) &&
      (filter.month === undefined || r.effectiveMonth === filter.month) &&
      (filter.year === undefined || r.effectiveYear === filter.year),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete contribution rates in bulk</DialogTitle>
          <DialogDescription>
            Remove all rates matching the criteria below. Leave a field as "Any" to ignore it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gd-type">Contribution type</Label>
            <Select id="gd-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value={ANY}>Any type</option>
              {CONTRIBUTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gd-month">Month</Label>
              <Select id="gd-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value={ANY}>Any month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gd-year">Year</Label>
              <Select id="gd-year" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value={ANY}>Any year</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <span className="font-semibold text-destructive">{matchCount}</span>{" "}
            <span className="text-muted-foreground">
              rate{matchCount === 1 ? "" : "s"} will be permanently deleted.
            </span>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-destructive hover:bg-destructive/90"
            disabled={matchCount === 0}
            onClick={() => {
              onConfirm(filter);
              onOpenChange(false);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete {matchCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
