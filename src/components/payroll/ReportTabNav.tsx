/**
 * Horizontal top-tab navigation for the Payroll Report module. Active tab is
 * teal with a teal underline, inactive tabs gray; a tab may carry a red count
 * badge (the Dashboard's pending/unprocessed items).
 */
import { cn } from "@/lib/utils";

export interface ReportTab<T extends string> {
  value: T;
  label: string;
  /** Red notification badge count; omitted or 0 renders no badge. */
  badge?: number;
}

export function ReportTabNav<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: ReportTab<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Payroll report views" className="flex flex-wrap items-center gap-6">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
              active
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {Boolean(t.badge) && (
              <span
                aria-label={`${t.badge} pending`}
                className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground"
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
