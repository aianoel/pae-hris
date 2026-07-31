-- Migration: itemise unpaid time on payroll_entries
--
-- Payroll charges three distinct kinds of unpaid time, and each now has its own
-- driver column so a payslip can explain the deduction rather than assert it:
--
--   lwop_days          — approved but UNPAID leave (the employee filed, and the
--                        leave type is unpaid). Already present.
--   absent_days        — whole days missed with NO approved leave covering them.
--                        This is the "absent and did not apply for leave" charge.
--   tardy_days         — working days lost to arriving after the shift start,
--                        as a FRACTION of a day (0.0625 = half an hour late),
--                        pro-rated against the 8-hour day. See lib/tardiness.ts.
--   undertime_minutes  — minutes lost to leaving early.
--
-- WHY SPLIT THEM: the app previously folded all three into lwop_days while the
-- payroll engine ALSO charged a separately-derived `late` and `absences`, so an
-- imported day could be deducted twice. Keeping one driver per deduction line
-- makes the double-charge structurally impossible.
--
-- lwop_days is also widened from integer to numeric here. It used to absorb the
-- fractional tardiness figure, which silently truncated toward an integer on
-- write; tardiness now has its own numeric column, but the wider type is kept so
-- half-day leave can be recorded without another migration.
--
-- Safe to re-run (guarded with IF NOT EXISTS).
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/016_payroll_entries_unpaid_time.sql
-- Local schema build (aurora schema):
--   psql -d aurora -f db/migrations/016_payroll_entries_unpaid_time.sql

DO $$
DECLARE
  target_schema text;
BEGIN
  FOREACH target_schema IN ARRAY ARRAY['public', 'aurora'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = target_schema AND table_name = 'payroll_entries'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.payroll_entries
           ADD COLUMN IF NOT EXISTS absent_days       numeric(8,4) NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS tardy_days        numeric(8,4) NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS undertime_minutes numeric(8,2) NOT NULL DEFAULT 0',
        target_schema);

      -- Widen lwop_days so fractional (half-day) leave is representable. The
      -- integer CHECK is dropped first: re-adding it against the new type keeps
      -- the >= 0 guarantee without pinning the column back to whole days.
      EXECUTE format(
        'ALTER TABLE %I.payroll_entries
           ALTER COLUMN lwop_days TYPE numeric(8,4) USING lwop_days::numeric',
        target_schema);

      -- Non-negative guards, matching the existing overtime_hours style. Added
      -- separately so re-running the migration doesn't error on a duplicate.
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_payroll_entries_unpaid_time'
          AND connamespace = target_schema::regnamespace
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I.payroll_entries
             ADD CONSTRAINT chk_payroll_entries_unpaid_time
             CHECK (absent_days >= 0 AND tardy_days >= 0 AND undertime_minutes >= 0)',
          target_schema);
      END IF;
    END IF;
  END LOOP;
END $$;
