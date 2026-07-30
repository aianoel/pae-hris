import * as React from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Power, Search, ShieldCheck, Check } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusChip } from "@/components/ui/status-chip";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import type { User } from "@/store/types";
import { cn } from "@/lib/utils";
import {
  ALL_ACCESS,
  CONTROLLABLE_MODULES,
  DEFAULT_ACCESS,
  fullAccess,
  hasFullAccess,
} from "@/lib/access";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

/** Group the controllable modules by their nav section for the access picker. */
const MODULE_GROUPS = CONTROLLABLE_MODULES.reduce<Record<string, typeof CONTROLLABLE_MODULES>>(
  (acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  },
  {},
);

export function UsersPage() {
  const { users, roles, addUser, updateUser, removeUser, toggleUserActive } = useStore();
  const { signUpUser } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [deleting, setDeleting] = React.useState<User | null>(null);

  const roleNames = roles.map((r) => r.name);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState(roleNames[0] ?? "Member");
  const [fullAccessOn, setFullAccessOn] = React.useState(false);
  const [access, setAccess] = React.useState<string[]>(DEFAULT_ACCESS);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole(roleNames[0] ?? "Member");
    setFullAccessOn(false);
    setAccess(DEFAULT_ACCESS);
    setFormOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setPassword("");
    setRole(u.role);
    setFullAccessOn(hasFullAccess(u.access));
    setAccess(hasFullAccess(u.access) ? DEFAULT_ACCESS : u.access ?? DEFAULT_ACCESS);
    setFormOpen(true);
  };

  const toggleModule = (to: string) => {
    setAccess((prev) => (prev.includes(to) ? prev.filter((p) => p !== to) : [...prev, to]));
  };

  const [saving, setSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    // Full-access users store the "*" sentinel; otherwise the picked modules
    // (always including the Dashboard baseline).
    const finalAccess = fullAccessOn
      ? fullAccess()
      : Array.from(new Set([...DEFAULT_ACCESS, ...access]));
    const pwd = password.trim() || undefined;

    if (editing) {
      // Password is never stored on the app user row (credentials live in
      // Supabase Auth). Editing it here does not rotate the Auth password —
      // that must be done via Supabase (password reset / admin API).
      updateUser(editing.id, {
        name: name.trim(),
        email: email.trim(),
        role,
        access: finalAccess,
      });
      toast({ variant: "success", title: "User updated", description: `${name}'s account and access were saved.` });
      setFormOpen(false);
      return;
    }

    // New user: a password is required so we can provision a real sign-in.
    if (!pwd) {
      toast({ variant: "error", title: "Password required", description: "Set a password so the new user can sign in." });
      return;
    }

    // Provision the Supabase Auth credential first; only add the app user if the
    // sign-in was created (offline mode returns ok:true and no-ops).
    setSaving(true);
    try {
      const res = await signUpUser(email.trim(), pwd);
      if (!res.ok) {
        toast({
          variant: "error",
          title: "Couldn't create sign-in",
          description: res.error ?? "The account credential could not be created.",
        });
        return;
      }
      // The password provisions the Supabase Auth credential above; it is NOT
      // persisted on the app user row (no plaintext credentials at rest).
      addUser({ name: name.trim(), email: email.trim(), role, status: "active", access: finalAccess });
      toast(
        res.needsConfirmation
          ? {
              variant: "info",
              title: "User created — confirmation required",
              description: `${email} must confirm their email before they can sign in. Disable "Confirm email" in Supabase Auth to allow immediate login.`,
            }
          : {
              variant: "success",
              title: "User created",
              description: `${email} can sign in and access ${moduleCount(finalAccess)}.`,
            },
      );
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      u.role.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Create user accounts and control which modules each can access."
        actions={
          <Button size="lg" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create user
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:shadow-focus"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {["User", "Role", "Access", "Status", "Last active", ""].map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <AccessBadge access={u.access} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.lastActive}</td>
                  <td className="px-4 py-3 pr-5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="User actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => openEdit(u)}>
                          <Pencil /> Edit &amp; access
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleUserActive(u.id)}>
                          <Power /> {u.status === "active" ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDeleting(u)}>
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted-foreground">
                    No users match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user & access" : "Create user"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this account and control which modules it can open."
                : "Create an account and choose exactly which modules it can access."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Full name</Label>
              <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Jane Doe" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-email">Email</Label>
                <input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="jane@aurora.app" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">Password</Label>
                <input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                  disabled={Boolean(editing)}
                  placeholder={editing ? "Managed in Supabase Auth" : "Set an initial password"}
                />
                {editing && (
                  <p className="text-xs text-muted-foreground">
                    Passwords are managed by Supabase Auth. Use a password reset to change it.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value)}>
                {roleNames.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </div>

            {/* Access control */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Module access</p>
                  <p className="text-xs text-muted-foreground">Choose which modules this user can open.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={fullAccessOn}
                    onChange={(e) => setFullAccessOn(e.target.checked)}
                  />
                  Full access (admin)
                </label>
              </div>

              {!fullAccessOn && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAccess(CONTROLLABLE_MODULES.map((m) => m.to))}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccess([])}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear
                    </button>
                    <span className="ml-auto self-center text-xs text-muted-foreground">
                      {access.length} selected
                    </span>
                  </div>
                  {Object.entries(MODULE_GROUPS).map(([group, items]) => (
                    <div key={group} className="space-y-1.5">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground/70">{group}</p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {items.map((m) => {
                          const on = access.includes(m.to);
                          return (
                            <button
                              key={m.to}
                              type="button"
                              onClick={() => toggleModule(m.to)}
                              aria-pressed={on}
                              className={cn(
                                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                                on
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-card text-muted-foreground hover:border-primary/50",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded border",
                                  on ? "border-primary bg-primary text-primary-foreground" : "border-input text-transparent",
                                )}
                              >
                                <Check className="h-3 w-3" />
                              </span>
                              <m.icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Dashboard is always accessible.</p>
                </div>
              )}
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {editing ? "Save changes" : saving ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove user?"
        description={deleting ? `${deleting.name} will lose access immediately.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeUser(deleting.id);
            toast({ variant: "success", title: "User removed", description: `${deleting.name} was removed.` });
          }
        }}
      />
    </>
  );
}

/** How many modules an access list grants (excluding the always-on Dashboard). */
function moduleCount(access: string[]): string {
  if (hasFullAccess(access)) return "all modules";
  const n = access.filter((a) => a !== "/" && a !== ALL_ACCESS).length;
  return n === 1 ? "1 module" : `${n} modules`;
}

/** Compact badge summarising a user's module access for the table. */
function AccessBadge({ access }: { access: string[] | undefined }) {
  if (hasFullAccess(access)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <ShieldCheck className="h-3.5 w-3.5" /> Full access
      </span>
    );
  }
  const n = (access ?? []).filter((a) => a !== "/" && a !== ALL_ACCESS).length;
  return (
    <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {n === 0 ? "Dashboard only" : n === 1 ? "1 module" : `${n} modules`}
    </span>
  );
}
