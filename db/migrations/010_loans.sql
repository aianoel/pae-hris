-- Migration: add the loans table
-- The app reads/writes an employee "loans" table (see src/lib/db/api.ts,
-- src/lib/loans.ts) but earlier schema builds never created it, so Supabase
-- returns 404 for GET /rest/v1/loans. The full schema*.sql files now include it
-- for fresh installs; this provisions it on an already-provisioned database.
-- Safe to re-run (guarded with IF NOT EXISTS).
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/010_loans.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/010_loans.sql

-- ---- public schema (Supabase) --------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'employees') THEN
    CREATE TABLE IF NOT EXISTS public.loans (
      id                   text          PRIMARY KEY,
      employee_id          text          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
      employee_name        text          NOT NULL DEFAULT '',
      type                 text          NOT NULL,
      reference            text          NOT NULL DEFAULT '',
      principal            numeric(14,2) NOT NULL DEFAULT 0 CHECK (principal >= 0),
      interest_rate        numeric(6,3)  NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
      term_months          integer       NOT NULL DEFAULT 0 CHECK (term_months >= 0),
      monthly_amortization numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amortization >= 0),
      amount_paid          numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      start_date           date          NOT NULL,
      status               text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','on-hold'))
    );
    CREATE INDEX IF NOT EXISTS idx_loans_employee ON public.loans (employee_id);
    CREATE INDEX IF NOT EXISTS idx_loans_status   ON public.loans (status);

    -- RLS: any signed-in user has full CRUD (matches the other data tables).
    ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'loans' AND policyname = 'authenticated_all_loans'
    ) THEN
      CREATE POLICY authenticated_all_loans ON public.loans
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ---- aurora schema (local schema build) ----------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'aurora' AND table_name = 'employees') THEN
    CREATE TABLE IF NOT EXISTS aurora.loans (
      id                   text          PRIMARY KEY,
      employee_id          text          NOT NULL REFERENCES aurora.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
      employee_name        text          NOT NULL DEFAULT '',
      type                 text          NOT NULL,
      reference            text          NOT NULL DEFAULT '',
      principal            numeric(14,2) NOT NULL DEFAULT 0 CHECK (principal >= 0),
      interest_rate        numeric(6,3)  NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
      term_months          integer       NOT NULL DEFAULT 0 CHECK (term_months >= 0),
      monthly_amortization numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amortization >= 0),
      amount_paid          numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      start_date           date          NOT NULL,
      status               text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','on-hold'))
    );
    CREATE INDEX IF NOT EXISTS idx_loans_employee ON aurora.loans (employee_id);
    CREATE INDEX IF NOT EXISTS idx_loans_status   ON aurora.loans (status);
  END IF;
END $$;
