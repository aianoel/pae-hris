-- Migration: expose database storage size to the app (Settings → Database).
-- PostgREST/anon clients can't read pg_* size functions directly, so we wrap
-- them in a SECURITY DEFINER function and grant EXECUTE to `authenticated`.
-- It reports the total database size plus a per-table on-disk breakdown
-- (table + indexes + TOAST) for the app's own tables. Safe to re-run.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/007_db_storage_stats_rpc.sql
--   -- or paste into the Supabase SQL Editor and Run.

CREATE OR REPLACE FUNCTION public.db_storage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pin search_path so a SECURITY DEFINER function can't be hijacked.
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tables', COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'table', c.relname,
                   'totalBytes', pg_total_relation_size(c.oid),
                   'tableBytes', pg_table_size(c.oid),
                   'indexBytes', pg_indexes_size(c.oid)
                 )
                 ORDER BY pg_total_relation_size(c.oid) DESC
               )
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'  -- ordinary tables only
      ),
      '[]'::jsonb
    )
  );
$$;

-- Signed-in users may read storage stats; the anon key alone cannot.
REVOKE ALL ON FUNCTION public.db_storage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.db_storage_stats() TO authenticated;
