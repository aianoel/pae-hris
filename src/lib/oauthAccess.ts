/**
 * Admission policy for self-service sign-in — the two ways into this app that
 * nobody vetted in advance: a third-party provider (Google / Microsoft) and
 * public sign-up.
 *
 * Both prove *who someone is* and neither says anything about whether they work
 * here — anyone in the world can present a valid Google account or fill in a
 * registration form. So identity is only half the check: the email must also
 * match a row on the HR roster (`employees`), which is this app's record of
 * employment.
 *
 * Everything admitted this way is clamped to the EMPLOYEE role: self-service
 * only, no admin modules. That holds even when the same address also has an
 * elevated `users` row — administering payroll must not be reachable from a
 * consumer Google or Microsoft account (whose recovery flow is outside this
 * organisation's control), nor from a password someone chose for themselves on
 * a public form. Admin accounts are provisioned by an existing admin from
 * Users → Add user, and only that path can carry elevated access.
 *
 * SCOPE IS NOT SECURITY. Like `selfService.ts`, this is a client-side clamp on
 * what the UI offers. The data tables are still `FOR ALL TO authenticated` (see
 * db/schema.supabase.sql), so a signed-in employee could read other rows via
 * devtools. Closing that needs per-row RLS on the Supabase side; this module
 * narrows *who gets a session at all*, which is the half that can be enforced
 * from here.
 */
import type { Employee } from "@/store/types";
import { ALWAYS_ALLOWED } from "@/lib/access";

/** Supabase provider ids behind the two buttons on the sign-in screen. */
export const OAUTH_PROVIDERS = ["google", "azure"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

/** The app role every self-service sign-in (OAuth or sign-up) resolves to. */
export const EMPLOYEE_ROLE = "Employee";

/**
 * Scopes requested per provider.
 *
 * Microsoft Entra (`azure`) is the reason this exists: without an explicit
 * `email` scope it can return a session carrying only an object id and no email
 * claim, and an email is exactly what this policy matches the roster on. Google
 * includes it by default but asking is harmless and keeps the two symmetrical.
 */
export const OAUTH_SCOPES: Record<OAuthProviderId, string> = {
  google: "email profile",
  azure: "openid email profile",
};

/** Is this session's identity from a social provider rather than a password? */
export function isThirdPartyProvider(provider: string | null | undefined): boolean {
  return Boolean(provider) && provider !== "email";
}

/** Human label for a provider id, for messages and audit entries. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === "google") return "Google";
  if (provider === "azure") return "Microsoft";
  return provider || "provider";
}

export type OAuthRejection = "no-email" | "not-on-roster" | "inactive";

export type OAuthAdmission =
  | { ok: true; employee: Employee }
  | { ok: false; reason: OAuthRejection };

/**
 * Decide whether a third-party identity may open a session.
 *
 * Matched on email, trimmed and lowercased: providers hand back whatever case
 * the user typed at signup, and "A@x.com" is the same mailbox as "a@x.com" (the
 * `employees.email` column is citext, so the backend agrees).
 *
 * `on-leave` staff are admitted — they are still employed, and self-service is
 * precisely where they would go to check their own leave balance. Only
 * `inactive` (off the books) is refused.
 */
export function admitOAuthEmployee(
  email: string | null | undefined,
  employees: Employee[],
): OAuthAdmission {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "no-email" };

  const match = employees.find((e) => e.email.trim().toLowerCase() === normalized);
  if (!match) return { ok: false, reason: "not-on-roster" };
  if (match.status === "inactive") return { ok: false, reason: "inactive" };

  return { ok: true, employee: match };
}

/**
 * Module access for an admitted employee: the always-allowed self-service
 * routes and nothing else. Returned as a fresh array so a caller mutating the
 * session's access list can't rewrite the shared constant.
 */
export function employeeSessionAccess(): string[] {
  return [...ALWAYS_ALLOWED];
}

/**
 * What to tell someone who was refused.
 *
 * Deliberately identical for "not on the roster" and "no email claim": the
 * sign-in screen is unauthenticated, and distinguishing them would let a
 * stranger use the button to test whether an address is on staff.
 */
export function oauthRejectionMessage(reason: OAuthRejection): string {
  if (reason === "inactive") {
    return "This account is no longer active. Contact HR if you believe this is a mistake.";
  }
  return "This sign-in is for employees only. Use the email and password issued for your account, or contact HR.";
}

/**
 * What to tell someone whose sign-up was refused.
 *
 * Same enumeration concern as {@link oauthRejectionMessage}, and then some: the
 * registration form is the most convenient oracle an attacker could ask for, so
 * "not on the roster" must not be distinguishable from a mistyped address. The
 * wording explains the rule (work email, must be on the roster) without
 * confirming anything about the address that was entered.
 */
export function signUpRejectionMessage(reason: OAuthRejection): string {
  if (reason === "inactive") {
    return "This account is no longer active. Contact HR if you believe this is a mistake.";
  }
  return "We couldn't match that address to an employee record. Use the work email HR holds for you, or contact HR to get set up.";
}
