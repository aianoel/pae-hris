import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  Eye,
  Layers,
  ChevronsRightLeft,
  ChevronsLeftRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  EARNING_FIELDS,
  DEDUCTION_FIELDS,
  DRIVER_FIELDS,
  DERIVED_KEYS,
  grossPay,
  totalDeductions,
  netPay,
  type PayrollRow,
  type PayrollFieldKey,
  type PayrollRowStatus,
} from "@/lib/payroll";
import { CurrencyCell } from "./CurrencyCell";
import { NumberCell } from "./NumberCell";
import { useCountUp } from "./useCountUp";

/** Amount fields whose value is auto-calculated (rendered read-only). */
const DERIVED_SET = new Set<PayrollFieldKey>(DERIVED_KEYS);
/** Driver input to show for a derived amount field, if any (OT Hours, etc.). */
const DRIVER_FOR = new Map(DRIVER_FIELDS.map((d) => [d.drives, d] as const));

const STATUS_STYLE: Record<PayrollRowStatus, { label: string; cls: string; dot: string }> = {
  pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  "in-review": { label: "In review", cls: "bg-primary/10 text-primary", dot: "bg-primary" },
  ready: { label: "Ready", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  approved: { label: "Approved", cls: "bg-success/10 text-success", dot: "bg-success" },
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

type SortKey = "name" | "gross" | "deductions" | "net" | null;

/** A rendered detail column: either an editable driver input or an amount. */
type GridColumn =
  | { kind: "amount"; field: { key: PayrollFieldKey; label: string } }
  | { kind: "driver"; field: { key: PayrollFieldKey; label: string; unit: string; drives: PayrollFieldKey } };

/** Net-pay cell with a subtle count animation when the figure changes. */
function NetCell({ value }: { value: number }) {
  const animated = useCountUp(value, 500);
  return <span className="font-semibold tabular-nums text-foreground">{formatCurrency(animated)}</span>;
}

interface PayrollGridProps {
  rows: PayrollRow[];
  loading?: boolean;
  locked?: boolean;
  selected: Record<string, boolean>;
  onSelectedChange: (next: Record<string, boolean>) => void;
  onEdit: (id: string, key: PayrollFieldKey, value: number) => void;
  onOpenEmployee: (row: PayrollRow) => void;
  onBulk: () => void;
  onClearFilters: () => void;
}

export function PayrollGrid({
  rows,
  loading,
  locked,
  selected,
  onSelectedChange,
  onEdit,
  onOpenEmployee,
  onBulk,
  onClearFilters,
}: PayrollGridProps) {
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const [page, setPage] = React.useState(0);
  const pageSize = 8;

  // Collapse the earning / deduction detail column clusters, keeping their
  // summary columns (Gross Pay / Total Deductions) visible.
  const [collapsed, setCollapsed] = React.useState<{ earnings: boolean; deductions: boolean }>({
    earnings: false,
    deductions: false,
  });
  // Expand a field list into display columns, inserting each derived field's
  // driver input (e.g. "OT Hours") immediately before the read-only amount.
  const toColumns = (fields: typeof EARNING_FIELDS): GridColumn[] =>
    fields.flatMap((f) => {
      const driver = DRIVER_FOR.get(f.key);
      const amountCol: GridColumn = { kind: "amount", field: f };
      return driver
        ? [{ kind: "driver", field: driver } as GridColumn, amountCol]
        : [amountCol];
    });

  const earningCols = collapsed.earnings ? [] : toColumns(EARNING_FIELDS);
  const deductionCols = collapsed.deductions ? [] : toColumns(DEDUCTION_FIELDS);
  const detailCols = [...earningCols, ...deductionCols];
  // Detail field columns currently rendered (drives the loading skeleton span).
  const fieldColCount = detailCols.length;

  const ClusterToggle = ({ cluster }: { cluster: "earnings" | "deductions" }) => (
    <button
      type="button"
      onClick={() => setCollapsed((c) => ({ ...c, [cluster]: !c[cluster] }))}
      aria-label={
        collapsed[cluster] ? `Expand ${cluster} columns` : `Collapse ${cluster} columns`
      }
      className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {collapsed[cluster] ? (
        <ChevronsLeftRight className="h-3.5 w-3.5" />
      ) : (
        <ChevronsRightLeft className="h-3.5 w-3.5" />
      )}
    </button>
  );

  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const val = (r: PayrollRow) =>
      key === "name" ? r.name : key === "gross" ? grossPay(r) : key === "deductions" ? totalDeductions(r) : netPay(r);
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected[r.id]);

  const toggleSort = (key: Exclude<SortKey, null>) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const toggleRow = (id: string) => onSelectedChange({ ...selected, [id]: !selected[id] });
  const togglePage = () => {
    const next = { ...selected };
    pageRows.forEach((r) => (next[r.id] = !pageAllSelected));
    onSelectedChange(next);
  };

  const SortIcon = ({ k }: { k: Exclude<SortKey, null> }) =>
    sort.key !== k ? (
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );

  // ---- Empty state -------------------------------------------------------
  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/10" />
          <FileSpreadsheet className="relative h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No payroll rows for this scope</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Adjust the filters above or generate a new payroll batch to start entering data.
        </p>
        <Button variant="outline" className="mt-5" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }

  const stickyCol =
    "sticky left-0 z-20 bg-card group-hover:bg-secondary/70 group-data-[sel=true]:bg-primary/5";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-primary/5"
          >
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="text-sm font-medium text-foreground">
                {selectedIds.length} employee{selectedIds.length > 1 ? "s" : ""} selected
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="default" className="h-8" onClick={() => onSelectedChange({})}>
                  Clear
                </Button>
                <Button size="default" className="h-8" onClick={onBulk} disabled={locked}>
                  <Layers className="h-4 w-4" /> Bulk update
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-h-[620px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-30 [&>th]:bg-muted [&>th]:backdrop-blur">
              {/* Sticky employee header (checkbox + label), left + top */}
              <th className="left-0 !z-40 min-w-[280px] border-b border-border px-4 py-3 text-left">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={pageAllSelected}
                    onChange={togglePage}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Employee <SortIcon k="name" />
                  </button>
                </div>
              </th>

              {detailCols.map((c) => (
                <th
                  key={c.field.key}
                  className={cn(
                    "min-w-[112px] whitespace-nowrap border-b border-border px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider",
                    c.kind === "driver" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {c.field.label}
                  {c.kind === "amount" && DERIVED_SET.has(c.field.key) && (
                    <span className="ml-1 font-normal normal-case text-primary/60" title="Auto-calculated">ƒ</span>
                  )}
                </th>
              ))}

              {(["gross", "deductions", "net"] as const).map((k) => (
                <th
                  key={k}
                  className="min-w-[130px] whitespace-nowrap border-b border-border px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {k === "gross" && <ClusterToggle cluster="earnings" />}
                    {k === "deductions" && <ClusterToggle cluster="deductions" />}
                    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1">
                      {k === "gross" ? "Gross Pay" : k === "deductions" ? "Total Deductions" : "Net Pay"}
                      <SortIcon k={k} />
                    </button>
                  </span>
                </th>
              ))}
              <th className="min-w-[120px] border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="sticky right-0 z-30 min-w-[90px] border-b border-l border-border bg-muted px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="group">
                    <td className={cn(stickyCol, "border-b border-border px-4 py-3")}>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-2.5 w-36" />
                        </div>
                      </div>
                    </td>
                    {Array.from({ length: fieldColCount + 3 }).map((_, j) => (
                      <td key={j} className="border-b border-border px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </td>
                    ))}
                    <td className="border-b border-border px-3 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="sticky right-0 border-b border-l border-border bg-card px-3 py-3">
                      <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                    </td>
                  </tr>
                ))
              : pageRows.map((row) => {
                  const isSel = !!selected[row.id];
                  const st = STATUS_STYLE[row.status];
                  return (
                    <tr
                      key={row.id}
                      data-sel={isSel}
                      className="group transition-colors even:bg-muted/20 hover:bg-secondary/70 data-[sel=true]:bg-primary/5"
                    >
                      {/* Sticky employee cell */}
                      <td className={cn(stickyCol, "border-b border-r border-border px-4 py-2.5 even:bg-card")}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.name}`}
                            checked={isSel}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                          />
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>{initials(row.name)}</AvatarFallback>
                          </Avatar>
                          <button
                            onClick={() => onOpenEmployee(row)}
                            className="min-w-0 text-left"
                          >
                            <p className="truncate text-sm font-medium text-foreground hover:text-primary">
                              {row.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.employeeId} · {row.position} · {row.department}
                            </p>
                          </button>
                        </div>
                      </td>

                      {detailCols.map((c) => {
                        if (c.kind === "driver") {
                          return (
                            <td key={c.field.key} className="border-b border-border bg-primary/[0.03] px-2 py-1.5">
                              <NumberCell
                                value={row[c.field.key]}
                                editable={!locked}
                                unit={c.field.unit}
                                onCommit={(v) => onEdit(row.id, c.field.key, v)}
                                ariaLabel={`${row.name} ${c.field.label}`}
                              />
                            </td>
                          );
                        }
                        const isEarning = EARNING_FIELDS.some((f) => f.key === c.field.key);
                        // Derived amounts are read-only (edit their driver / basic instead).
                        const editable = !locked && !DERIVED_SET.has(c.field.key);
                        return (
                          <td key={c.field.key} className="border-b border-border px-2 py-1.5">
                            <CurrencyCell
                              value={row[c.field.key]}
                              editable={editable}
                              onCommit={(v) => onEdit(row.id, c.field.key, v)}
                              tone={isEarning ? "positive" : "negative"}
                              ariaLabel={`${row.name} ${c.field.label}`}
                            />
                          </td>
                        );
                      })}

                      <td className="border-b border-border px-3 py-2.5 text-right tabular-nums text-success">
                        {formatCurrency(grossPay(row))}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-right tabular-nums text-destructive">
                        −{formatCurrency(totalDeductions(row))}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-right">
                        <NetCell value={netPay(row)} />
                      </td>
                      <td className="border-b border-border px-3 py-2.5">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", st.cls)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                          {st.label}
                        </span>
                      </td>
                      <td className="sticky right-0 z-10 border-b border-l border-border bg-card px-3 py-2.5 text-right group-hover:bg-secondary/70 group-data-[sel=true]:bg-primary/5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`View ${row.name} details`}
                          onClick={() => onOpenEmployee(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {sorted.length === 0 ? 0 : clampedPage * pageSize + 1}–
              {Math.min((clampedPage + 1) * pageSize, sorted.length)}
            </span>{" "}
            of <span className="font-medium text-foreground">{sorted.length}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="default"
              className="h-9"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {clampedPage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="default"
              className="h-9"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
