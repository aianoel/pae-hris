-- Migration: add the employee_loan_entries table
-- Backs the per-employee, tabbed Loans ledger opened from the employee row
-- action (see src/components/employees/EmployeeLoansDialog.tsx and
-- src/lib/employeeLoans.ts). Distinct from the existing `loans` table (payroll
-- amortisations): each row here is one line within a category tab (SSS, HMO,
-- HDMF/Pag-IBIG, PECO, 2 Years, 5 Years) recording Amount / Term / Per Month /
-- Type / Date / Control / Paid. The full schema*.sql files now include it for
-- fresh installs; this provisions it on an already-provisioned database.
-- Safe to re-run (guarded with IF NOT EXISTS).
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/011_employee_loan_entries.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/011_employee_loan_entries.sql

-- ---- public schema (Supabase) --------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'employees') THEN
    CREATE TABLE IF NOT EXISTS public.employee_loan_entries (
      id           text          PRIMARY KEY,
      employee_id  text          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
      -- Which category tab this line belongs to.
      tab          text          NOT NULL CHECK (tab IN ('sss','hmo','hdmf','peco','twoYears','fiveYears')),
      amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      term         text          NOT NULL DEFAULT '',   -- free text (e.g. '24', '12 months')
      per_month    numeric(14,2) NOT NULL DEFAULT 0 CHECK (per_month >= 0),
      type         text          NOT NULL DEFAULT '',   -- Loan Type / Provider / Account / Description
      entry_date   date          NOT NULL,
      control      text          NOT NULL DEFAULT '',
      paid         numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_emp_loan_entries_employee ON public.employee_loan_entries (employee_id);
    CREATE INDEX IF NOT EXISTS idx_emp_loan_entries_tab      ON public.employee_loan_entries (tab);

    -- RLS: any signed-in user has full CRUD (matches the other data tables).
    ALTER TABLE public.employee_loan_entries ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'employee_loan_entries'
        AND policyname = 'authenticated_all_employee_loan_entries'
    ) THEN
      CREATE POLICY authenticated_all_employee_loan_entries ON public.employee_loan_entries
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
    CREATE TABLE IF NOT EXISTS aurora.employee_loan_entries (
      id           text          PRIMARY KEY,
      employee_id  text          NOT NULL REFERENCES aurora.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
      tab          text          NOT NULL CHECK (tab IN ('sss','hmo','hdmf','peco','twoYears','fiveYears')),
      amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      term         text          NOT NULL DEFAULT '',
      per_month    numeric(14,2) NOT NULL DEFAULT 0 CHECK (per_month >= 0),
      type         text          NOT NULL DEFAULT '',
      entry_date   date          NOT NULL,
      control      text          NOT NULL DEFAULT '',
      paid         numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_emp_loan_entries_employee ON aurora.employee_loan_entries (employee_id);
    CREATE INDEX IF NOT EXISTS idx_emp_loan_entries_tab      ON aurora.employee_loan_entries (tab);
  END IF;
END $$;
