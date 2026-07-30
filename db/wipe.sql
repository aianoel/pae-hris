-- =============================================================================
-- Aurora — wipe all operational data, keep ONLY the admin user + Administrator
-- role + workspace settings.
-- =============================================================================
-- The app reads its data from Supabase (this project). Clearing local seed
-- files has no effect on rows already in the database — run this instead.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → New query → paste this file → Run.
--   (The SQL Editor uses the service role, so RLS does not block these deletes.)
--
-- Rows are deleted child-first to satisfy foreign keys:
--   payroll_entries → attendance_records → employees → departments
--   users/roles are trimmed to the single Administrator.
-- =============================================================================

BEGIN;

-- Payroll detail + attendance reference employees → delete before employees.
DELETE FROM public.payroll_entries;
DELETE FROM public.attendance_records;
DELETE FROM public.payroll_runs;
DELETE FROM public.contribution_rates;

-- Standalone record tables.
DELETE FROM public.reports;
DELETE FROM public.documents;
DELETE FROM public.notifications;
DELETE FROM public.log_entries;

-- Employees reference departments(name) → employees first, then departments.
DELETE FROM public.employees;
DELETE FROM public.departments;

-- Keep only the admin user (users.role → roles(name), so trim users first).
DELETE FROM public.users WHERE email <> 'maya@aurora.app';

-- Keep only the Administrator role.
DELETE FROM public.roles WHERE name <> 'Administrator';

-- Make sure the admin user + role exist (idempotent — safe if already present).
INSERT INTO public.roles (id, name, description, members, permissions)
VALUES ('ROLE-01', 'Administrator', 'Full access to every module.', 1,
        '{"view":true,"create":true,"edit":true,"delete":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, name, email, role, status, last_active, access, password)
VALUES ('USR-01', 'Maya Kapoor', 'maya@aurora.app', 'Administrator', 'active',
        'just now', ARRAY['*'], 'aurora2026')
ON CONFLICT (id) DO NOTHING;

-- Settings kept as-is. (Uncomment to reset the members counter on the role.)
-- UPDATE public.roles SET members = 1 WHERE name = 'Administrator';

COMMIT;

-- Verify:
--   SELECT 'employees' t, count(*) FROM public.employees
--   UNION ALL SELECT 'users', count(*) FROM public.users
--   UNION ALL SELECT 'departments', count(*) FROM public.departments
--   UNION ALL SELECT 'payroll_runs', count(*) FROM public.payroll_runs;
