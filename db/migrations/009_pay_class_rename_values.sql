-- Migration: rename pay_class enum values
-- Renames the payroll rate class labels on an existing database:
--   'Tier 3'    -> 'Rank And File'
--   'Executive' -> 'Confidentials'
-- (Tier 1 / Tier 2 are unchanged.) ALTER TYPE ... RENAME VALUE renames the
-- label in place, so existing employees.pay_class rows carry over automatically.
-- The full schema*.sql files already use the new labels for fresh installs; this
-- provisions the rename on an already-provisioned database. Safe to re-run —
-- each rename is guarded on the old value still being present.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/009_pay_class_rename_values.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/009_pay_class_rename_values.sql

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'aurora'] LOOP
    IF to_regtype(sch || '.pay_class') IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'pay_class' AND n.nspname = sch AND e.enumlabel = 'Tier 3'
    ) THEN
      EXECUTE format('ALTER TYPE %I.pay_class RENAME VALUE %L TO %L', sch, 'Tier 3', 'Rank And File');
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'pay_class' AND n.nspname = sch AND e.enumlabel = 'Executive'
    ) THEN
      EXECUTE format('ALTER TYPE %I.pay_class RENAME VALUE %L TO %L', sch, 'Executive', 'Confidentials');
    END IF;
  END LOOP;
END $$;
