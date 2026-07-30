import * as React from "react";
import { Calculator, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  computeContribution,
  TYPE_TINT,
  type ContributionRate,
} from "@/lib/contributions";

/**
 * Enter a monthly salary and instantly see the matching contribution rates
 * and computed shares. Types with no matching range surface a warning.
 */
export function SalaryCalculator({ rates }: { rates: ContributionRate[] }) {
  const [salary, setSalary] = React.useState<number>(25000);
  const result = React.useMemo(() => computeContribution(salary, rates), [salary, rates]);

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calculator className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Salary-based calculator</h3>
            <p className="text-sm text-muted-foreground">Enter a monthly salary to compute contributions instantly.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="calc-salary">Monthly salary (PHP)</Label>
          <Input
            id="calc-salary"
            type="number"
            min={0}
            step={500}
            value={Number.isNaN(salary) ? "" : salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            leadingIcon={<span className="text-sm font-medium">₱</span>}
          />
        </div>

        {result.unmatched.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No contribution rate found for {result.unmatched.join(", ")} at this salary.</span>
          </div>
        )}

        {/* Per-type breakdown */}
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-right font-semibold">MSC</th>
                <th className="px-3 py-2 text-right font-semibold">ER</th>
                <th className="px-3 py-2 text-right font-semibold">EE</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.lines.map((line) => (
                <tr key={line.type} className={cn(!line.rate && "opacity-50")}>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TYPE_TINT[line.type])}>
                      {line.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {line.rate ? formatCurrency(line.msc) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {line.rate ? formatCurrency(line.employerShare) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {line.rate ? formatCurrency(line.employeeShare) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {line.rate ? formatCurrency(line.total) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Employer total" value={formatCurrency(result.totalEmployer)} />
          <Stat label="Employee total" value={formatCurrency(result.totalEmployee)} accent />
          <Stat label="Grand total" value={formatCurrency(result.totalContribution)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums", accent ? "text-primary" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
