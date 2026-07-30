import type { TooltipProps } from "recharts";

/** Shared styled tooltip for all Recharts charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: TooltipProps<number, string> & {
  valueFormatter?: (v: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2 shadow-card backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey as string} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="capitalize text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">
              {valueFormatter
                ? valueFormatter(entry.value as number, entry.name as string)
                : (entry.value as number).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
