/**
 * "Credential Information" panel for the employee form — two grouped sections
 * of edit-in-place rows.
 *
 * Each row shows `Label : + value`. An unset credential renders a blue
 * "+ Add <Field>" prompt; a saved one renders the value in the same blue bold
 * style and stays clickable to edit. Clicking either opens an inline input
 * committed with Enter / blur and abandoned with Escape.
 *
 * Values are held in the parent form's state (not written directly), so the
 * whole employee record still saves through one submit.
 */
import * as React from "react";
import { UserRound, MapPin, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Employee } from "@/store/types";

/** Every employee key this panel edits. */
export const CREDENTIAL_KEYS = [
  "sss",
  "philhealth",
  "pagibig",
  "tin",
  "passport",
  "licence",
  "licenceExpiry",
  "bankName",
  "bankAccount",
  "otherIdName",
  "otherIdNumber",
] as const;

export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export type CredentialValues = Pick<Employee, CredentialKey>;

interface FieldSpec {
  key: CredentialKey;
  /** Prompt shown when empty, e.g. "Add Passport". */
  placeholder: string;
  /** `date` renders a date picker; `numeric` restricts entry to digits. */
  kind?: "text" | "date" | "numeric";
}

/** Section 1 — statutory PH identifiers, one value per row. */
const CREDENTIAL_FIELDS: { label: string; field: FieldSpec }[] = [
  { label: "SSS", field: { key: "sss", placeholder: "Add SSS Number" } },
  { label: "Philhealth", field: { key: "philhealth", placeholder: "Add Philhealth Number" } },
  { label: "Pag-ibig", field: { key: "pagibig", placeholder: "Add Pag-ibig Number" } },
  { label: "TIN", field: { key: "tin", placeholder: "Add TIN" } },
];

/**
 * Section 2 — other credentials. Bank Account and Other ID are compound rows
 * carrying two sub-values (name/type + number).
 */
const OTHER_FIELDS: { label: string; field: FieldSpec; second?: FieldSpec; note?: string }[] = [
  { label: "Passport", field: { key: "passport", placeholder: "Add Passport" } },
  { label: "Licence", field: { key: "licence", placeholder: "Add Driver's License Number" } },
  {
    label: "Licence Expiry",
    field: { key: "licenceExpiry", placeholder: "Add Driver's License Expiry", kind: "date" },
  },
  {
    label: "Bank Account",
    field: { key: "bankName", placeholder: "Add Bank Name" },
    second: { key: "bankAccount", placeholder: "Add Account Number", kind: "numeric" },
    note: "NOTE! Enter numbers only",
  },
  {
    label: "Other ID",
    field: { key: "otherIdName", placeholder: "Add Other ID Name" },
    second: { key: "otherIdNumber", placeholder: "Add Other ID Number" },
  },
];

export function CredentialPanel({
  values,
  onChange,
}: {
  values: CredentialValues;
  onChange: (key: CredentialKey, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-border">
        <SectionHeader icon={<UserRound className="h-4 w-4" />} title="Credential Information" />
        {CREDENTIAL_FIELDS.map(({ label, field }) => (
          <CredentialRow key={field.key} label={label} field={field} values={values} onChange={onChange} />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-border">
        <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Other Credentials" />
        {OTHER_FIELDS.map(({ label, field, second, note }) => (
          <CredentialRow
            key={field.key}
            label={label}
            field={field}
            second={second}
            note={note}
            values={values}
            onChange={onChange}
          />
        ))}
      </section>
    </div>
  );
}

/** Light blue band with a teal title — the section separator. */
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-sky-50 px-4 py-2.5 dark:bg-sky-950/40">
      <span className="text-teal-600 dark:text-teal-400">{icon}</span>
      <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-300">{title}</h4>
    </div>
  );
}

/** One bordered line item: `Label : value` (plus an optional second value). */
function CredentialRow({
  label,
  field,
  second,
  note,
  values,
  onChange,
}: {
  label: string;
  field: FieldSpec;
  second?: FieldSpec;
  note?: string;
  values: CredentialValues;
  onChange: (key: CredentialKey, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 text-sm text-muted-foreground">:</span>

      <EditableValue spec={field} value={values[field.key] ?? ""} onCommit={(v) => onChange(field.key, v)} />

      {second && (
        <>
          <span className="shrink-0 text-sm text-muted-foreground">:</span>
          <EditableValue spec={second} value={values[second.key] ?? ""} onCommit={(v) => onChange(second.key, v)} />
        </>
      )}

      {note && <span className="ml-auto shrink-0 text-xs font-medium text-destructive">{note}</span>}
    </div>
  );
}

/**
 * A single edit-in-place value. Renders the saved value (or an "+ Add …"
 * prompt) until clicked, then swaps to an input. Enter or blur commits;
 * Escape reverts to the value it opened with.
 */
function EditableValue({
  spec,
  value,
  onCommit,
}: {
  spec: FieldSpec;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Seed the draft from the saved value each time the row opens for editing.
  React.useEffect(() => {
    if (editing) {
      setDraft(value);
      // Focus after the input has mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, value]);

  const commit = () => {
    onCommit(spec.kind === "numeric" ? draft.replace(/\D/g, "") : draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={spec.kind === "date" ? "date" : "text"}
        inputMode={spec.kind === "numeric" ? "numeric" : undefined}
        value={draft}
        aria-label={spec.placeholder}
        onChange={(e) =>
          // Digits-only fields reject non-numeric input as it is typed.
          setDraft(spec.kind === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value)
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className={cn(
          "h-8 min-w-0 flex-1 rounded-lg border border-input bg-card px-2.5 text-sm",
          "text-foreground outline-none transition-all focus:border-primary focus:shadow-focus",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-primary hover:underline"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", !value && "font-medium")}>{value || spec.placeholder}</span>
    </button>
  );
}
