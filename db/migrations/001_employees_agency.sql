-- Migration: add employees.agency
-- Adds the optional manpower/staffing agency column to an already-provisioned
-- database (the full schema*.sql files already include it for fresh installs).
-- Safe to run more than once.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/001_employees_agency.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/001_employees_agency.sql

ALTER TABLE IF EXISTS public.employees  ADD COLUMN IF NOT EXISTS agency text;
ALTER TABLE IF EXISTS aurora.employees  ADD COLUMN IF NOT EXISTS agency text;
