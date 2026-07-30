import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Search,
  CalendarDays,
  Sparkles,
  Globe2,
  Building2,
  Lock,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { LeaveTypeDialog } from "@/components/leave/LeaveTypeDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { cn } from "@/lib/utils";
import {
  ALL_AGENCIES,
  DIRECT_HIRE,
  DIRECT_HIRE_KEY,
  LEAVE_PRESETS,
  PAY_RULE_LABEL,
  PAY_RULE_TINT,
  agencyScopeLabel,
  appliesToAgency,
  appliesToAllAgencies,
  canManageLeave,
  type LeaveType,
} from "@/lib/leave";

/** "All agencies" in the page filter — distinct from the ALL_AGENCIES sentinel
 *  stored on a type, which means "this type applies everywhere". */
const FILTER_ANY = "__any__";

export function LeavePage() {
  const {
    leaveTypes,
    agencies,
    employees,
    addLeaveType,
    addLeaveTypes,
    updateLeaveType,
    removeLeaveType,
  } = useStore();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  // HR and Administrators create/edit/delete; everyone else reads the catalogue.
  const canManage = canManageLeave(user?.role, isAdmin);

  const [query, setQuery] = React.useState("");
  const [agencyFilter, setAgencyFilter] = React.useState<string>(FILTER_ANY);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeaveType | null>(null);
  const [deleting, setDeleting] = React.useState<LeaveType | null>(null);

  const employeeAgencies = React.useMemo(
    () => employees.map((e) => e.agency),
    [employees],
  );

  /** Agency options for the page filter: every registered agency plus any an
   *  employee is assigned to, so no cohort is unfilterable. */
  const filterOptions = React.useMemo(() => {
    const names = new Set(agencies.map((a) => a.name));
    for (const a of employeeAgencies) if (a) names.add(a);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [agencies, employeeAgencies]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leaveTypes.filter((t) => {
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !t.code.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      // Filtering by an agency includes the workspace-wide types too — they do
      // apply to that agency, which is what the user is asking about.
      if (agencyFilter !== FILTER_ANY && !appliesToAgency(t, agencyFilter)) return false;
      return true;
    });
  }, [leaveTypes, query, agencyFilter]);

  const stats = React.useMemo(() => {
    const active = leaveTypes.filter((t) => t.status === "active");
    return {
      total: leaveTypes.length,
      active: active.length,
      paidDays: active
        .filter((t) => t.payRule === "paid")
        .reduce((sum, t) => sum + t.daysPerYear, 0),
      scoped: leaveTypes.filter((t) => !appliesToAllAgencies(t)).length,
    };
  }, [leaveTypes]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (t: LeaveType) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleSubmit = (draft: Parameters<typeof addLeaveType>[0]) => {
    if (editing) {
      updateLeaveType(editing.id, draft);
      toast({
        variant: "success",
        title: "Leave type updated",
        description: `${draft.name} was saved.`,
      });
    } else {
      addLeaveType(draft);
      toast({
        variant: "success",
        title: "Leave type created",
        description: `${draft.name} now applies to ${agencyScopeLabel(draft).toLowerCase()}.`,
      });
    }
  };

  /** Seed the statutory PH types, workspace-wide. Only offered on an empty
   *  catalogue, so there's nothing to clash with. */
  const addPresets = () => {
    const count = addLeaveTypes(
      LEAVE_PRESETS.map((p) => ({ ...p, agencies: [ALL_AGENCIES] })),
    );
    toast({
      variant: "success",
      title: "Statutory leave types added",
      description: `${count} Philippine leave types were added for all agencies.`,
    });
  };

  return (
    <>
      <PageHeader
        title="Leave"
        description="Define the leave types your workspace recognises and which agencies each applies to."
        actions={
          canManage ? (
            <Button size="lg" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New leave type
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              View only — HR or an administrator can make changes
            </span>
          )
        }
      />

      {/* ---- Summary ---- */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Leave types" value={stats.total} />
        <StatCard icon={ClipboardCheck} label="Active" value={stats.active} />
        <StatCard icon={RefreshCw} label="Paid days / year" value={stats.paidDays} />
        <StatCard icon={Building2} label="Agency-specific" value={stats.scoped} />
      </div>

      {/* ---- Filters ---- */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leave types…"
            aria-label="Search leave types"
            className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus"
          />
        </div>
        <Select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          aria-label="Filter by agency"
          className="sm:w-64"
        >
          <option value={FILTER_ANY}>All agencies</option>
          <option value={DIRECT_HIRE_KEY}>{DIRECT_HIRE}</option>
          {filterOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      {/* ---- Catalogue ---- */}
      {leaveTypes.length === 0 ? (
        <EmptyCatalogue canManage={canManage} onCreate={openCreate} onPresets={addPresets} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No leave types match your search.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <Th>Leave type</Th>
                  <Th className="text-right">Days / year</Th>
                  <Th>Pay</Th>
                  <Th>Applies to</Th>
                  <Th>Rules</Th>
                  <Th>Status</Th>
                  {canManage && <Th className="w-12 text-right sr-only">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[0.7rem] font-bold tracking-tight text-primary">
                          {t.code}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{t.name}</p>
                          {t.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-foreground">
                      {t.daysPerYear === 0 ? (
                        <span className="text-muted-foreground">Unlimited</span>
                      ) : (
                        t.daysPerYear
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          PAY_RULE_TINT[t.payRule],
                        )}
                      >
                        {PAY_RULE_LABEL[t.payRule]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-foreground"
                        title={
                          appliesToAllAgencies(t)
                            ? "All agencies"
                            : t.agencies
                                .map((a) => (a === DIRECT_HIRE_KEY ? DIRECT_HIRE : a))
                                .join(", ")
                        }
                      >
                        {appliesToAllAgencies(t) ? (
                          <Globe2 className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {agencyScopeLabel(t)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {t.carryOver && <Pill>Carry over</Pill>}
                        {t.requiresApproval && <Pill>Approval</Pill>}
                        {!t.carryOver && !t.requiresApproval && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusChip status={t.status} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-3.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${t.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(t)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                updateLeaveType(t.id, {
                                  status: t.status === "active" ? "inactive" : "active",
                                })
                              }
                            >
                              <RefreshCw />
                              {t.status === "active" ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setDeleting(t)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LeaveTypeDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        existing={leaveTypes}
        agencies={agencies}
        employeeAgencies={employeeAgencies}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete leave type?"
        description={
          deleting
            ? `${deleting.name} (${deleting.code}) will be removed from the catalogue.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          removeLeaveType(deleting.id);
          toast({
            variant: "success",
            title: "Leave type deleted",
            description: `${deleting.name} was removed.`,
          });
        }}
      />
    </>
  );
}

// ---- Small presentational pieces ------------------------------------------

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.7rem] font-medium text-secondary-foreground">
      {children}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * First-run state. The statutory-preset shortcut is the important affordance —
 * most PH workspaces want exactly these seven types, so offering them as one
 * click beats making HR type them in.
 */
function EmptyCatalogue({
  canManage,
  onCreate,
  onPresets,
}: {
  canManage: boolean;
  onCreate: () => void;
  onPresets: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CalendarDays className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">No leave types yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {canManage
              ? "Add the standard Philippine statutory types in one click, or define your own and scope them to specific agencies."
              : "The leave catalogue is empty. HR or an administrator can add leave types."}
          </p>
        </div>
        {canManage && (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button onClick={onPresets}>
              <Sparkles className="h-4 w-4" /> Add statutory leave types
            </Button>
            <Button variant="outline" onClick={onCreate}>
              <Plus className="h-4 w-4" /> New leave type
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
