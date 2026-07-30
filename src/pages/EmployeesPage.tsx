import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  SlidersHorizontal,
  Download,
  Plus,
  Trash2,
  Columns3,
  UserX,
  Check,
  Building2,
  BadgeCheck,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Status } from "@/components/ui/status-chip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { employeeColumns } from "@/components/table/employeeColumns";
import { DataTablePagination } from "@/components/table/DataTablePagination";
import {
  EmployeeFormDialog,
  type EmployeeFormValues,
} from "@/components/employees/EmployeeFormDialog";
import { EmployeeLoansDialog } from "@/components/employees/EmployeeLoansDialog";
import { useStore } from "@/store/store-context";
import type { Employee, EmployeeType } from "@/store/types";
import { downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";

const statusFilters: { value: Status; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on-leave", label: "On leave" },
  { value: "inactive", label: "Inactive" },
];

// Employment classification (tenure track). Matches EmployeeType in the store.
const typeFilters: { value: EmployeeType; label: string }[] = [
  { value: "Regular", label: "Regular" },
  { value: "Probationary", label: "Probationary" },
  { value: "Contractual", label: "Contractual" },
  { value: "Part-time", label: "Part-time" },
];

export function EmployeesPage() {
  const { toast } = useToast();
  const { employees, agencies, addEmployee, updateEmployee, removeEmployee, bulkSetEmployeeStatus } =
    useStore();
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Dialog state for create / edit / delete.
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [deleting, setDeleting] = React.useState<Employee | null>(null);
  const [loansFor, setLoansFor] = React.useState<Employee | null>(null);

  // Simulate initial data fetch to show the loading skeleton.
  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const handleFormSubmit = (values: EmployeeFormValues) => {
    if (editing) {
      updateEmployee(editing.id, values);
      toast({ variant: "success", title: "Employee updated", description: `${values.name}'s details were saved.` });
    } else {
      addEmployee(values);
      toast({ variant: "success", title: "Employee added", description: `${values.name} joined ${values.department}.` });
    }
    setEditing(null);
  };

  const table = useReactTable({
    data: employees,
    columns: employeeColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    meta: {
      onEdit: (employee) => {
        setEditing(employee);
        setFormOpen(true);
      },
      onDelete: (employee) => setDeleting(employee),
      onLoans: (employee) => setLoansFor(employee),
    },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) => {
      const q = String(value).toLowerCase();
      const e = row.original;
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Don't let a data-reference change (e.g. the async store/Supabase load)
    // queue an auto page-index reset. That reset is flushed in a microtask and
    // can land before this component has committed, triggering React's
    // "state update on a component that hasn't mounted yet" warning.
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 8 } },
  });

  const statusColumn = table.getColumn("status");
  const activeStatuses = (statusColumn?.getFilterValue() as string[]) ?? [];
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  const toggleStatus = (value: string) => {
    const next = activeStatuses.includes(value)
      ? activeStatuses.filter((s) => s !== value)
      : [...activeStatuses, value];
    statusColumn?.setFilterValue(next.length ? next : undefined);
  };

  // Employment-type filter (Regular / Probationary / …), driven by the
  // employmentType column's filterFn (defaults missing values to "Regular").
  const typeColumn = table.getColumn("employmentType");
  const activeTypes = (typeColumn?.getFilterValue() as string[]) ?? [];
  const toggleType = (value: string) => {
    const next = activeTypes.includes(value)
      ? activeTypes.filter((t) => t !== value)
      : [...activeTypes, value];
    typeColumn?.setFilterValue(next.length ? next : undefined);
  };

  // Agency filter. Options = registered agencies ∪ agencies already assigned to
  // employees (so filtering still works for since-unregistered ones). The ""
  // value is the sentinel for direct hires (no agency).
  const agencyColumn = table.getColumn("agency");
  const activeAgencies = (agencyColumn?.getFilterValue() as string[]) ?? [];
  const agencyFilters = React.useMemo(() => {
    const names = new Set<string>(agencies.map((a) => a.name));
    let hasDirect = false;
    for (const e of employees) {
      if (e.agency) names.add(e.agency);
      else hasDirect = true;
    }
    const list = [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
    // Offer "Direct hire" only when some employee actually has no agency.
    return hasDirect ? [{ value: "", label: "Direct hire" }, ...list] : list;
  }, [agencies, employees]);

  const toggleAgency = (value: string) => {
    const next = activeAgencies.includes(value)
      ? activeAgencies.filter((a) => a !== value)
      : [...activeAgencies, value];
    agencyColumn?.setFilterValue(next.length ? next : undefined);
  };

  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide());
  const visibleLeafColumns = table.getVisibleLeafColumns().length;

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage your organization's people, roles, and access."
        actions={
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const rows = table.getFilteredRowModel().rows.map((r) => r.original);
                downloadCsv("employees", rows, [
                  "id",
                  "name",
                  "email",
                  "role",
                  "department",
                  "status",
                  "employmentType",
                  "payClass",
                  "location",
                  "agency",
                  "joined",
                  "salary",
                ]);
                toast({ variant: "success", title: "Export complete", description: `${rows.length} employees exported to CSV.` });
              }}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              size="lg"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add employee
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search employees…"
              className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:shadow-focus"
              aria-label="Search employees"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" className="h-10">
                  <SlidersHorizontal className="h-4 w-4" />
                  Status
                  {activeStatuses.length > 0 && (
                    <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
                      {activeStatuses.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {statusFilters.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => toggleStatus(s.value)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    <StatusChip status={s.value} />
                    {activeStatuses.includes(s.value) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Employment-type filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" className="h-10">
                  <BadgeCheck className="h-4 w-4" />
                  Type
                  {activeTypes.length > 0 && (
                    <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
                      {activeTypes.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {typeFilters.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    <span>{t.label}</span>
                    {activeTypes.includes(t.value) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Agency filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" className="h-10">
                  <Building2 className="h-4 w-4" />
                  Agency
                  {activeAgencies.length > 0 && (
                    <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
                      {activeAgencies.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuLabel>Filter by agency</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {agencyFilters.length === 0 ? (
                  <p className="px-2.5 py-2 text-sm text-muted-foreground">No agencies to filter.</p>
                ) : (
                  agencyFilters.map((a) => (
                    <button
                      key={a.value || "__direct__"}
                      onClick={() => toggleAgency(a.value)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                    >
                      <span className={cn("truncate", !a.value && "italic text-muted-foreground")}>
                        {a.label}
                      </span>
                      {activeAgencies.includes(a.value) && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Column visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" className="h-10">
                  <Columns3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                    className="capitalize"
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border bg-primary/5"
            >
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-sm font-medium text-foreground">
                  {selectedCount} selected
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="default"
                    className="h-8"
                    onClick={() => table.resetRowSelection()}
                  >
                    Clear
                  </Button>
                  <Button
                    size="default"
                    className="h-8 bg-destructive hover:bg-destructive/90"
                    onClick={() => {
                      const ids = table
                        .getFilteredSelectedRowModel()
                        .rows.map((r) => r.original.id);
                      bulkSetEmployeeStatus(ids, "inactive");
                      toast({
                        variant: "success",
                        title: `${ids.length} employees archived`,
                        description: "Their status was set to inactive.",
                      });
                      table.resetRowSelection();
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Archive
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {table.getVisibleLeafColumns().map((col) => (
                      <td key={col.id} className="px-4 py-3.5 first:pl-5 last:pr-5">
                        {col.id === "name" ? (
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-full" />
                            <div className="space-y-1.5">
                              <Skeleton className="h-3 w-28" />
                              <Skeleton className="h-2.5 w-40" />
                            </div>
                          </div>
                        ) : (
                          <Skeleton className="h-3.5 w-20" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70",
                      "data-[state=selected]:bg-primary/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 first:pl-5 last:pr-5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleLeafColumns} className="px-4 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                        <UserX className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">
                        No employees found
                      </p>
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                        Try adjusting your search or filters to find who you're looking for.
                      </p>
                      <Button
                        variant="outline"
                        size="default"
                        className="mt-4"
                        onClick={() => {
                          setGlobalFilter("");
                          statusColumn?.setFilterValue(undefined);
                          typeColumn?.setFilterValue(undefined);
                          agencyColumn?.setFilterValue(undefined);
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (
          <div className="border-t border-border px-4">
            <DataTablePagination table={table} />
          </div>
        )}
      </Card>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        employee={editing}
        onSubmit={handleFormSubmit}
      />

      <EmployeeLoansDialog
        open={Boolean(loansFor)}
        onOpenChange={(o) => !o && setLoansFor(null)}
        employee={loansFor}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete employee?"
        description={
          deleting
            ? `${deleting.name} will be permanently removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeEmployee(deleting.id);
            toast({ variant: "success", title: "Employee deleted", description: `${deleting.name} was removed.` });
          }
        }}
      />
    </>
  );
}
