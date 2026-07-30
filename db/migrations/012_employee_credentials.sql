-- Migration: add employee credential columns
-- Adds the "Credential Information" and "Other Credentials" fields surfaced on
-- the employee form's Credentials tab: the statutory PH identifiers (SSS,
-- PhilHealth, Pag-IBIG/HDMF, TIN) plus passport, driver's licence, the
-- disbursement bank account and one free-form additional ID.
--
-- All columns are nullable — every credential is optional and starts empty
-- (the UI shows an "+ Add …" prompt until a value is saved). They are stored
-- inline on employees rather than in a separate key/value table because each
-- employee has at most one of each, which keeps reads a single row fetch.
--
-- Bank account is text, not a numeric type: leading zeros are significant in
-- account numbers. The UI restricts entry to digits.
--
-- Supabase (public schema):
--   psql "$SUPABASE_DB_URL" -f db/migrations/012_employee_credentials.sql
-- Local schema build (aurora schema):
--   psql -d aurora -c "SET search_path TO aurora;" -f db/migrations/012_employee_credentials.sql

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS sss             text,
  ADD COLUMN IF NOT EXISTS philhealth      text,
  ADD COLUMN IF NOT EXISTS pagibig         text,
  ADD COLUMN IF NOT EXISTS tin             text,
  ADD COLUMN IF NOT EXISTS passport        text,
  ADD COLUMN IF NOT EXISTS licence         text,
  ADD COLUMN IF NOT EXISTS licence_expiry  date,
  ADD COLUMN IF NOT EXISTS bank_name       text,
  ADD COLUMN IF NOT EXISTS bank_account    text,
  ADD COLUMN IF NOT EXISTS other_id_name   text,
  ADD COLUMN IF NOT EXISTS other_id_number text;

ALTER TABLE IF EXISTS aurora.employees
  ADD COLUMN IF NOT EXISTS sss             text,
  ADD COLUMN IF NOT EXISTS philhealth      text,
  ADD COLUMN IF NOT EXISTS pagibig         text,
  ADD COLUMN IF NOT EXISTS tin             text,
  ADD COLUMN IF NOT EXISTS passport        text,
  ADD COLUMN IF NOT EXISTS licence         text,
  ADD COLUMN IF NOT EXISTS licence_expiry  date,
  ADD COLUMN IF NOT EXISTS bank_name       text,
  ADD COLUMN IF NOT EXISTS bank_account    text,
  ADD COLUMN IF NOT EXISTS other_id_name   text,
  ADD COLUMN IF NOT EXISTS other_id_number text;
