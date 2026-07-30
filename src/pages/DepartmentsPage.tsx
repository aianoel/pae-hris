import * as React from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import type { Department } from "@/store/types";
import { formatCurrency } from "@/lib/format";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

export function DepartmentsPage() {
  const { departments, addDepartment, updateDepartment, removeDepartment, headcountFor } = useStore();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Department | null>(null);
  const [deleting, setDeleting] = React.useState<Department | null>(null);

  const [name, setName] = React.useState("");
  const [lead, setLead] = React.useState("");
  const [budget, setBudget] = React.useState(1000000);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setLead("");
    setBudget(1000000);
    setFormOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setName(d.name);
    setLead(d.lead);
    setBudget(d.budget);
    setFormOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      updateDepartment(editing.id, { name: name.trim(), lead: lead.trim(), budget });
      toast({ variant: "success", title: "Department updated", description: `${name} was saved.` });
    } else {
      addDepartment({ name: name.trim(), lead: lead.trim() || "Unassigned", budget });
      toast({ variant: "success", title: "Department created", description: `${name} was added.` });
    }
    setFormOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Organize teams and reporting structures."
        actions={
          <Button size="lg" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New department
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => {
          const count = headcountFor(d.name);
          return (
            <Card key={d.id} interactive>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${d.color} 15%, transparent)`, color: d.color }}
                  >
                    <Users className="h-5 w-5" />
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Department actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(d)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleting(d)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{d.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Led by {d.lead}</p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Headcount</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">{count}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {formatCurrency(d.budget, { notation: "compact" })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit department" : "New department"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this department." : "Create a new team."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Engineering" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-lead">Lead</Label>
              <input id="dept-lead" value={lead} onChange={(e) => setLead(e.target.value)} className={fieldClass} placeholder="Maya Kapoor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-budget">Annual budget (PHP)</Label>
              <input id="dept-budget" type="number" min={0} step={100000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className={fieldClass} />
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? "Save changes" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete department?"
        description={deleting ? `${deleting.name} will be removed. Employees are not deleted.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeDepartment(deleting.id);
            toast({ variant: "success", title: "Department deleted", description: `${deleting.name} was removed.` });
          }
        }}
      />
    </>
  );
}
