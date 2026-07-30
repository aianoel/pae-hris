import * as React from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  CONTRIBUTION_TYPES,
  monthLabel,
  TYPE_TINT,
  type ContributionRate,
} from "@/lib/contributions";

type SortKey = "type" | "salaryFrom" | "salaryTo" | "msc" | "employerShare" | "employeeShare" | "total";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 8;

interface RateTableProps {
  rates: ContributionRate[];
  onEdit: (rate: ContributionRate) => void;
  onDelete: (rate: ContributionRate) => void;
}

/** Searchable, filterable, sortable, paginated table of all contribution rates. */
export function RateTable({ rates, onEdit, onDelete }: RateTableProps) {
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("All");
  const [sortKey, setSortKey] = React.useState<SortKey>("type");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rates.filter((r) => {
      const typeOk = typeFilter === "All" || r.type === typeFilter;
      if (!typeOk) return false;
      if (!q) return true;
      return (
        r.type.toLowerCase().includes(q) ||
        String(r.salaryFrom).includes(q) ||
        String(r.salaryTo).includes(q) ||
        monthLabel(r.effectiveMonth).toLowerCase().includes(q) ||
        String(r.effectiveYear).includes(q)
      );
    });
  }, [rates, query, typeFilter]);

  const sorted = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  React.useEffect(() => setPage(0), [query, typeFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const Th = ({ col, label, className }: { col: SortKey; label: string; className?: string }) => (
    <th className={cn("px-3 py-2.5 font-semibold", className)}>
      <button
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label} <SortIcon col={col} />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-80">
          <Input
            placeholder="Search by type, salary, month…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leadingIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="sm:w-52">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="All">All types</option>
            {CONTRIBUTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th col="type" label="Type" />
              <Th col="salaryFrom" label="Salary from" className="text-right" />
              <Th col="salaryTo" label="Salary to" className="text-right" />
              <Th col="msc" label="MSC" className="text-right" />
              <Th col="employerShare" label="ER share" className="text-right" />
              <Th col="employeeShare" label="EE share" className="text-right" />
              <Th col="total" label="Total" className="text-right" />
              <th className="px-3 py-2.5 font-semibold">Period</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-secondary/40">
                <td className="px-3 py-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TYPE_TINT[r.type])}>
                    {r.type}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.salaryFrom)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.salaryTo)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.msc)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.employerShare)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.employeeShare)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-primary">{formatCurrency(r.total)}</td>
                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {monthLabel(r.effectiveMonth).slice(0, 3)} {r.effectiveYear}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                      r.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                    {r.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit rate" onClick={() => onEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label="Delete rate"
                      onClick={() => onDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No contribution rates match your filters.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {sorted.length === 0
            ? "0 rates"
            : `Showing ${clampedPage * PAGE_SIZE + 1}–${Math.min((clampedPage + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous page"
            disabled={clampedPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">Page {clampedPage + 1} / {pageCount}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next page"
            disabled={clampedPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
