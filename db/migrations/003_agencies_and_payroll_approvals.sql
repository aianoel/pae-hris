-- Migration: add agencies + payroll_approvals tables
-- Moves two previously non-persisted stores into PostgreSQL:
--   • agencies         — was localStorage-only in the browser
--   • payroll_approvals — was in-memory-only workflow state
-- The full schema*.sql files already include both for fresh installs; this
-- migration provisions them on an existing database. Safe to run more than once.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/003_agencies_and_payroll_approvals.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/003_agencies_and_payroll_approvals.sql

BEGIN;

-- ---- public (Supabase) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agencies (
  name  text PRIMARY KEY,
  logo  text
);

DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payroll_approvals (
  id            text           PRIMARY KEY,
  period        text           NOT NULL,
  agency_label  text           NOT NULL DEFAULT '',
  agency_scope  text,
  headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0),
  net           numeric(16,2)  NOT NULL DEFAULT 0,
  status        public.approval_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_approvals_status ON public.payroll_approvals (status);

-- Enable RLS + a permissive authenticated-only policy on the new tables,
-- matching every other public table (see schema.supabase.sql).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agencies','payroll_approvals'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND policyname = 'authenticated_all_' || t
      ) THEN
        EXECUTE format($f$
          CREATE POLICY %I ON public.%I
            FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
        $f$, 'authenticated_all_' || t, t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---- aurora (local schema.sql build) --------------------------------------
DO $$ BEGIN
  IF to_regnamespace('aurora') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS aurora.agencies (
      name  text PRIMARY KEY,
      logo  text
    );

    BEGIN
      CREATE TYPE aurora.approval_status AS ENUM ('pending', 'approved');
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    CREATE TABLE IF NOT EXISTS aurora.payroll_approvals (
      id            text           PRIMARY KEY,
      period        text           NOT NULL,
      agency_label  text           NOT NULL DEFAULT '',
      agency_scope  text,
      headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
      gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0),
      net           numeric(16,2)  NOT NULL DEFAULT 0,
      status        aurora.approval_status NOT NULL DEFAULT 'pending',
      created_at    timestamptz    NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_approvals_status ON aurora.payroll_approvals (status);
  END IF;
END $$;

COMMIT;
