-- Migration: add the leave_records table (filed leave applications)
--
-- Distinct from leave_types, which is the *catalogue* of categories a workspace
-- recognises. A leave_record is one employee's actual application for a date
-- range, filed against a type.
--
-- WHY THIS MATTERS TO PAYROLL: a biometric attendance import sees no punch on a
-- leave day and would otherwise book it as leave-without-pay, docking pay for
-- approved time off. The import consults these records so an approved leave day
-- is marked 'on-leave' instead of 'absent', and paid leave is excluded from LWOP
-- entirely. Unpaid leave still deducts — that is the point of filing it as
-- unpaid — but it is traceable to an application rather than looking like an
-- unexplained absence.
--
-- leave_type_name / leave_type_code / pay_rule are SNAPSHOTS taken at filing
-- time, deliberately denormalised rather than joined to leave_types. A record is
-- a historical fact: re-pricing "Vacation Leave" from paid to unpaid next year
-- must not retroactively dock leave that was already taken and paid. The FK to
-- leave_types is ON DELETE SET NULL for the same reason — deleting a catalogue
-- entry must not erase the applications filed under it.
--
-- Only 'approved' records suppress a deduction. Pending and rejected
-- applications are inert by design: an employee cannot stop a deduction by
-- filing a request nobody has acted on.
--
-- Safe to re-run (guarded with IF NOT EXISTS).
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/015_leave_records.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/015_leave_records.sql

-- ---- public schema (Supabase) --------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'public') THEN
    CREATE TABLE IF NOT EXISTS public.leave_records (
      id               text        PRIMARY KEY,
      employee_id      text        NOT NULL REFERENCES public.employees(id)
                                   ON DELETE CASCADE ON UPDATE CASCADE,
      -- Denormalised for display/search so the table needs no join.
      employee_name    text        NOT NULL DEFAULT '',
      -- SET NULL, not CASCADE: deleting a leave type must not delete the
      -- applications filed under it (the snapshot columns keep them readable).
      leave_type_id    text        REFERENCES public.leave_types(id)
                                   ON DELETE SET NULL ON UPDATE CASCADE,
      leave_type_name  text        NOT NULL DEFAULT '',
      leave_type_code  text        NOT NULL DEFAULT '',
      -- Snapshotted from the type at filing time; drives the LWOP decision.
      pay_rule         text        NOT NULL DEFAULT 'paid'
                                   CHECK (pay_rule IN ('paid','unpaid')),
      start_date       date        NOT NULL,
      end_date         date        NOT NULL,
      reason           text        NOT NULL DEFAULT '',
      status           text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','approved','rejected','cancelled')),
      -- Who decided, and when. NULL while the application is pending.
      decided_by       text,
      decided_at       timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      -- A range must be well-ordered; mirrors validateLeaveRecord client-side.
      CONSTRAINT chk_leave_records_range CHECK (end_date >= start_date)
    );

    -- The attendance import walks a date range per employee, so this is the
    -- index that keeps buildLeaveIndex's source query cheap as records pile up.
    CREATE INDEX IF NOT EXISTS idx_leave_records_employee_dates
      ON public.leave_records (employee_id, start_date, end_date);
    -- Only approved records suppress a deduction, so payroll filters on status.
    CREATE INDEX IF NOT EXISTS idx_leave_records_status
      ON public.leave_records (status);

    -- RLS matches leave_types and the other shared HR tables: any signed-in
    -- user reads and writes. Approval is gated in the UI (canManageLeave); if
    -- leave approval ever needs to be a server-side security boundary, tighten
    -- the UPDATE policy to is_admin() or an HR-role check here.
    ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'leave_records'
        AND policyname = 'authenticated_all_leave_records'
    ) THEN
      CREATE POLICY authenticated_all_leave_records ON public.leave_records
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ---- aurora schema (local schema build) ----------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'aurora') THEN
    CREATE TABLE IF NOT EXISTS aurora.leave_records (
      id               text        PRIMARY KEY,
      employee_id      text        NOT NULL REFERENCES aurora.employees(id)
                                   ON DELETE CASCADE ON UPDATE CASCADE,
      employee_name    text        NOT NULL DEFAULT '',
      leave_type_id    text        REFERENCES aurora.leave_types(id)
                                   ON DELETE SET NULL ON UPDATE CASCADE,
      leave_type_name  text        NOT NULL DEFAULT '',
      leave_type_code  text        NOT NULL DEFAULT '',
      pay_rule         text        NOT NULL DEFAULT 'paid'
                                   CHECK (pay_rule IN ('paid','unpaid')),
      start_date       date        NOT NULL,
      end_date         date        NOT NULL,
      reason           text        NOT NULL DEFAULT '',
      status           text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','approved','rejected','cancelled')),
      decided_by       text,
      decided_at       timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_leave_records_range CHECK (end_date >= start_date)
    );
    CREATE INDEX IF NOT EXISTS idx_leave_records_employee_dates
      ON aurora.leave_records (employee_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_leave_records_status
      ON aurora.leave_records (status);
  END IF;
END $$;

-- ---- attendance_state: add 'on-leave' ------------------------------------
-- An approved leave day is neither 'present' nor 'absent': booking it absent is
-- what made payroll dock approved time off in the first place. Postgres cannot
-- ADD VALUE inside a transaction block on older versions, so this runs bare.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_state') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'attendance_state' AND e.enumlabel = 'on-leave'
    ) THEN
      ALTER TYPE attendance_state ADD VALUE 'on-leave';
    END IF;
  END IF;
END $$;
