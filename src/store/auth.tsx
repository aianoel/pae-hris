import * as React from "react";

import { useStore } from "@/store/store-context";
import { hasFullAccess } from "@/lib/access";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { setActiveActor } from "@/lib/clientInfo";
import {
  AuthContext,
  type AuthUser,
  type AuthContextValue,
} from "@/store/auth-context";

/**
 * Auth session.
 *
 * Login goes through Supabase Auth (`signInWithPassword`) and the session is
 * restored/persisted by supabase-js. The signed-in email is then matched to an
 * app `users` row to carry the per-module access list that gates the
 * sidebar/routes.
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

  // Restore an existing Supabase session on mount and keep in sync.
  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (active && email) {
        setUser(resolveAppUser(email));
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // Arriving from a reset link signs the user in with a recovery session.
      // Flag it so the app routes to the "set a new password" screen; the flag
      // is cleared once the new password is committed (or on sign-out).
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      const email = session?.user?.email;
      setUser(email ? resolveAppUser(email) : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [resolveAppUser]);

  // Re-resolve the signed-in user whenever the app `users` list changes, so an
  // edit to the current user's profile (e.g. Settings → Profile) reflects live
  // — name and initials update without a reload. Keyed on the email so this only
  // re-runs when the roster changes, not on every re-render.
  const currentEmail = user?.email ?? null;
  React.useEffect(() => {
    if (!currentEmail) return;
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
    if (isSupabaseConfigured && supabase) {
      void supabase.auth.signOut();
    }
  }, [user, addLog]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      isAdmin: hasFullAccess(user?.access),
      signUpUser,
      sendPasswordReset,
      recovery,
      completePasswordReset,
    }),
    [user, login, logout, signUpUser, sendPasswordReset, recovery, completePasswordReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
