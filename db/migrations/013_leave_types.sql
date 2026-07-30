-- Migration: add the leave_types table
-- Backs the Leave module (src/lib/leave.ts, src/pages/LeavePage.tsx): the
-- catalogue of leave categories a workspace recognises — Vacation, Sick,
-- Maternity and so on — each scoped to the staffing agencies it applies to.
--
-- `agencies` is a text[] rather than a join table because the list is short,
-- always read whole, and never queried from the other side ("which types apply
-- to agency X" is a client-side filter over a fully-loaded catalogue). It holds
-- either the single sentinel '*' (every agency, including ones registered
-- later) or explicit agency names, where the empty string '' is the direct-hire
-- bucket — matching an employee's `agency` column, which is '' for direct
-- hires. The CHECK enforces the "never applies to nobody" invariant that
-- validateLeaveType() also enforces client-side.
--
-- Agency names are NOT foreign-keyed to public.agencies: a type may legitimately
-- reference the direct-hire bucket ('') and must survive an agency being
-- renamed or de-registered without silently losing its scope.
--
-- Safe to re-run (guarded with IF NOT EXISTS).
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/013_leave_types.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/013_leave_types.sql

-- ---- public schema (Supabase) --------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'public') THEN
    CREATE TABLE IF NOT EXISTS public.leave_types (
      id                text        PRIMARY KEY,
      name              text        NOT NULL,
      code              text        NOT NULL,
      description       text        NOT NULL DEFAULT '',
      days_per_year     integer     NOT NULL DEFAULT 0 CHECK (days_per_year BETWEEN 0 AND 365),
      pay_rule          text        NOT NULL DEFAULT 'paid' CHECK (pay_rule IN ('paid','unpaid')),
      -- '*' = all agencies; '' = direct hires; otherwise an agency name.
      agencies          text[]      NOT NULL DEFAULT ARRAY['*']::text[]
                                    CHECK (array_length(agencies, 1) >= 1),
      carry_over        boolean     NOT NULL DEFAULT false,
      requires_approval boolean     NOT NULL DEFAULT true,
      status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      created_at        timestamptz NOT NULL DEFAULT now()
    );

    -- Name and code are unique case-insensitively, mirroring validateLeaveType.
    -- Expression indexes rather than plain UNIQUE so "vacation leave" can't be
    -- added alongside "Vacation Leave" via a direct API call.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_name
      ON public.leave_types (lower(btrim(name)));
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_code
      ON public.leave_types (upper(btrim(code)));
    CREATE INDEX IF NOT EXISTS idx_leave_types_status ON public.leave_types (status);
    -- GIN over agencies: supports "types scoped to this agency" lookups if the
    -- catalogue ever outgrows a client-side filter.
    CREATE INDEX IF NOT EXISTS idx_leave_types_agencies
      ON public.leave_types USING gin (agencies);

    -- RLS: any signed-in user reads the catalogue and has full CRUD, matching
    -- the other DATA tables. Restricting writes to HR/Administrator is enforced
    -- in the UI (canManageLeave) — the DB tier here follows the existing
    -- convention that shared HR data is writable by any authenticated staff
    -- member, and only the PRIVILEGE tables (users/roles/settings) are
    -- admin-gated. Tighten this to is_admin() if leave writes ever need to be a
    -- server-side security boundary too.
    ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'leave_types'
        AND policyname = 'authenticated_all_leave_types'
    ) THEN
      CREATE POLICY authenticated_all_leave_types ON public.leave_types
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ---- aurora schema (local schema build) ----------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'aurora') THEN
    CREATE TABLE IF NOT EXISTS aurora.leave_types (
      id                text        PRIMARY KEY,
      name              text        NOT NULL,
      code              text        NOT NULL,
      description       text        NOT NULL DEFAULT '',
      days_per_year     integer     NOT NULL DEFAULT 0 CHECK (days_per_year BETWEEN 0 AND 365),
      pay_rule          text        NOT NULL DEFAULT 'paid' CHECK (pay_rule IN ('paid','unpaid')),
      agencies          text[]      NOT NULL DEFAULT ARRAY['*']::text[]
                                    CHECK (array_length(agencies, 1) >= 1),
      carry_over        boolean     NOT NULL DEFAULT false,
      requires_approval boolean     NOT NULL DEFAULT true,
      status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      created_at        timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_name
      ON aurora.leave_types (lower(btrim(name)));
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_code
      ON aurora.leave_types (upper(btrim(code)));
    CREATE INDEX IF NOT EXISTS idx_leave_types_status ON aurora.leave_types (status);
    CREATE INDEX IF NOT EXISTS idx_leave_types_agencies
      ON aurora.leave_types USING gin (agencies);
  END IF;
END $$;
