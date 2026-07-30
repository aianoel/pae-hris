import * as React from "react";
import { Moon, Sun, Building2, Plus, Trash2, Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { SystemMonitor } from "@/components/settings/SystemMonitor";
import { DatabaseMonitor } from "@/components/settings/DatabaseMonitor";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { Settings } from "@/store/types";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus disabled:opacity-60";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const TIMEZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
];

/** A small controlled toggle switch. */
function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "left-0.5 translate-x-5" : "left-0.5 translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, agencies, addAgency, updateAgencyLogo, removeAgency } = useStore();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Local draft so edits are staged until "Save".
  const [draft, setDraft] = React.useState<Settings>(settings);
  React.useEffect(() => setDraft(settings), [settings]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    updateSettings(draft);
    toast({ variant: "success", title: "Settings saved", description: "Your workspace preferences were updated." });
  };

  // Agencies tab: register a new agency (name + optional logo).
  const [agencyName, setAgencyName] = React.useState("");
  const [agencyLogo, setAgencyLogo] = React.useState<string | undefined>();
  const newLogoInputRef = React.useRef<HTMLInputElement>(null);
  // One hidden file input per row is overkill; reuse a single input and track
  // which agency the currently-open picker targets.
  const rowLogoInputRef = React.useRef<HTMLInputElement>(null);
  const rowLogoTarget = React.useRef<string | null>(null);

  /** Read an image file to a data URL, validating type/size. Returns null on error. */
  const readLogoFile = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        toast({ variant: "error", title: "Invalid file", description: "Please choose an image file." });
        resolve(null);
        return;
      }
      if (file.size > MAX_LOGO_BYTES) {
        toast({ variant: "error", title: "File too large", description: "Logo must be 2 MB or smaller." });
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const registerAgency = () => {
    const name = agencyName.trim();
    if (!name) return;
    if (agencies.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      toast({ variant: "error", title: "Already registered", description: `"${name}" is already in the list.` });
      return;
    }
    addAgency(name, agencyLogo);
    setAgencyName("");
    setAgencyLogo(undefined);
    toast({ variant: "success", title: "Agency registered", description: `"${name}" was added.` });
  };

  return (
    <>
      <PageHeader title="Settings" description="Configure your workspace preferences." />

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="agencies">Agencies</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="prof-name">Name</Label>
                <input id="prof-name" defaultValue={user?.name ?? ""} className={fieldClass} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-email">Email</Label>
                <input id="prof-email" defaultValue={user?.email ?? ""} className={fieldClass} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-role">Role</Label>
                <input id="prof-role" defaultValue={user?.role ?? ""} className={fieldClass} disabled />
              </div>
              <p className="text-xs text-muted-foreground">Profile details come from your signed-in session.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Workspace name</Label>
                <input id="ws-name" value={draft.workspaceName} onChange={(e) => set("workspaceName", e.target.value)} className={fieldClass} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ws-tz">Timezone</Label>
                  <Select id="ws-tz" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-week">Week starts on</Label>
                  <Select
                    id="ws-week"
                    value={draft.weekStart}
                    onChange={(e) => set("weekStart", e.target.value as Settings["weekStart"])}
                  >
                    <option value="Monday">Monday</option>
                    <option value="Sunday">Sunday</option>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={save}>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agencies">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div>
                <p className="text-sm font-medium text-foreground">Manpower agencies</p>
                <p className="text-sm text-muted-foreground">
                  Register the staffing agencies your workforce is engaged through. Registered
                  agencies appear in the Agency dropdown when adding or editing an employee.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agency-name">Register agency</Label>
                <div className="flex items-start gap-3">
                  {/* Logo picker */}
                  <input
                    ref={newLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const url = await readLogoFile(file);
                      if (url) setAgencyLogo(url);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => newLogoInputRef.current?.click()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    aria-label="Upload agency logo"
                    title="Upload logo (optional)"
                  >
                    {agencyLogo ? (
                      <img src={agencyLogo} alt="Agency logo preview" className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    id="agency-name"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        registerAgency();
                      }
                    }}
                    placeholder="e.g. Metro Staffing Solutions"
                    className={fieldClass}
                  />
                  <Button type="button" onClick={registerAgency} disabled={!agencyName.trim()} className="shrink-0">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional logo (PNG, JPG or GIF, up to 2 MB). You can also add or change it later.
                </p>
              </div>

              {/* Shared hidden input for changing a row's logo. */}
              <input
                ref={rowLogoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  const target = rowLogoTarget.current;
                  rowLogoTarget.current = null;
                  if (!file || !target) return;
                  const url = await readLogoFile(file);
                  if (url) {
                    updateAgencyLogo(target, url);
                    toast({ variant: "success", title: "Logo updated", description: `Logo set for "${target}".` });
                  }
                }}
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Registered ({agencies.length})
                </p>
                {agencies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                      <Building2 className="h-6 w-6" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-foreground">No agencies yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add your first agency above to get started.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {agencies.map((a) => (
                      <li key={a.name} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="flex min-w-0 items-center gap-3 text-sm text-foreground">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
                            {a.logo ? (
                              <img src={a.logo} alt={`${a.name} logo`} className="h-full w-full object-cover" />
                            ) : (
                              <Building2 className="h-4 w-4" />
                            )}
                          </span>
                          <span className="truncate">{a.name}</span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={a.logo ? `Change ${a.name} logo` : `Upload ${a.name} logo`}
                            title={a.logo ? "Change logo" : "Upload logo"}
                            onClick={() => {
                              rowLogoTarget.current = a.name;
                              rowLogoInputRef.current?.click();
                            }}
                          >
                            <Upload className="h-4 w-4" />
                          </Button>
                          {a.logo && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Remove ${a.name} logo`}
                              title="Remove logo"
                              onClick={() => {
                                updateAgencyLogo(a.name, undefined);
                                toast({ variant: "success", title: "Logo removed", description: `Logo cleared for "${a.name}".` });
                              }}
                            >
                              <Building2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Remove ${a.name}`}
                            title="Remove agency"
                            onClick={() => {
                              removeAgency(a.name);
                              toast({ variant: "success", title: "Agency removed", description: `"${a.name}" was removed.` });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardContent className="p-6">
              <Toggle
                label="Email notifications"
                desc="Receive important updates by email."
                checked={draft.emailNotifications}
                onChange={(v) => set("emailNotifications", v)}
              />
              <Toggle
                label="Product updates"
                desc="Hear about new features and improvements."
                checked={draft.productUpdates}
                onChange={(v) => set("productUpdates", v)}
              />
              <Toggle
                label="Weekly digest"
                desc="A Monday summary of team activity."
                checked={draft.weeklyDigest}
                onChange={(v) => set("weeklyDigest", v)}
              />
              <div className="flex justify-end pt-4">
                <Button onClick={save}>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardContent className="p-6">
              <p className="mb-3 text-sm font-medium text-foreground">Theme</p>
              <div className="grid max-w-md grid-cols-2 gap-3">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      theme === t ? "border-primary bg-primary/5" : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                      {t === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium capitalize text-foreground">{t}</p>
                      <p className="text-xs text-muted-foreground">{t === "light" ? "Bright and clean" : "Easy on the eyes"}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Theme preference is saved to your browser.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <SystemMonitor />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseMonitor />
        </TabsContent>

        <TabsContent value="backup">
          <BackupPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
