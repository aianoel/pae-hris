-- =============================================================================
-- Aurora — remove ONLY the demo seed rows, keep the admin user + everything
-- created through the app.
-- =============================================================================
-- Targets the exact IDs/patterns the app inserts when seeding empty tables
-- (see src/store/seed.ts, src/lib/data.ts, src/lib/contributions.ts). Any rows
-- you added later (different IDs) are left untouched.
--
-- Kept on purpose: user USR-01 (maya@aurora.app) and role ROLE-01 (Administrator).
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → New query → paste → Run.
--   (The SQL Editor runs as service role, so RLS does not block these deletes.)
--
-- Deletes are child-first to satisfy foreign keys.
-- =============================================================================

BEGIN;

-- Payroll detail references seeded runs/employees → clear first.
DELETE FROM public.payroll_entries
  WHERE run_id LIKE 'PAY-%' OR employee_id LIKE 'EMP-1%';

-- Seeded attendance rows: ATT-<n>, tied to seeded employees.
DELETE FROM public.attendance_records
  WHERE id LIKE 'ATT-%' OR employee_id LIKE 'EMP-1%';

-- Seeded payroll runs: PAY-2026-09 / -10 / -11.
DELETE FROM public.payroll_runs WHERE id LIKE 'PAY-2026-%';

-- Seeded contribution brackets: CR-<n>.
DELETE FROM public.contribution_rates WHERE id LIKE 'CR-%';

-- Seeded reports / documents / notifications / logs.
DELETE FROM public.reports        WHERE id IN ('RPT-01', 'RPT-02');
DELETE FROM public.documents      WHERE id IN ('DOC-01', 'DOC-02', 'DOC-03', 'DOC-04');
DELETE FROM public.notifications  WHERE id IN ('1', '2', '3', '4');
DELETE FROM public.log_entries    WHERE id LIKE 'LOG-%';

-- Seeded employees: EMP-1024 .. EMP-1071 (all match EMP-1xxx).
DELETE FROM public.employees WHERE id LIKE 'EMP-1%';

-- Seeded departments: DEP-1 .. DEP-5.
DELETE FROM public.departments WHERE id LIKE 'DEP-%';

-- Seeded non-admin users: USR-02 .. USR-06 (keep USR-01, the admin).
DELETE FROM public.users WHERE id LIKE 'USR-%' AND id <> 'USR-01';

-- Seeded non-admin roles: ROLE-02 .. ROLE-04 (keep ROLE-01, Administrator).
DELETE FROM public.roles WHERE id LIKE 'ROLE-%' AND id <> 'ROLE-01';

COMMIT;

-- Verify what remains:
--   SELECT 'employees'    t, count(*) FROM public.employees
--   UNION ALL SELECT 'users',       count(*) FROM public.users
--   UNION ALL SELECT 'roles',       count(*) FROM public.roles
--   UNION ALL SELECT 'departments', count(*) FROM public.departments
--   UNION ALL SELECT 'payroll_runs',count(*) FROM public.payroll_runs;
