/**
 * Per-user access control. A user's `access` list holds the nav `to` paths of
 * the modules they may open; the sentinel {@link ALL_ACCESS} grants everything
 * (administrators). Enforcement lives in the sidebar (hides links) and the
 * route guard (blocks direct URL navigation) — see AppLayout/App.
 */
import { navItems, type NavItem } from "@/config/nav";

/** Sentinel in a user's `access` list meaning "every module". */
export const ALL_ACCESS = "*";

/**
 * Routes every signed-in user may open regardless of their configured access.
 *
 * Dashboard is the landing route — without it login would dead-end. My
 * Workspace is self-service: it shows only the viewer's own payslips, leave and
 * attendance, so there is nothing to gate. Making it grantable would mean an
 * employee could be denied sight of their own pay.
 */
export const ALWAYS_ALLOWED = ["/", "/my"];

/** Modules an admin can grant/revoke, in sidebar order (Dashboard excluded). */
export const CONTROLLABLE_MODULES: NavItem[] = navItems.filter(
  (i) => !ALWAYS_ALLOWED.includes(i.to),
);

/** Default access for a brand-new user — Dashboard only, until granted more. */
export const DEFAULT_ACCESS: string[] = [...ALWAYS_ALLOWED];

/** Full access list (every controllable module) — used for admin roles. */
export function fullAccess(): string[] {
  return [ALL_ACCESS];
}

/** Does this access list grant every module? */
export function hasFullAccess(access: string[] | undefined): boolean {
  return !!access?.includes(ALL_ACCESS);
}

/** Can a user with `access` open the module at nav path `to`? */
export function canAccess(access: string[] | undefined, to: string): boolean {
  if (ALWAYS_ALLOWED.includes(to)) return true;
  if (!access) return false;
  return access.includes(ALL_ACCESS) || access.includes(to);
}
