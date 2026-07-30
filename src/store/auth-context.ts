import * as React from "react";

/**
 * Auth context + hook, kept in a component-free module.
 *
 * This lives apart from `AuthProvider` on purpose: a file that mixes component
 * and non-component exports is not a valid React Fast Refresh boundary, so
 * editing it re-runs the module and mints a brand-new context object. Consumers
 * compiled against the previous version would then read `null` and throw
 * "useAuth must be used within <AuthProvider>". Isolating the context here keeps
 * its identity stable across HMR updates.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  /** Module nav paths this user may open ("*" = all). Drives access gating. */
  access: string[];
}

export interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  /** True when the signed-in user has unrestricted (admin) access. */
  isAdmin: boolean;
  /**
   * Provision a Supabase Auth credential for a newly-created app user so they
   * can actually sign in. Preserves the current (admin) session across the
   * signUp. No-op returning ok:true in offline mode (in-memory login handles it).
   */
  signUpUser: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
