import type { ColumnDef, RowData } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Mail, Copy, Pencil, Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusChip } from "@/components/ui/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Employee } from "@/lib/data";
import { tenureFrom } from "@/lib/data";

// Callbacks the EmployeesPage injects via table `meta` so row actions can reach
// the store handlers without prop-drilling.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    onEdit?: (employee: Employee) => void;
    onDelete?: (employee: Employee) => void;
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
}

function SortButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}

export const employeeColumns: ColumnDef<Employee>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortButton label="Employee" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
    ),
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            {e.avatar && <AvatarImage src={e.avatar} alt={e.name} />}
            <AvatarFallback>{initials(e.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
            <p className="truncate text-xs text-muted-foreground">{e.email}</p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <span className="text-sm">{row.original.role}</span>,
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => (
      <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
        {row.original.department}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusChip status={row.original.status} />,
    filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
  },
  {
    accessorKey: "employmentType",
    header: "Type",
    cell: ({ row }) => {
      const t = row.original.employmentType ?? "Regular";
      // Regular = settled tenure (primary tint); everything else is muted.
      const tone =
        t === "Regular"
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-secondary-foreground";
      return (
        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
          {t}
        </span>
      );
    },
    filterFn: (row, id, value) =>
      (value as string[]).includes((row.getValue(id) as string | undefined) ?? "Regular"),
  },
  {
    accessorKey: "payClass",
    header: "Pay class",
    cell: ({ row }) => {
      const p = row.original.payClass ?? "Tier 1";
      // Executive band gets the primary tint; the tiers stay neutral.
      const tone =
        p === "Executive"
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-secondary-foreground";
      return (
        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
          {p}
        </span>
      );
    },
    filterFn: (row, id, value) =>
      (value as string[]).includes((row.getValue(id) as string | undefined) ?? "Tier 1"),
  },
  {
    id: "tenure",
    header: ({ column }) => (
      <SortButton label="Tenure" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
    ),
    // Sort by actual service length (days), display as a friendly string.
    accessorFn: (e) => {
      const d = new Date(e.joined);
      return Number.isNaN(d.getTime()) ? 0 : Date.now() - d.getTime();
    },
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {tenureFrom(row.original.joined)}
      </span>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.location}</span>
    ),
  },
  {
    accessorKey: "agency",
    header: "Agency",
    cell: ({ row }) =>
      row.original.agency ? (
        <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {row.original.agency}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    // Multi-select filter; the "" sentinel matches direct hires (no agency).
    filterFn: (row, id, value) => {
      const set = value as string[];
      const v = (row.getValue(id) as string | undefined) ?? "";
      return set.includes(v);
    },
  },
  {
    accessorKey: "salary",
    header: ({ column }) => (
      <SortButton label="Salary" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium tabular-nums">
        ${row.original.salary.toLocaleString("en-US")}
      </span>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row, table }) => {
      const e = row.original;
      const { onEdit, onDelete } = table.options.meta ?? {};
      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(e.id)}>
                <Copy /> Copy employee ID
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(e.email)}>
                <Mail /> Copy email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onEdit?.(e)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => onDelete?.(e)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
