-- Migration: add employees.employment_type
-- Adds the employment classification (Regular/Probationary/Contractual/Part-time)
-- to an already-provisioned database. The employee_type enum already exists
-- (used by payroll_entries). Tenure is derived from `joined` at read time and is
-- NOT stored. Safe to run more than once.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/002_employees_employment_type.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/002_employees_employment_type.sql

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS employment_type public.employee_type NOT NULL DEFAULT 'Regular';

ALTER TABLE IF EXISTS aurora.employees
  ADD COLUMN IF NOT EXISTS employment_type aurora.employee_type NOT NULL DEFAULT 'Regular';
