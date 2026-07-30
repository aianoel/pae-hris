import * as React from "react";
import { Plus, ShieldCheck, Trash2, Check } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import type { Permission, Role } from "@/store/types";
import { cn } from "@/lib/utils";

const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
];

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

export function RolesPage() {
  const { roles, addRole, removeRole, toggleRolePermission } = useStore();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Role | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addRole({
      name: name.trim(),
      description: description.trim() || "Custom role.",
      permissions: { view: true, create: false, edit: false, delete: false },
    });
    toast({ variant: "success", title: "Role created", description: `${name} was added.` });
    setName("");
    setDescription("");
    setFormOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Define roles and fine-grained access."
        actions={
          <Button size="lg" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New role
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-4 py-3 pl-5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</th>
                {PERMISSIONS.map((p) => (
                  <th key={p.key} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {p.label}
                  </th>
                ))}
                <th className="px-4 py-3 pr-5" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{r.members}</td>
                  {PERMISSIONS.map((p) => {
                    const on = r.permissions[p.key];
                    return (
                      <td key={p.key} className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleRolePermission(r.id, p.key)}
                          aria-label={`Toggle ${p.label} for ${r.name}`}
                          aria-pressed={on}
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-transparent hover:border-primary/50",
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 pr-5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label="Delete role"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>Create a role, then set its permissions in the table.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Auditor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">Description</Label>
              <input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} placeholder="Read-only compliance access" />
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit">Create role</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete role?"
        description={deleting ? `${deleting.name} will be removed. Members keep their current access until reassigned.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeRole(deleting.id);
            toast({ variant: "success", title: "Role deleted" });
          }
        }}
      />
    </>
  );
}
