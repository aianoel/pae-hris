import { cn } from "@/lib/utils";

export type Status =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "rejected"
  | "on-leave";

const config: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  active: { label: "Active", dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  approved: { label: "Approved", dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  inactive: { label: "Inactive", dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
  pending: { label: "Pending", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  rejected: { label: "Rejected", dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" },
  "on-leave": { label: "On leave", dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
};

export function StatusChip({ status, className }: { status: Status; className?: string }) {
  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
