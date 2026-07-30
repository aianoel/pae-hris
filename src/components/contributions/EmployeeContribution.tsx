import * as React from "react";
import { UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useStore } from "@/store/store-context";
import {
  computeContribution,
  findMatchingRate,
  TYPE_TINT,
  type ContributionRate,
} from "@/lib/contributions";

/**
 * Pick an employee; their monthly basic salary is pulled from HR and all
 * contributions plus the resulting net deduction are computed automatically.
 */
export function EmployeeContribution({ rates }: { rates: ContributionRate[] }) {
  const { employees } = useStore();
  const active = React.useMemo(
    () => employees.filter((e) => e.status !== "inactive"),
    [employees],
  );
  const [employeeId, setEmployeeId] = React.useState(active[0]?.id ?? "");

  const employee = active.find((e) => e.id === employeeId) ?? active[0];
  const monthly = employee ? Math.round(employee.salary / 12) : 0;
  const result = React.useMemo(
    () => computeContribution(monthly, rates),
    [monthly, rates],
  );

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Employee contribution</h3>
            <p className="text-sm text-muted-foreground">Auto-computed from the employee's basic salary.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ec-employee">Employee</Label>
          <Select
            id="ec-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {active.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.role}
              </option>
            ))}
          </Select>
        </div>

        {employee && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Basic salary (monthly)" value={formatCurrency(monthly)} />
              <Stat label="Department" value={employee.department} plain />
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Salary range</th>
                    <th className="px-3 py-2 text-right font-semibold">EE share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.lines.map((line) => {
                    const match = findMatchingRate(rates, line.type, monthly);
                    return (
                      <tr key={line.type} className={cn(!line.rate && "opacity-50")}>
                        <td className="px-3 py-2.5">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TYPE_TINT[line.type])}>
                            {line.type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          {match
                            ? `${formatCurrency(match.salaryFrom)} – ${formatCurrency(match.salaryTo)}`
                            : "No matching range"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                          {line.rate ? formatCurrency(line.employeeShare) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium text-foreground">Net deduction (employee share)</span>
              <span className="text-lg font-semibold tabular-nums text-primary">
                {formatCurrency(result.totalEmployee)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold text-foreground", !plain && "tabular-nums")}>{value}</p>
    </div>
  );
}
