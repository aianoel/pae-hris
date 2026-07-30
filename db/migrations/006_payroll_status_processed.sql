-- Migration: add 'processed' to payroll_status enum
-- A payroll run now stops at 'processed' (awaiting approval) after processing;
-- only Approve on the Payroll Report promotes it to 'paid'. Previously runs
-- jumped straight to 'paid', which the report read as "already approved".
-- The full schema*.sql files already include it for fresh installs; this
-- provisions it on an existing database. Safe to re-run.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/006_payroll_status_processed.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/006_payroll_status_processed.sql

-- Add the value only if it's missing (ADD VALUE IF NOT EXISTS is idempotent).
DO $$ BEGIN
  IF to_regtype('public.payroll_status') IS NOT NULL THEN
    ALTER TYPE public.payroll_status ADD VALUE IF NOT EXISTS 'processed' AFTER 'processing';
  END IF;
  IF to_regtype('aurora.payroll_status') IS NOT NULL THEN
    ALTER TYPE aurora.payroll_status ADD VALUE IF NOT EXISTS 'processed' AFTER 'processing';
  END IF;
END $$;
