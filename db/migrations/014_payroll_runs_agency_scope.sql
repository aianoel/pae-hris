-- Migration: record the agency scope a payroll run actually paid
--
-- A run scoped to one agency was stored with nothing but its period, so the
-- Payroll Report's "has this period been processed?" check matched on period
-- alone: processing a single agency unlocked the register for every other
-- agency in that month, showing figures for staff who had not been run.
--
-- agency_scope mirrors payroll_approvals.agency_scope:
--   NULL = whole-company run (covers everyone)
--   ''   = direct hires only
--   else = the agency name
--
-- Existing rows stay NULL, which is correct: they were whole-company runs.
-- The full schema*.sql files already include the column for fresh installs;
-- this provisions it on an existing database. Safe to re-run.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/014_payroll_runs_agency_scope.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/014_payroll_runs_agency_scope.sql

DO $$ BEGIN
  IF to_regclass('public.payroll_runs') IS NOT NULL THEN
    ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS agency_scope text;
  END IF;
  IF to_regclass('aurora.payroll_runs') IS NOT NULL THEN
    ALTER TABLE aurora.payroll_runs ADD COLUMN IF NOT EXISTS agency_scope text;
  END IF;
END $$;

-- Reports filter runs by period + scope; index the pair they are looked up on.
DO $$ BEGIN
  IF to_regclass('public.payroll_runs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_period_scope
      ON public.payroll_runs (period, agency_scope);
  END IF;
  IF to_regclass('aurora.payroll_runs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_period_scope
      ON aurora.payroll_runs (period, agency_scope);
  END IF;
END $$;
