-- Migration: add settings.theme
-- Persists the UI colour-scheme preference in the database instead of the
-- browser's localStorage. The full schema*.sql files already include it for
-- fresh installs; this provisions it on an existing database. Safe to re-run.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/004_settings_theme.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/004_settings_theme.sql

ALTER TABLE IF EXISTS public.settings
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light';
ALTER TABLE IF EXISTS aurora.settings
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light';

-- Constrain to the two supported values (added separately so re-runs are safe).
DO $$ BEGIN
  IF to_regclass('public.settings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_theme_chk') THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_theme_chk CHECK (theme IN ('light','dark'));
  END IF;
  IF to_regclass('aurora.settings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_theme_chk_aurora') THEN
    ALTER TABLE aurora.settings
      ADD CONSTRAINT settings_theme_chk_aurora CHECK (theme IN ('light','dark'));
  END IF;
END $$;
