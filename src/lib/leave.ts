/**
 * Leave management domain model.
 *
 * A **leave type** is a category of absence the workspace recognises — Vacation
 * Leave, Sick Leave, Maternity Leave and so on. Each carries how many days a
 * year it entitles an employee to, whether those days are paid, and which
 * staffing agencies it applies to.
 *
 * Agency scoping is the point of the module: a manpower agency's contract may
 * grant different leave from a direct hire's, so each type either targets a
 * named set of agencies or applies workspace-wide via {@link ALL_AGENCIES}.
 *
 * Only HR and Administrator roles may create or edit leave types — see
 * `canManageLeave`. Everyone else reads the catalogue.
 */

/** Sentinel in a type's `agencies` list meaning "every agency, including any registered later". */
export const ALL_AGENCIES = "*";

/** Bucket shown in the Agency dropdown for staff engaged directly (no agency). */
export const DIRECT_HIRE = "Direct hire";

/**
 * Internal key for the direct-hire bucket. An employee's `agency` is `""` when
 * they are a direct hire, so that is what a leave type stores — the
 * {@link DIRECT_HIRE} label is display only.
 */
export const DIRECT_HIRE_KEY = "";

export type LeaveStatus = "active" | "inactive";

/** Whether the days off are compensated. */
export type LeavePayRule = "paid" | "unpaid";

export interface LeaveType {
  id: string;
  /** Display name, e.g. "Vacation Leave". Unique per workspace. */
  name: string;
  /** Short code used on reports and payslips, e.g. "VL". Unique, uppercase. */
  code: string;
  description: string;
  /** Days entitled per calendar year. 0 means unlimited / case-by-case. */
  daysPerYear: number;
  /** Paid leave is compensated; unpaid days feed LWOP in payroll. */
  payRule: LeavePayRule;
  /**
   * Agencies this type applies to. Holds {@link ALL_AGENCIES} for a
   * workspace-wide type, otherwise agency names (and {@link DIRECT_HIRE_KEY}
   * for direct hires). Never empty — a type that applies to nobody is rejected
   * by {@link validateLeaveType}.
   */
  agencies: string[];
  /** Whether unused days roll over into the next year. */
  carryOver: boolean;
  /** Whether an employee must file this leave before taking it. */
  requiresApproval: boolean;
  status: LeaveStatus;
  createdAt: string;
}

/** Accent color per pay rule, used for chips/badges. */
export const PAY_RULE_TINT: Record<LeavePayRule, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  unpaid: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const PAY_RULE_LABEL: Record<LeavePayRule, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
};

// ---- Role gating ---------------------------------------------------------

/**
 * Roles allowed to create, edit and delete leave types. Everyone else may view
 * the catalogue but not change it.
 */
export const LEAVE_MANAGER_ROLES = ["Administrator", "HR"] as const;

/**
 * May this user manage the leave catalogue?
 *
 * True for the HR role, and for any administrator — `isAdmin` is derived from
 * unrestricted module access rather than the role label, so a differently-named
 * admin role still qualifies. The role match is case-insensitive so "hr" and
 * "HR" behave the same.
 */
export function canManageLeave(role: string | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!role) return false;
  return LEAVE_MANAGER_ROLES.some((r) => r.toLowerCase() === role.trim().toLowerCase());
}

// ---- Agency scoping ------------------------------------------------------

/** Does this type apply to every agency (now and in future)? */
export const appliesToAllAgencies = (t: Pick<LeaveType, "agencies">) =>
  t.agencies.includes(ALL_AGENCIES);

/**
 * Does `type` apply to an employee engaged through `agency`? Pass `""` (or
 * undefined) for a direct hire.
 */
export function appliesToAgency(
  type: Pick<LeaveType, "agencies">,
  agency: string | undefined,
): boolean {
  if (appliesToAllAgencies(type)) return true;
  return type.agencies.includes(agency ?? DIRECT_HIRE_KEY);
}

/** The active leave types available to an employee at `agency`. */
export function leaveTypesForAgency(
  types: LeaveType[],
  agency: string | undefined,
): LeaveType[] {
  return types.filter((t) => t.status === "active" && appliesToAgency(t, agency));
}

/** Human-readable summary of a type's agency scope, for table cells and chips. */
export function agencyScopeLabel(type: Pick<LeaveType, "agencies">): string {
  if (appliesToAllAgencies(type)) return "All agencies";
  const names = type.agencies.map((a) => (a === DIRECT_HIRE_KEY ? DIRECT_HIRE : a));
  if (names.length === 0) return "No agencies";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/**
 * Every selectable agency scope, in dropdown order: the all-agencies sentinel,
 * the direct-hire bucket, then each registered agency. Agencies already
 * assigned to an employee but not formally registered are included too, so an
 * existing scope never silently disappears from the picker.
 */
export function agencyScopeOptions(
  agencies: { name: string }[],
  employeeAgencies: (string | undefined)[] = [],
): { value: string; label: string }[] {
  const names = new Set<string>(agencies.map((a) => a.name));
  // Direct hire is always offered — staff can be un-assigned from an agency at
  // any time, so the bucket must stay selectable even when nobody is in it.
  for (const a of employeeAgencies) if (a) names.add(a);
  return [
    { value: ALL_AGENCIES, label: "All agencies" },
    { value: DIRECT_HIRE_KEY, label: DIRECT_HIRE },
    ...[...names].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n })),
  ];
}

// ---- Validation ----------------------------------------------------------

export interface LeaveTypeDraft {
  name: string;
  code: string;
  description: string;
  daysPerYear: number;
  payRule: LeavePayRule;
  agencies: string[];
  carryOver: boolean;
  requiresApproval: boolean;
  status: LeaveStatus;
}

export interface LeaveValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof LeaveTypeDraft, string>>;
}

/** Codes are stored uppercase and space-free so they read consistently on reports. */
export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/**
 * Validate a draft leave type against the existing catalogue. `ignoreId` is the
 * row being edited, so a type doesn't clash with itself. Name and code must
 * each be unique (case-insensitively) and at least one agency must be selected.
 */
export function validateLeaveType(
  draft: LeaveTypeDraft,
  existing: LeaveType[],
  ignoreId?: string,
): LeaveValidationResult {
  const errors: LeaveValidationResult["errors"] = {};
  const name = draft.name.trim();
  const code = normalizeCode(draft.code);

  if (!name) errors.name = "Name is required.";
  else if (
    existing.some((t) => t.id !== ignoreId && t.name.trim().toLowerCase() === name.toLowerCase())
  ) {
    errors.name = `A leave type named "${name}" already exists.`;
  }

  if (!code) errors.code = "Code is required.";
  else if (code.length > 8) errors.code = "Code must be 8 characters or fewer.";
  else if (existing.some((t) => t.id !== ignoreId && normalizeCode(t.code) === code)) {
    errors.code = `Code "${code}" is already in use.`;
  }

  if (!Number.isFinite(draft.daysPerYear) || draft.daysPerYear < 0) {
    errors.daysPerYear = "Days per year cannot be negative.";
  } else if (draft.daysPerYear > 365) {
    errors.daysPerYear = "Days per year cannot exceed 365.";
  }

  if (draft.agencies.length === 0) {
    errors.agencies = "Select at least one agency, or choose All agencies.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Collapse an agency selection to its canonical form: picking "All agencies"
 * makes every other choice redundant, so only the sentinel is stored. This
 * keeps `appliesToAgency` cheap and stops a stale named agency from lingering
 * in a workspace-wide type.
 */
export function normalizeAgencies(selected: string[]): string[] {
  if (selected.includes(ALL_AGENCIES)) return [ALL_AGENCIES];
  return [...new Set(selected)];
}

/** A blank draft for the "new leave type" form — sensible PH defaults. */
export function emptyLeaveDraft(): LeaveTypeDraft {
  return {
    name: "",
    code: "",
    description: "",
    daysPerYear: 5,
    payRule: "paid",
    agencies: [ALL_AGENCIES],
    carryOver: false,
    requiresApproval: true,
    status: "active",
  };
}

/**
 * The standard Philippine statutory leave types, offered as one-click presets
 * on an empty catalogue so a new workspace isn't starting from nothing. Each is
 * still fully editable once added.
 */
export const LEAVE_PRESETS: Omit<LeaveTypeDraft, "agencies">[] = [
  {
    name: "Vacation Leave",
    code: "VL",
    description: "Planned time off, filed in advance.",
    daysPerYear: 15,
    payRule: "paid",
    carryOver: true,
    requiresApproval: true,
    status: "active",
  },
  {
    name: "Sick Leave",
    code: "SL",
    description: "Absence due to illness or medical treatment.",
    daysPerYear: 15,
    payRule: "paid",
    carryOver: false,
    requiresApproval: false,
    status: "active",
  },
  {
    name: "Service Incentive Leave",
    code: "SIL",
    description: "Statutory 5-day incentive leave (Labor Code Art. 95).",
    daysPerYear: 5,
    payRule: "paid",
    carryOver: true,
    requiresApproval: true,
    status: "active",
  },
  {
    name: "Maternity Leave",
    code: "ML",
    description: "105-day expanded maternity leave (RA 11210).",
    daysPerYear: 105,
    payRule: "paid",
    carryOver: false,
    requiresApproval: true,
    status: "active",
  },
  {
    name: "Paternity Leave",
    code: "PL",
    description: "7-day paternity leave for married male employees (RA 8187).",
    daysPerYear: 7,
    payRule: "paid",
    carryOver: false,
    requiresApproval: true,
    status: "active",
  },
  {
    name: "Solo Parent Leave",
    code: "SPL",
    description: "7-day leave for qualified solo parents (RA 8972).",
    daysPerYear: 7,
    payRule: "paid",
    carryOver: false,
    requiresApproval: true,
    status: "active",
  },
  {
    name: "Leave Without Pay",
    code: "LWOP",
    description: "Approved absence beyond any paid entitlement.",
    daysPerYear: 0,
    payRule: "unpaid",
    carryOver: false,
    requiresApproval: true,
    status: "active",
  },
];
