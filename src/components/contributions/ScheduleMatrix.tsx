import * as React from "react";
import { Grid3x3, Info, Pencil, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  buildScheduleMatrix,
  ratePeriods,
  monthLabel,
  computeTotal,
  validateRate,
  TYPE_TINT,
  type ContributionRate,
  type MatrixRow,
} from "@/lib/contributions";

/**
 * Cross-tab "official schedule" view: salary brackets down the side,
 * contribution types across the top. Each cell shows EE / ER and the total for
 * that bracket × type. Toggle edit mode to change EE/ER inline — commits flow
 * through the store, which recomputes the total automatically.
 */
export function ScheduleMatrix({ rates }: { rates: ContributionRate[] }) {
  const { updateContributionRate } = useStore();
  const { toast } = useToast();

  const periods = React.useMemo(() => ratePeriods(rates), [rates]);
  const [periodKey, setPeriodKey] = React.useState<string>(
    periods[0] ? `${periods[0].year}-${periods[0].month}` : "",
  );
  const [editMode, setEditMode] = React.useState(false);

  // Fall back to the newest period if the selected one disappears.
  const period =
    periods.find((p) => `${p.year}-${p.month}` === periodKey) ?? periods[0] ?? null;

  const matrix = React.useMemo(
    () => (period ? buildScheduleMatrix(rates, period) : null),
    [rates, period],
  );

  const commitCell = (rate: ContributionRate, ee: number, er: number) => {
    if (ee === rate.employeeShare && er === rate.employerShare) return;
    updateContributionRate(rate.id, { employeeShare: ee, employerShare: er });
    toast({
      variant: "success",
      title: "Rate updated",
      description: `${rate.type} · ${formatCurrency(rate.salaryFrom)}–${formatCurrency(rate.salaryTo)} → total ${formatCurrency(computeTotal(er, ee))}.`,
    });
  };

  /**
   * Apply a new salary range to every rate that owns this matrix row (i.e. whose
   * band exactly spans the row). Each affected rate is validated against the
   * rest of the table so we don't create overlaps; if any clashes, nothing is
   * saved and we surface the reason.
   */
  const commitRange = (row: MatrixRow, from: number, to: number) => {
    if (from === row.from && to === row.to) return;
    if (to <= from) {
      toast({ variant: "error", title: "Invalid range", description: "Salary To must be greater than Salary From." });
      return;
    }

    const owned = matrix!.types
      .map((t) => row.cells[t].rate)
      .filter((r): r is ContributionRate => Boolean(r) && r!.salaryFrom === row.from && r!.salaryTo === row.to);

    if (!owned.length) return;

    // Validate each affected rate's new range against the others.
    for (const rate of owned) {
      const draft = { ...rate, salaryFrom: from, salaryTo: to };
      const result = validateRate(draft, rates, rate.id);
      if (result.errors.overlap || result.errors.salaryTo || result.errors.salaryFrom) {
        toast({
          variant: "error",
          title: "Range not saved",
          description: result.errors.overlap ?? result.errors.salaryTo ?? result.errors.salaryFrom,
        });
        return;
      }
    }

    owned.forEach((rate) => updateContributionRate(rate.id, { salaryFrom: from, salaryTo: to }));
    toast({
      variant: "success",
      title: "Salary range updated",
      description: `${owned.length} rate${owned.length === 1 ? "" : "s"} set to ${formatCurrency(from)}–${formatCurrency(to)}.`,
    });
  };

  return (
    <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Grid3x3 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Contribution schedule matrix</h3>
              <p className="text-sm text-muted-foreground">
                Employee / Employer share per salary bracket, by contribution type.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editMode ? "Done" : "Edit"}
            </Button>
            {periods.length > 0 && (
              <div className="w-48">
                <Label htmlFor="matrix-period" className="sr-only">Effective period</Label>
                <Select
                  id="matrix-period"
                  value={period ? `${period.year}-${period.month}` : ""}
                  onChange={(e) => setPeriodKey(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                      {monthLabel(p.month)} {p.year}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>

        {!matrix || matrix.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-muted-foreground">
            <Info className="h-8 w-8 opacity-50" />
            <p className="text-sm">No active contribution rates for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-secondary/60 px-3 py-2.5 text-left font-semibold">
                    Salary range
                  </th>
                  {matrix.types.map((t) => (
                    <th key={t} className="px-3 py-2.5 text-center font-semibold">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TYPE_TINT[t])}>
                        {t}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border bg-card text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
                  <th className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-medium" />
                  {matrix.types.map((t) => (
                    <th key={t} className="px-3 py-1.5 text-center font-medium">EE / ER · Total</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matrix.rows.map((row) => (
                  <tr key={`${row.from}-${row.to}`} className="transition-colors hover:bg-secondary/40">
                    <td className="sticky left-0 z-10 bg-card px-3 py-3 font-medium tabular-nums text-foreground">
                      <RangeCell row={row} editMode={editMode} onCommit={commitRange} />
                    </td>
                    {matrix.types.map((t) => {
                      const rate = row.cells[t].rate;
                      return (
                        <td key={t} className="px-2 py-2 text-center align-middle">
                          {rate ? (
                            <MatrixCell rate={rate} editMode={editMode} onCommit={commitCell} />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Each cell shows <span className="font-medium text-foreground">Employee / Employer</span> share with the
          combined total below.{" "}
          {editMode
            ? "Edit the EE / ER fields and press Enter (or click away) to save — the total recomputes automatically."
            : "Click Edit to change the shares inline."}
        </p>
    </div>
  );
}

interface MatrixCellProps {
  rate: ContributionRate;
  editMode: boolean;
  onCommit: (rate: ContributionRate, ee: number, er: number) => void;
}

/** A single bracket × type cell: read-only display or two editable inputs. */
function MatrixCell({ rate, editMode, onCommit }: MatrixCellProps) {
  const [ee, setEe] = React.useState(String(rate.employeeShare));
  const [er, setEr] = React.useState(String(rate.employerShare));

  // Keep local drafts in sync when the underlying rate changes externally.
  React.useEffect(() => {
    setEe(String(rate.employeeShare));
    setEr(String(rate.employerShare));
  }, [rate.employeeShare, rate.employerShare]);

  const commit = () => {
    const nextEe = Math.max(0, Math.round(Number(ee) || 0));
    const nextEr = Math.max(0, Math.round(Number(er) || 0));
    onCommit(rate, nextEe, nextEr);
  };

  const liveTotal = computeTotal(
    Math.max(0, Math.round(Number(er) || 0)),
    Math.max(0, Math.round(Number(ee) || 0)),
  );

  if (!editMode) {
    return (
      <div className="flex flex-col items-center leading-tight">
        <span className="tabular-nums">
          {formatCurrency(rate.employeeShare)}
          <span className="text-muted-foreground/50"> / </span>
          {formatCurrency(rate.employerShare)}
        </span>
        <span className="text-xs font-semibold tabular-nums text-primary">
          {formatCurrency(rate.total)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <NumberInput
          value={ee}
          onChange={setEe}
          onCommit={commit}
          ariaLabel={`${rate.type} employee share for ${rate.salaryFrom} to ${rate.salaryTo}`}
        />
        <span className="text-muted-foreground/50">/</span>
        <NumberInput
          value={er}
          onChange={setEr}
          onCommit={commit}
          ariaLabel={`${rate.type} employer share for ${rate.salaryFrom} to ${rate.salaryTo}`}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-primary">
        {formatCurrency(liveTotal)}
      </span>
    </div>
  );
}

interface RangeCellProps {
  row: MatrixRow;
  editMode: boolean;
  onCommit: (row: MatrixRow, from: number, to: number) => void;
}

/** The salary-range cell: read-only text, or two editable bound inputs. */
function RangeCell({ row, editMode, onCommit }: RangeCellProps) {
  const [from, setFrom] = React.useState(String(row.from));
  const [to, setTo] = React.useState(String(row.to));

  React.useEffect(() => {
    setFrom(String(row.from));
    setTo(String(row.to));
  }, [row.from, row.to]);

  const commit = () => {
    const nextFrom = Math.max(0, Math.round(Number(from) || 0));
    const nextTo = Math.max(0, Math.round(Number(to) || 0));
    onCommit(row, nextFrom, nextTo);
  };

  if (!editMode) {
    return <>{formatCurrency(row.from)} – {formatCurrency(row.to)}</>;
  }

  return (
    <div className="flex items-center gap-1">
      <NumberInput
        value={from}
        onChange={setFrom}
        onCommit={commit}
        ariaLabel={`Salary range from, currently ${row.from}`}
      />
      <span className="text-muted-foreground/50">–</span>
      <NumberInput
        value={to}
        onChange={setTo}
        onCommit={commit}
        ariaLabel={`Salary range to, currently ${row.to}`}
      />
    </div>
  );
}

interface NumberInputProps {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  ariaLabel: string;
}

function NumberInput({ value, onChange, onCommit, ariaLabel }: NumberInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-8 w-16 rounded-lg border border-input bg-card px-1.5 text-right text-sm tabular-nums outline-none transition-all focus:border-primary focus:shadow-focus"
    />
  );
}
