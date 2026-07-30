-- Migration 008: harden Row Level Security on the privilege tables.
-- =============================================================================
-- PROBLEM this fixes
--   Every table had ONE permissive policy: FOR ALL TO authenticated
--   USING(true) WITH CHECK(true). That makes the app's access control
--   (the users.access[] list, the sidebar filter, the RequireAccess route
--   guard) purely cosmetic: any signed-in user could open the browser console
--   and call e.g.
--       supabase.from('users').update({ access: ['*'] }).eq('email', <self>)
--   to promote themselves to admin, or read/alter roles & settings directly —
--   completely bypassing the UI.
--
-- WHAT this does (server-side, so it cannot be bypassed from the client)
--   • users    — a user may read ONLY their own row; admins read all. Only
--                admins may INSERT/UPDATE/DELETE (so nobody can self-grant
--                access or edit another account).
--   • roles    — any signed-in user may read (the UI needs the role list);
--                only admins may write (permissions are the security boundary).
--   • settings — any signed-in user may read; only admins may write workspace
--                configuration.
--   • Drops the dead plaintext `users.password` column — credentials live in
--     Supabase Auth; this column was unused and readable at rest.
--
-- The data tables (employees, payroll_*, attendance_records, departments,
-- agencies, contribution_rates, reports, documents, notifications,
-- log_entries) are intentionally LEFT as authenticated-full-CRUD: this app's
-- model is that any signed-in staff member operates on shared HR data. Tighten
-- those later with per-module policies if needed.
--
-- Idempotent & safe to re-run. Apply to Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/008_harden_privilege_rls.sql
--   -- or paste into the Supabase SQL Editor and Run.
-- After applying, PostgREST must reload: this file runs NOTIFY at the end.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so they read public.users regardless of the caller's
-- RLS (also avoids infinite recursion when used inside the users policy). The
-- search_path is pinned so the definer function can't be hijacked.
-- -----------------------------------------------------------------------------

-- The email of the currently authenticated request, from the Supabase JWT.
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
$$;

-- Is the current request an app administrator? True when the signed-in email
-- matches a users row whose access[] contains the '*' (ALL_ACCESS) sentinel.
-- citext email column → the '=' comparison is case-insensitive.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email = public.auth_email()
      AND '*' = ANY (u.access)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()   TO authenticated;

-- -----------------------------------------------------------------------------
-- users — self-read, admin-everything.
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all_users ON public.users;
DROP POLICY IF EXISTS users_select_self_or_admin ON public.users;
DROP POLICY IF EXISTS users_admin_insert          ON public.users;
DROP POLICY IF EXISTS users_admin_update          ON public.users;
DROP POLICY IF EXISTS users_admin_delete          ON public.users;

CREATE POLICY users_select_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin() OR email = public.auth_email());

CREATE POLICY users_admin_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY users_admin_update ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY users_admin_delete ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- roles — everyone signed-in may read; only admins may write.
-- -----------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all_roles ON public.roles;
DROP POLICY IF EXISTS roles_select_authenticated ON public.roles;
DROP POLICY IF EXISTS roles_admin_write          ON public.roles;

CREATE POLICY roles_select_authenticated ON public.roles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY roles_admin_write ON public.roles
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- settings — everyone signed-in may read; only admins may write.
-- -----------------------------------------------------------------------------
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all_settings ON public.settings;
DROP POLICY IF EXISTS settings_select_authenticated ON public.settings;
DROP POLICY IF EXISTS settings_admin_write          ON public.settings;

CREATE POLICY settings_select_authenticated ON public.settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY settings_admin_write ON public.settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- Drop the dead plaintext credential column (Supabase Auth owns credentials).
-- -----------------------------------------------------------------------------
ALTER TABLE public.users DROP COLUMN IF EXISTS password;

COMMIT;

-- PostgREST caches the schema; force a reload so the dropped column and new
-- policies take effect immediately.
NOTIFY pgrst, 'reload schema';
