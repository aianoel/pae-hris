import * as React from "react";
import { Upload, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store-context";
import { tenureFrom } from "@/lib/data";
import { CredentialPanel, CREDENTIAL_KEYS, type CredentialKey } from "./CredentialPanel";
import type { Employee, EmployeeStatus, EmployeeType, PayClass } from "@/store/types";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Fallback department suggestions so the picker isn't empty on a fresh setup. */
const DEFAULT_DEPARTMENTS = ["Engineering", "Sales", "Support", "Marketing", "Operations"];
const ROLES = [
  "Software Engineer",
  "Product Designer",
  "Account Executive",
  "Support Lead",
  "Data Analyst",
  "HR Partner",
  "Marketing Manager",
  "DevOps Engineer",
  "Recruiter",
  "Finance Analyst",
];
const LOCATIONS = ["San Francisco", "New York", "Lisbon", "Berlin", "Toronto", "Singapore", "London", "Austin"];
const STATUSES: EmployeeStatus[] = ["active", "on-leave", "inactive"];
const EMPLOYMENT_TYPES: EmployeeType[] = ["Regular", "Probationary", "Contractual", "Part-time"];
const PAY_CLASSES: PayClass[] = ["Tier 1", "Tier 2", "Rank And File", "Confidentials"];

export type EmployeeFormValues = Omit<Employee, "id">;

/** Panels of the employee dialog. */
type FormTab = "details" | "credentials";

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog is in "edit" mode. */
  employee?: Employee | null;
  onSubmit: (values: EmployeeFormValues) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const emptyValues: EmployeeFormValues = {
  name: "",
  email: "",
  role: ROLES[0],
  department: "",
  status: "active",
  employmentType: "Regular",
  payClass: "Tier 1",
  location: LOCATIONS[0],
  joined: new Date().toISOString().slice(0, 10),
  salary: 80000,
  bioId: "",
};

/** Create/edit form for an employee, using controlled fields + light validation. */
export function EmployeeFormDialog({ open, onOpenChange, employee, onSubmit }: EmployeeFormDialogProps) {
  const { agencies, departments } = useStore();
  const isEdit = Boolean(employee);
  const [values, setValues] = React.useState<EmployeeFormValues>(emptyValues);
  const [errors, setErrors] = React.useState<Partial<Record<keyof EmployeeFormValues, string>>>({});
  const [tab, setTab] = React.useState<FormTab>("details");

  // Reset the form whenever the dialog opens for a (possibly different) record.
  React.useEffect(() => {
    if (open) {
      setValues(employee ? { ...employee } : emptyValues);
      setErrors({});
      setTab("details");
    }
  }, [open, employee]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const set = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // Credential rows commit a string; an empty one clears the field entirely so
  // the row reverts to its "+ Add …" prompt instead of storing "".
  const setCredential = (key: CredentialKey, value: string) =>
    setValues((v) => ({ ...v, [key]: value || undefined }));

  // Registered agency names, plus the record's current agency if it was since
  // unregistered — so editing never silently drops an existing assignment.
  const agencyOptions = React.useMemo(() => {
    const names = agencies.map((a) => a.name);
    const current = values.agency?.trim();
    return current && !names.includes(current) ? [...names, current] : names;
  }, [agencies, values.agency]);

  // Department choices: the real departments, seeded with a few common defaults
  // so the dropdown is never empty in a fresh workspace, plus the record's
  // current dept if it was since removed. The store auto-creates the chosen
  // department on save, so picking a not-yet-existing default is fine.
  const departmentOptions = React.useMemo(() => {
    const names = new Set<string>(departments.map((d) => d.name));
    for (const d of DEFAULT_DEPARTMENTS) names.add(d);
    const current = values.department?.trim();
    if (current) names.add(current);
    return [...names];
  }, [departments, values.department]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, avatar: "Please choose an image file." }));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setErrors((prev) => ({ ...prev, avatar: "Image must be 2 MB or smaller." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set("avatar", String(reader.result));
      setErrors((prev) => ({ ...prev, avatar: undefined }));
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const next: Partial<Record<keyof EmployeeFormValues, string>> = {};
    if (!values.name.trim()) next.name = "Name is required.";
    if (!values.department.trim()) next.department = "Select a department.";
    if (!EMAIL_RE.test(values.email.trim())) next.email = "Enter a valid email address.";
    if (!values.salary || values.salary < 0) next.salary = "Enter a valid salary.";
    if (values.bioId && !/^\d{1,10}$/.test(values.bioId.trim()))
      next.bioId = "Bio ID must be up to 10 digits.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Every validated field lives on the Details tab — surface it, otherwise
      // the submit would silently fail with the errors on a hidden panel.
      setTab("details");
      return;
    }
    // Trim every credential and drop the empties so a blank field is stored as
    // absent (NULL) rather than an empty string.
    const trimmed = Object.fromEntries(
      CREDENTIAL_KEYS.map((k) => [k, values[k]?.trim() || undefined]),
    ) as Pick<EmployeeFormValues, CredentialKey>;

    onSubmit({
      ...values,
      ...trimmed,
      name: values.name.trim(),
      email: values.email.trim(),
      bioId: values.bioId?.trim() || undefined,
    });
    onOpenChange(false);
  };

  const fieldClass =
    "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-soft outline-none transition-all focus:border-primary focus:shadow-focus";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this person's details."
              : "Enter the details for the new team member."}
          </DialogDescription>
        </DialogHeader>

        {/* Both panels live inside one <form> so submitting from either tab
            saves the whole record in a single write. */}
        <form onSubmit={handleSubmit}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as FormTab)}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
            </TabsList>

            {/* forceMount keeps the hidden tab's inputs in the DOM so edits on
                one tab aren't lost by switching to the other.

                The grid lives on an inner wrapper, not on TabsContent itself:
                `hidden` is only a UA-stylesheet `display:none`, so a `display`
                utility on the same element would outrank it and leave this
                panel visible while the Credentials tab is selected. */}
            <TabsContent value="details" forceMount hidden={tab !== "details"}>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 md:col-span-3">
                  <Label>Profile photo</Label>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      {values.avatar && <AvatarImage src={values.avatar} alt={values.name} />}
                      <AvatarFallback className="text-base">{initials(values.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" /> {values.avatar ? "Change" : "Upload"}
                      </Button>
                      {values.avatar && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => set("avatar", undefined)}
                        >
                          <Trash2 className="h-4 w-4" /> Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  {errors.avatar ? (
                    <p className="text-xs text-destructive">{errors.avatar}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">JPG, PNG or GIF, up to 2 MB.</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2 md:col-span-2">
                  <Label htmlFor="emp-name">Full name</Label>
                  <input
                    id="emp-name"
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                    className={cn(fieldClass, errors.name && "border-destructive/70")}
                    placeholder="Jane Doe"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
                  <Label htmlFor="emp-email">Email</Label>
                  <input
                    id="emp-email"
                    type="email"
                    value={values.email}
                    onChange={(e) => set("email", e.target.value)}
                    className={cn(fieldClass, errors.email && "border-destructive/70")}
                    placeholder="jane.doe@aurora.app"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-role">Role</Label>
                  <Select id="emp-role" value={values.role} onChange={(e) => set("role", e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-dept">Department</Label>
                  <Select id="emp-dept" value={values.department} onChange={(e) => set("department", e.target.value)}>
                    <option value="" disabled>
                      Select a department…
                    </option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                  {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-status">Status</Label>
                  <Select
                    id="emp-status"
                    value={values.status}
                    onChange={(e) => set("status", e.target.value as EmployeeStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-type">Employment type</Label>
                  <Select
                    id="emp-type"
                    value={values.employmentType ?? "Regular"}
                    onChange={(e) => set("employmentType", e.target.value as EmployeeType)}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-payclass">Pay class</Label>
                  <Select
                    id="emp-payclass"
                    value={values.payClass ?? "Tier 1"}
                    onChange={(e) => set("payClass", e.target.value as PayClass)}
                  >
                    {PAY_CLASSES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-location">Location</Label>
                  <Select id="emp-location" value={values.location} onChange={(e) => set("location", e.target.value)}>
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-agency">Agency</Label>
                  <Select
                    id="emp-agency"
                    value={values.agency ?? ""}
                    onChange={(e) => set("agency", e.target.value || undefined)}
                  >
                    <option value="">— None (direct) —</option>
                    {agencyOptions.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </Select>
                  {agencies.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No agencies registered yet — add them under Settings → Agencies.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-joined">Joined</Label>
                  <input
                    id="emp-joined"
                    type="date"
                    value={values.joined}
                    onChange={(e) => set("joined", e.target.value)}
                    className={fieldClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tenure: <span className="font-medium text-foreground">{tenureFrom(values.joined)}</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-salary">Salary (PHP)</Label>
                  <input
                    id="emp-salary"
                    type="number"
                    min={0}
                    step={1000}
                    value={values.salary}
                    onChange={(e) => set("salary", Number(e.target.value))}
                    className={cn(fieldClass, errors.salary && "border-destructive/70")}
                  />
                  {errors.salary && <p className="text-xs text-destructive">{errors.salary}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2 md:col-span-3">
                  <Label htmlFor="emp-bioid">Bio ID</Label>
                  <input
                    id="emp-bioid"
                    inputMode="numeric"
                    value={values.bioId ?? ""}
                    onChange={(e) => set("bioId", e.target.value)}
                    className={cn(fieldClass, errors.bioId && "border-destructive/70")}
                    placeholder="Biometric device enrollment no. (e.g. 10245)"
                  />
                  {errors.bioId ? (
                    <p className="text-xs text-destructive">{errors.bioId}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Optional — the fingerprint/timekeeping device ID for this employee.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="credentials" forceMount hidden={tab !== "credentials"}>
              <CredentialPanel values={values} onChange={setCredential} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add employee"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
