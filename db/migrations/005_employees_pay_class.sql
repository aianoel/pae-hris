-- Migration: add employees.pay_class
-- Adds the payroll rate class / salary band (Tier 1/Tier 2/Rank And File/Confidentials) to
-- an already-provisioned database. Introduces the pay_class enum first (guarded
-- so it is safe to run more than once), then the column defaulting to Tier 1.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/005_employees_pay_class.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/005_employees_pay_class.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_class') THEN
    CREATE TYPE public.pay_class AS ENUM ('Tier 1', 'Tier 2', 'Rank And File', 'Confidentials');
  END IF;
END $$;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS pay_class public.pay_class NOT NULL DEFAULT 'Tier 1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'aurora')
     AND NOT EXISTS (
       SELECT 1 FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typname = 'pay_class' AND n.nspname = 'aurora'
     ) THEN
    CREATE TYPE aurora.pay_class AS ENUM ('Tier 1', 'Tier 2', 'Rank And File', 'Confidentials');
  END IF;
END $$;

ALTER TABLE IF EXISTS aurora.employees
  ADD COLUMN IF NOT EXISTS pay_class aurora.pay_class NOT NULL DEFAULT 'Tier 1';
