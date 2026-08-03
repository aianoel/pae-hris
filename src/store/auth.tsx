import * as React from "react";

import { useStore } from "@/store/store-context";
import { hasFullAccess } from "@/lib/access";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { setActiveActor } from "@/lib/clientInfo";
import { db } from "@/lib/db/api";
import {
  EMPLOYEE_ROLE,
  OAUTH_SCOPES,
  admitOAuthEmployee,
  employeeSessionAccess,
  isThirdPartyProvider,
  oauthRejectionMessage,
  providerLabel,
  signUpRejectionMessage,
} from "@/lib/oauthAccess";
import {
  AuthContext,
  type AuthUser,
  type AuthContextValue,
} from "@/store/auth-context";
import type { Employee, User } from "@/store/types";

/**
 * Auth session.
 *
 * Login goes through Supabase Auth (`signInWithPassword`) and the session is
 * restored/persisted by supabase-js. The signed-in email is then matched to an
 * app `users` row to carry the per-module access list that gates the
 * sidebar/routes.
 *
 * There are two ways in, and they are NOT equivalent:
 *
 *   • Email + password — resolves against the app `users` table, so it can
 *     carry any access list including admin ('*').
 *   • Google / Microsoft — employees only. The provider proves identity; the
 *     HR roster decides employment. The email must match an `employees` row,
 *     and the resulting session is clamped to self-service access no matter
 *     what `users` says. See lib/oauthAccess.ts for why.
 *
 * There is NO offline/in-memory login path and NO break-glass credential: a
 * configured Supabase backend is mandatory (the app refuses to mount without
 * one — see RequireBackend in App.tsx). Every account is a real Supabase Auth
 * user; access is authorized server-side by Row Level Security.
 *
 * No app state is written to localStorage: the session is restored from the
 * Supabase Auth session and the user profile is re-resolved from the database
 * `users` table on every load.
 */

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, addLog } = useStore();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  // Set when Supabase reports a PASSWORD_RECOVERY event (the user arrived from
  // a reset link). The app then forces the "set a new password" screen.
  const [recovery, setRecovery] = React.useState(false);

  // Keep the module-level audit actor in sync with the signed-in user, so
  // addLog() (which lives above this provider) attributes events correctly.
  // Runs for the restored session on mount, session changes, and logout.
  React.useEffect(() => {
    setActiveActor(user ? user.name || user.email : null, user?.email ?? null);
  }, [user]);

  /** Resolve an email to an AuthUser by matching an app users row. */
  const resolveAppUser = React.useCallback(
    (email: string): AuthUser => {
      const normalized = email.trim().toLowerCase();
      const match = users.find((u) => u.email.trim().toLowerCase() === normalized);
      if (match) {
        return {
          id: match.id,
          name: match.name,
          email: match.email,
          role: match.role,
          initials: initialsOf(match.name),
          access: match.access?.length ? match.access : ["/"],
        };
      }
      // Signed in but no matching app profile — minimal, dashboard-only access.
      return {
        id: email,
        name: email.split("@")[0],
        email,
        role: "Member",
        initials: initialsOf(email),
        access: ["/"],
      };
    },
    [users],
  );

  /**
   * Build the session for an employee admitted via a social provider.
   *
   * Access is the always-allowed self-service set and the role is the fixed
   * EMPLOYEE_ROLE — deliberately NOT the `users` row and NOT `employee.role`
   * (a free-text job title, which could read "HR" and quietly satisfy
   * canManageLeave). A third-party identity gets exactly one shape of session.
   */
  const employeeAuthUser = React.useCallback((employee: Employee): AuthUser => {
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: EMPLOYEE_ROLE,
      initials: initialsOf(employee.name || employee.email),
      access: employeeSessionAccess(),
    };
  }, []);

  // Held in a ref so the auth subscription below can log without taking addLog
  // as a dependency — it changes identity on every store update, which would
  // tear down and re-create the Supabase listener continuously.
  const addLogRef = React.useRef(addLog);
  React.useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // The provider backing the CURRENT session ("email" for password sign-in).
  // Held as state so the context value re-renders when it changes, and mirrored
  // into a ref for the re-resolve effect below, which must read it without
  // taking it as a dependency. Keeps an OAuth session clamped: a later change
  // to the `users` table must not silently widen its access.
  const [sessionProvider, setSessionProvider] = React.useState<string | null>(null);
  const sessionProviderRef = React.useRef<string | null>(null);
  const setProvider = React.useCallback((p: string | null) => {
    sessionProviderRef.current = p;
    setSessionProvider(p);
  }, []);

  // Why a session was refused, surfaced on the login screen. OAuth rejection
  // happens after the redirect — there is no in-flight promise left to return
  // it to, so it is held here and read by LoginForm.
  const [deniedReason, setDeniedReason] = React.useState<string | null>(null);

  // Restore an existing Supabase session on mount and keep in sync.
  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase;
    let active = true;

    /**
     * Turn a Supabase session into an app session, vetting third-party
     * identities against the HR roster first.
     *
     * `announce` is false when merely restoring an existing session on load —
     * a reload is not a new sign-in and must not write an audit entry.
     */
    const applySession = async (
      session: { user?: { email?: string; app_metadata?: { provider?: string } } } | null,
      announce: boolean,
    ) => {
      const email = session?.user?.email ?? null;
      const provider = session?.user?.app_metadata?.provider ?? null;
      setProvider(session ? provider ?? "email" : null);

      // No session at all (signed out) — nothing to vet.
      if (!session) {
        if (active) setUser(null);
        return;
      }

      // Password sign-in with a provisioned `users` row: that row is the
      // authority, as before — this is the admin path.
      //
      // Without one, the address is NOT automatically a stranger to turn away:
      // self-registered employees (see signUpEmployee) also arrive as
      // provider:"email" and have no `users` row by design. So fall through to
      // the roster check rather than resolving to a default profile — doing the
      // latter would hand anyone who completed sign-up a session, making the
      // registration form a way in for non-staff.
      if (!isThirdPartyProvider(provider)) {
        if (!email) {
          if (active) setUser(null);
          return;
        }
        let appUser: User | null = null;
        try {
          appUser = await db.userByEmail(email);
        } catch (err) {
          // Can't tell admin from employee. Fall through to the roster check:
          // it fails closed, so the worst case is a legitimate admin being told
          // to retry — never an unvetted session.
          // eslint-disable-next-line no-console
          console.error("[aurora] users lookup failed during sign-in", err);
        }
        if (appUser) {
          if (active) setUser(resolveAppUser(email));
          return;
        }
      }

      // A social session that carries no email claim can't be matched against
      // the roster, so it can't be admitted. Entra is the usual cause when the
      // `email` scope (see OAUTH_SCOPES) isn't granted. Fall through to the
      // same refusal path rather than returning early — otherwise the session
      // would stay live, unvetted and silent.
      if (!email) {
        if (!active) return;
        setUser(null);
        setDeniedReason(oauthRejectionMessage("no-email"));
        setActiveActor(null);
        addLogRef.current(
          "auth",
          `blocked ${providerLabel(provider)} sign-in (no email claim)`,
          "login",
        );
        await sb.auth.signOut();
        return;
      }

      // Social sign-in: employees only.
      let employee: Employee | null = null;
      try {
        employee = await db.employeeByEmail(email);
      } catch (err) {
        // Couldn't reach the roster — refuse rather than guess, but say so
        // distinctly so a network blip doesn't read as "you were fired".
        // eslint-disable-next-line no-console
        console.error("[aurora] roster check failed during OAuth sign-in", err);
        if (!active) return;
        setUser(null);
        setDeniedReason("Couldn't verify your employee record. Please try again in a moment.");
        await sb.auth.signOut();
        return;
      }

      const verdict = admitOAuthEmployee(email, employee ? [employee] : []);
      if (!active) return;

      if (!verdict.ok) {
        // Tear the session down: leaving it live would keep a valid Supabase
        // JWT in storage for someone the app just refused, and RLS grants every
        // authenticated user read access to the shared HR tables.
        setUser(null);
        setDeniedReason(oauthRejectionMessage(verdict.reason));
        setActiveActor(null);
        addLogRef.current(
          "auth",
          `blocked ${providerLabel(provider)} sign-in for ${email} (${verdict.reason})`,
          "login",
        );
        await sb.auth.signOut();
        return;
      }

      const next = employeeAuthUser(verdict.employee);
      setDeniedReason(null);
      setUser(next);
      if (announce) {
        // Set the actor before logging so the entry is attributed correctly —
        // the sync effect above hasn't run yet at this point.
        setActiveActor(next.name || next.email, next.email);
        addLogRef.current(
          "auth",
          `signed in via ${providerLabel(provider)} (${next.email})`,
          "login",
        );
      }
    };

    void sb.auth.getSession().then(({ data }) => {
      if (active) void applySession(data.session, false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // Arriving from a reset link signs the user in with a recovery session.
      // Flag it so the app routes to the "set a new password" screen; the flag
      // is cleared once the new password is committed (or on sign-out).
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);

      // An OAuth redirect lands here rather than in loginWithProvider(), which
      // has already returned by the time the provider sends the user back — so
      // this is where the roster check and its audit entry happen. Only
      // SIGNED_IN counts as new: a restored session on reload fires it too, but
      // INITIAL_SESSION is what a reload reports first.
      void applySession(session, event === "SIGNED_IN");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [resolveAppUser, employeeAuthUser, setProvider]);

  // Re-resolve the signed-in user whenever the app `users` list changes, so an
  // edit to the current user's profile (e.g. Settings → Profile) reflects live
  // — name and initials update without a reload. Keyed on the email so this only
  // re-runs when the roster changes, not on every re-render.
  //
  // Skipped for social sessions: those are clamped to self-service by policy,
  // and re-resolving would hand them whatever the `users` row says — including
  // admin, which is exactly what the clamp exists to prevent.
  const currentEmail = user?.email ?? null;
  React.useEffect(() => {
    if (!currentEmail) return;
    if (isThirdPartyProvider(sessionProviderRef.current)) return;
    setUser(resolveAppUser(currentEmail));
    // resolveAppUser is recreated when `users` changes, which is the trigger.
  }, [currentEmail, resolveAppUser]);

  const login = React.useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const normalized = email.trim().toLowerCase();

      // A configured backend is mandatory (App gates on this); guard anyway so
      // there is never a credential path that bypasses Supabase Auth.
      if (!isSupabaseConfigured || !supabase) {
        addLog("auth", `sign-in blocked (no backend) for ${normalized}`, "login");
        return false;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (error) {
        addLog("auth", `failed sign-in attempt for ${normalized}`, "login");
        return false;
      }
      // A successful password sign-in supersedes any earlier OAuth refusal.
      setDeniedReason(null);
      // onAuthStateChange sets the user; resolve immediately too so the
      // caller can navigate without waiting for the event.
      const authed = resolveAppUser(normalized);
      setUser(authed);
      // Set the actor before logging so this event is attributed to the new
      // user (the sync effect hasn't run yet at this point).
      setActiveActor(authed.name || authed.email, authed.email);
      addLog("auth", `signed in (${authed.email})`, "login");
      return true;
    },
    [resolveAppUser, addLog],
  );

  // Hand off to a third-party identity provider. supabase-js redirects the
  // browser to the provider; the user returns to `redirectTo` with a session in
  // the URL, which supabase-js exchanges and reports via onAuthStateChange —
  // where applySession() vets it against the HR roster.
  //
  // Sign-in only, never sign-up, and employees only: the provider proves who
  // someone is, but the `employees` table is what says they work here. An email
  // that isn't on the roster has its session signed straight back out rather
  // than being provisioned a profile.
  const loginWithProvider = React.useCallback<AuthContextValue["loginWithProvider"]>(
    async (provider) => {
      if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: "A Supabase backend is required to sign in." };
      }

      // Clear any refusal from a previous attempt so the old message doesn't
      // linger behind the new redirect.
      setDeniedReason(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Return to the app's own origin. In production this must also be
          // listed under Supabase → Authentication → URL Configuration, or the
          // provider will refuse the callback.
          redirectTo: window.location.origin,
          // Ask for the email claim explicitly — the roster match depends on
          // it, and Entra can otherwise omit it. See OAUTH_SCOPES.
          scopes: OAUTH_SCOPES[provider],
        },
      });

      if (error) {
        addLog("auth", `failed ${provider} sign-in: ${error.message}`, "login");
        return { ok: false, error: error.message };
      }

      // Redirecting — the audit entry for the completed sign-in is written when
      // the session lands back in onAuthStateChange.
      return { ok: true };
    },
    [addLog],
  );

  // Create a Supabase Auth credential for a new app user. A client-side signUp
  // signs the new user in, replacing the admin's session — so we snapshot the
  // current session first and restore it afterwards, keeping the admin logged in.
  const signUpUser = React.useCallback<AuthContextValue["signUpUser"]>(
    async (email, password) => {
      const normalized = email.trim().toLowerCase();
      if (!password) return { ok: false, error: "A password is required to create a sign-in." };

      // A configured backend is mandatory — every account is a real Supabase
      // Auth credential. Without one there is no way to provision a login.
      if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: "A Supabase backend is required to create sign-ins." };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const prevSession = sessionData.session;

      // Send the email-confirmation link back to the running app (dev:
      // http://localhost:5173, prod: the deployed origin) rather than Supabase's
      // configured Site URL default.
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        // Restore the admin session if signUp swapped it out mid-flight.
        if (prevSession) await supabase.auth.setSession(prevSession);
        return { ok: false, error: error.message };
      }

      // Restore the admin's session (signUp may have auto-signed-in the new user).
      if (prevSession) {
        await supabase.auth.setSession(prevSession);
      } else {
        await supabase.auth.signOut();
      }
      // Re-assert the admin as the active actor for audit attribution.
      if (user) setActiveActor(user.name || user.email, user.email);

      // Supabase obscures "already registered" to prevent email enumeration: it
      // returns a user with an EMPTY identities array and no error. Surface it so
      // the admin knows the credential wasn't (re)created with this password.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        return {
          ok: false,
          error: `${normalized} already has a sign-in. Use it to log in, or reset its password in Supabase.`,
        };
      }

      // Email confirmation is ON when signUp returns a user but no session. The
      // account exists but CANNOT log in until the user confirms via email.
      const needsConfirmation = Boolean(data.user) && !data.session;
      addLog("user", `provisioned sign-in for ${normalized}`, "signup");
      return { ok: true, needsConfirmation };
    },
    [user, addLog],
  );

  /**
   * Public sign-up, from the login screen. Employees only.
   *
   * Same policy as OAuth, different mechanics. The roster lives behind RLS and
   * the `anon` role has NO database access (see db/schema.supabase.sql), so an
   * unauthenticated visitor cannot be checked against `employees` *before*
   * signing up — there is no way to ask. The credential is therefore created
   * first, and vetted the moment a session exists:
   *
   *   • Session returned (email confirmation OFF) — applySession() in the
   *     auth listener does the roster check, and signs the session straight
   *     back out if the address isn't staff. We report the verdict here too so
   *     the form can say something more useful than a generic error.
   *   • No session (email confirmation ON) — nothing to check against yet. The
   *     account exists but is inert until confirmed, and the roster check runs
   *     when they follow the link and a session finally lands. A non-employee
   *     who confirms is bounced at that point.
   *
   * Either way a non-employee ends up with a Supabase Auth credential that can
   * never open an app session. That is the unavoidable cost of RLS having no
   * anon read path; it grants nothing, and admins can clear such accounts from
   * the Supabase dashboard.
   */
  const signUpEmployee = React.useCallback<AuthContextValue["signUpEmployee"]>(
    async (email, password) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) return { ok: false, error: "An email address is required." };
      if (!password) return { ok: false, error: "A password is required." };

      if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: "A Supabase backend is required to create an account." };
      }
      const sb = supabase;

      const { data, error } = await sb.auth.signUp({
        email: normalized,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) return { ok: false, error: error.message };

      // Supabase obscures "already registered" to avoid email enumeration: it
      // returns a user with an EMPTY identities array and no error. Keep that
      // property — say the same thing we would for a fresh address, and point
      // at sign-in rather than confirming the account exists.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        return {
          ok: false,
          error: "If that address can be registered, an account already exists for it. Try signing in, or reset your password.",
        };
      }

      // Confirmation required: no session yet, so the roster check has to wait
      // for the confirmation link. Don't claim they're in.
      if (!data.session) {
        addLog("auth", `sign-up started for ${normalized}`, "signup");
        return { ok: true, needsConfirmation: true };
      }

      // Signed in immediately — vet now so the form can report the refusal.
      // applySession() is running the same check off the SIGNED_IN event and
      // owns tearing the session down; this call only decides what to say.
      let employee: Employee | null = null;
      try {
        employee = await db.employeeByEmail(normalized);
      } catch {
        // The listener will refuse the session on its own roster-check failure.
        return {
          ok: false,
          error: "Couldn't verify your employee record. Please try again in a moment.",
        };
      }

      const verdict = admitOAuthEmployee(normalized, employee ? [employee] : []);
      if (!verdict.ok) {
        addLog("auth", `blocked sign-up for ${normalized} (${verdict.reason})`, "signup");
        // Belt and braces: applySession() signs this out too, but that depends
        // on the event firing. A credential we just refused must not keep a
        // live session under any ordering.
        await sb.auth.signOut();
        return { ok: false, error: signUpRejectionMessage(verdict.reason) };
      }

      addLog("auth", `signed up ${normalized}`, "signup");
      return { ok: true, needsConfirmation: false };
    },
    [addLog],
  );

  // Email a password-recovery link. Unlike signUpUser this never mints or
  // swaps a session, so the admin's session is untouched — Supabase just sends
  // the mail and the recipient sets their own password via the link.
  const sendPasswordReset = React.useCallback<AuthContextValue["sendPasswordReset"]>(
    async (email) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) return { ok: false, error: "An email address is required." };
      if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: "A Supabase backend is required to send password resets." };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        // Land the recovery link back on the running app rather than Supabase's
        // configured Site URL default.
        redirectTo: window.location.origin,
      });
      if (error) return { ok: false, error: error.message };

      addLog("auth", `sent password reset link to ${normalized}`, "password-reset");
      return { ok: true };
    },
    [addLog],
  );

  // Commit the new password for the recovery session opened by the reset link.
  const completePasswordReset = React.useCallback<AuthContextValue["completePasswordReset"]>(
    async (password) => {
      if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: "A Supabase backend is required to reset passwords." };
      }
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, error: error.message };

      setRecovery(false);
      addLog("auth", `password reset completed (${data.user?.email ?? "unknown"})`, "password-reset");
      return { ok: true };
    },
    [addLog],
  );

  const logout = React.useCallback(() => {
    if (user) addLog("auth", `signed out (${user.email})`, "logout");
    setUser(null);
    setRecovery(false);
    setDeniedReason(null);
    setProvider(null);
    if (isSupabaseConfigured && supabase) {
      void supabase.auth.signOut();
    }
  }, [user, addLog, setProvider]);

  const clearDenied = React.useCallback(() => setDeniedReason(null), []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      loginWithProvider,
      logout,
      isAdmin: hasFullAccess(user?.access),
      // A social session is self-service by construction; surface it so the UI
      // can say so rather than making the user infer it from a short sidebar.
      isEmployeeSession: isThirdPartyProvider(sessionProvider),
      deniedReason,
      clearDenied,
      sessionProvider,
      signUpUser,
      signUpEmployee,
      sendPasswordReset,
      recovery,
      completePasswordReset,
    }),
    [
      user,
      login,
      loginWithProvider,
      logout,
      deniedReason,
      clearDenied,
      // isEmployeeSession is derived from this — omitting it would leave the
      // clamp flag stale whenever the provider changes without `user` also
      // changing, e.g. a refused OAuth session (provider set, user stays null).
      sessionProvider,
      signUpUser,
      signUpEmployee,
      sendPasswordReset,
      recovery,
      completePasswordReset,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
