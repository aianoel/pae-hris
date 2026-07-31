-- =============================================================================
-- Aurora HRIS / Payroll — Supabase schema
-- =============================================================================
-- Same relational model as db/schema.sql, adapted for Supabase:
--   • Objects live in the `public` schema (PostgREST exposes `public` by
--     default, so the supabase-js client can read/write them out of the box).
--   • Row Level Security is ENABLED on every table with policies that allow the
--     `authenticated` role full access (i.e. any signed-in user). Tighten later
--     if you need per-row ownership.
--   • `citext` is used for emails (available on Supabase).
--
-- HOW TO IMPORT
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this whole file and Run. (Safe to re-run — it drops the tables
--      first.) This is DESTRUCTIVE to these specific tables only.
--   3. Settings → API → confirm `public` is in "Exposed schemas" (default).
--
-- After importing, seed data via the app (it seeds empty tables on first run)
-- or with db/seed.sql if you generate one.
-- =============================================================================

BEGIN;

-- On Supabase, extensions live in the `extensions` schema (which is on the
-- default search_path). Installing citext there keeps `citext` resolvable
-- from `public` without schema-qualifying every column.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- Drop in dependency order so re-running is clean.
DROP VIEW  IF EXISTS public.telecom_daily CASCADE;
DROP TABLE IF EXISTS public.leave_records       CASCADE;
DROP TABLE IF EXISTS public.leave_types         CASCADE;
DROP TABLE IF EXISTS public.employee_loan_entries CASCADE;
DROP TABLE IF EXISTS public.loans              CASCADE;
DROP TABLE IF EXISTS public.payroll_entries    CASCADE;
DROP TABLE IF EXISTS public.payroll_approvals  CASCADE;
DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.contribution_rates CASCADE;
DROP TABLE IF EXISTS public.payroll_runs       CASCADE;
DROP TABLE IF EXISTS public.agencies           CASCADE;
DROP TABLE IF EXISTS public.log_entries        CASCADE;
DROP TABLE IF EXISTS public.notifications      CASCADE;
DROP TABLE IF EXISTS public.documents          CASCADE;
DROP TABLE IF EXISTS public.reports            CASCADE;
DROP TABLE IF EXISTS public.settings           CASCADE;
DROP TABLE IF EXISTS public.employees          CASCADE;
DROP TABLE IF EXISTS public.users              CASCADE;
DROP TABLE IF EXISTS public.departments        CASCADE;
DROP TABLE IF EXISTS public.roles              CASCADE;

DROP TYPE IF EXISTS public.user_status       CASCADE;
DROP TYPE IF EXISTS public.employee_status   CASCADE;
DROP TYPE IF EXISTS public.attendance_state  CASCADE;
DROP TYPE IF EXISTS public.payroll_status    CASCADE;
DROP TYPE IF EXISTS public.employee_type     CASCADE;
DROP TYPE IF EXISTS public.pay_class          CASCADE;
DROP TYPE IF EXISTS public.contribution_type CASCADE;
DROP TYPE IF EXISTS public.rate_status       CASCADE;
DROP TYPE IF EXISTS public.week_start        CASCADE;
DROP TYPE IF EXISTS public.log_type          CASCADE;
DROP TYPE IF EXISTS public.approval_status   CASCADE;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_status        AS ENUM ('active', 'inactive');
CREATE TYPE public.employee_status    AS ENUM ('active', 'on-leave', 'inactive');
-- 'on-leave' is distinct from 'absent': an approved leave day is accounted for,
-- so payroll must not book it as LWOP (see db/migrations/015_leave_records.sql).
CREATE TYPE public.attendance_state   AS ENUM ('present', 'remote', 'absent', 'on-leave');
CREATE TYPE public.payroll_status     AS ENUM ('draft', 'processing', 'processed', 'paid');
CREATE TYPE public.employee_type      AS ENUM ('Regular', 'Probationary', 'Contractual', 'Part-time');
CREATE TYPE public.pay_class           AS ENUM ('Tier 1', 'Tier 2', 'Rank And File', 'Confidentials');
CREATE TYPE public.contribution_type  AS ENUM ('SSS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Custom');
CREATE TYPE public.rate_status        AS ENUM ('active', 'inactive');
CREATE TYPE public.week_start         AS ENUM ('Monday', 'Sunday');
CREATE TYPE public.log_type           AS ENUM (
  'auth', 'employee', 'user', 'payroll', 'attendance',
  'report', 'document', 'role', 'settings', 'system'
);
CREATE TYPE public.approval_status     AS ENUM ('pending', 'approved');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE public.roles (
  id            text        PRIMARY KEY,
  name          text        NOT NULL UNIQUE,
  description   text        NOT NULL DEFAULT '',
  members       integer     NOT NULL DEFAULT 0 CHECK (members >= 0),
  permissions   jsonb       NOT NULL DEFAULT '{"view":false,"create":false,"edit":false,"delete":false}'::jsonb
);

-- NOTE: no `password` column — credentials live in Supabase Auth, never at rest
-- here. `access` is the per-module authorization list ('*' = admin); it is the
-- security boundary and is write-protected by RLS (only admins may change it).
CREATE TABLE public.users (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  email         citext      NOT NULL UNIQUE,
  role          text        NOT NULL REFERENCES public.roles(name) ON UPDATE CASCADE,
  status        public.user_status NOT NULL DEFAULT 'active',
  last_active   text        NOT NULL DEFAULT '',
  access        text[]      NOT NULL DEFAULT '{}'
);

CREATE TABLE public.departments (
  id            text        PRIMARY KEY,
  name          text        NOT NULL UNIQUE,
  lead          text        NOT NULL DEFAULT '',
  budget        numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  color         text        NOT NULL DEFAULT '#6366f1'
);

-- Registered manpower/staffing agencies (managed under Settings → Agencies).
-- `name` is the natural key; employees.agency references it by value (no FK so a
-- since-removed agency doesn't break existing employee rows). Logo is an inlined
-- data URL (no object storage).
CREATE TABLE public.agencies (
  name          text        PRIMARY KEY,
  logo          text
);

CREATE TABLE public.employees (
  id            text            PRIMARY KEY,
  name          text            NOT NULL,
  email         citext          NOT NULL UNIQUE,
  role          text            NOT NULL DEFAULT '',
  department    text            NOT NULL REFERENCES public.departments(name) ON UPDATE CASCADE,
  status        public.employee_status NOT NULL DEFAULT 'active',
  employment_type public.employee_type NOT NULL DEFAULT 'Regular',
  pay_class     public.pay_class NOT NULL DEFAULT 'Tier 1',
  location      text            NOT NULL DEFAULT '',
  joined        date            NOT NULL,
  salary        numeric(14,2)   NOT NULL DEFAULT 0 CHECK (salary >= 0),
  agency        text,
  bio_id        text            UNIQUE,
  avatar        text,
  -- Credential information (statutory PH identifiers) — all optional.
  sss             text,
  philhealth      text,
  pagibig         text,
  tin             text,
  -- Other credentials. bank_account is text: leading zeros are significant.
  passport        text,
  licence         text,
  licence_expiry  date,
  bank_name       text,
  bank_account    text,
  other_id_name   text,
  other_id_number text
);
CREATE INDEX idx_employees_department ON public.employees (department);
CREATE INDEX idx_employees_status     ON public.employees (status);

CREATE TABLE public.attendance_records (
  id            text             PRIMARY KEY,
  employee_id   text             NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  date          date             NOT NULL,
  day           text             NOT NULL,
  state         public.attendance_state NOT NULL,
  time_in       time,
  time_out      time,
  bio_id        text,
  CONSTRAINT uq_attendance_emp_date UNIQUE (employee_id, date),
  CONSTRAINT chk_attendance_times CHECK (time_out IS NULL OR time_in IS NULL OR time_out >= time_in)
);
CREATE INDEX idx_attendance_date     ON public.attendance_records (date);
CREATE INDEX idx_attendance_employee ON public.attendance_records (employee_id);

-- agency_scope: null = whole-company run; '' = direct hires; else agency name.
-- Recorded so the Payroll Report can tell a processed agency from an
-- unprocessed one instead of unlocking the whole period.
CREATE TABLE public.payroll_runs (
  id            text           PRIMARY KEY,
  period        text           NOT NULL,
  agency_scope  text,          -- null = all agencies; '' = direct hires; else agency name
  headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0),
  status        public.payroll_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_runs_status ON public.payroll_runs (status);
CREATE INDEX idx_payroll_runs_period_scope ON public.payroll_runs (period, agency_scope);

-- Payroll batches submitted from the Run-payroll review, awaiting approval on
-- the Data-Entry screen. agency_scope: null = all, '' = direct hires, else name.
CREATE TABLE public.payroll_approvals (
  id            text           PRIMARY KEY,
  period        text           NOT NULL,
  agency_label  text           NOT NULL DEFAULT '',
  agency_scope  text,          -- null = all agencies; '' = direct hires; else agency name
  headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0),
  net           numeric(16,2)  NOT NULL DEFAULT 0,
  status        public.approval_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_approvals_status ON public.payroll_approvals (status);

CREATE TABLE public.payroll_entries (
  id              text          PRIMARY KEY,
  run_id          text          NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_id     text          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_type   public.employee_type NOT NULL DEFAULT 'Regular',
  basic           numeric(14,2) NOT NULL DEFAULT 0,
  allowances      numeric(14,2) NOT NULL DEFAULT 0,
  overtime        numeric(14,2) NOT NULL DEFAULT 0,
  night_diff      numeric(14,2) NOT NULL DEFAULT 0,
  holiday_pay     numeric(14,2) NOT NULL DEFAULT 0,
  adjustments     numeric(14,2) NOT NULL DEFAULT 0,
  bonuses         numeric(14,2) NOT NULL DEFAULT 0,
  commissions     numeric(14,2) NOT NULL DEFAULT 0,
  other_earnings  numeric(14,2) NOT NULL DEFAULT 0,
  gov_deductions  numeric(14,2) NOT NULL DEFAULT 0,
  loans           numeric(14,2) NOT NULL DEFAULT 0,
  cash_advance    numeric(14,2) NOT NULL DEFAULT 0,
  late            numeric(14,2) NOT NULL DEFAULT 0,
  undertime       numeric(14,2) NOT NULL DEFAULT 0,
  absences        numeric(14,2) NOT NULL DEFAULT 0,
  lwop            numeric(14,2) NOT NULL DEFAULT 0,
  other_deductions numeric(14,2) NOT NULL DEFAULT 0,
  -- One driver per kind of unpaid time, so a day is never charged twice:
  -- lwop_days = approved-but-unpaid leave, absent_days = missed without filing,
  -- tardy_days = fractions of a day lost to late arrivals (0.0625 = 30 min).
  overtime_hours  numeric(8,2)  NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  night_diff_hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (night_diff_hours >= 0),
  lwop_days       numeric(8,4)  NOT NULL DEFAULT 0 CHECK (lwop_days >= 0),
  absent_days     numeric(8,4)  NOT NULL DEFAULT 0 CHECK (absent_days >= 0),
  tardy_days      numeric(8,4)  NOT NULL DEFAULT 0 CHECK (tardy_days >= 0),
  undertime_minutes numeric(8,2) NOT NULL DEFAULT 0 CHECK (undertime_minutes >= 0),
  CONSTRAINT uq_payroll_entry UNIQUE (run_id, employee_id)
);
CREATE INDEX idx_payroll_entries_employee ON public.payroll_entries (employee_id);

CREATE TABLE public.contribution_rates (
  id              text              PRIMARY KEY,
  type            public.contribution_type NOT NULL,
  salary_from     numeric(14,2)     NOT NULL CHECK (salary_from >= 0),
  salary_to       numeric(14,2)     NOT NULL CHECK (salary_to >= salary_from),
  msc             numeric(14,2)     NOT NULL DEFAULT 0,
  employer_share  numeric(14,2)     NOT NULL DEFAULT 0,
  employee_share  numeric(14,2)     NOT NULL DEFAULT 0,
  total           numeric(14,2)     NOT NULL DEFAULT 0,
  effective_month integer           NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  effective_year  integer           NOT NULL CHECK (effective_year BETWEEN 1900 AND 3000),
  status          public.rate_status NOT NULL DEFAULT 'active'
);
CREATE INDEX idx_contrib_type_effective ON public.contribution_rates (type, effective_year, effective_month);
CREATE INDEX idx_contrib_salary_band    ON public.contribution_rates (salary_from, salary_to);

CREATE TABLE public.loans (
  id                  text        PRIMARY KEY,
  employee_id         text        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_name       text        NOT NULL DEFAULT '',  -- denormalised for display/search
  type                text        NOT NULL,
  reference           text        NOT NULL DEFAULT '',
  principal           numeric(14,2) NOT NULL DEFAULT 0 CHECK (principal >= 0),
  interest_rate       numeric(6,3)  NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),  -- annual %
  term_months         integer       NOT NULL DEFAULT 0 CHECK (term_months >= 0),
  monthly_amortization numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amortization >= 0),
  amount_paid         numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  start_date          date        NOT NULL,
  status              text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','on-hold'))
);
CREATE INDEX idx_loans_employee ON public.loans (employee_id);
CREATE INDEX idx_loans_status   ON public.loans (status);

-- Per-employee, tabbed Loans ledger (distinct from `loans` above): each row is
-- one line within a category tab, opened from the employee row action.
CREATE TABLE public.employee_loan_entries (
  id           text          PRIMARY KEY,
  employee_id  text          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tab          text          NOT NULL CHECK (tab IN ('sss','hmo','hdmf','peco','twoYears','fiveYears')),
  amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  term         text          NOT NULL DEFAULT '',
  per_month    numeric(14,2) NOT NULL DEFAULT 0 CHECK (per_month >= 0),
  type         text          NOT NULL DEFAULT '',
  entry_date   date          NOT NULL,
  control      text          NOT NULL DEFAULT '',
  paid         numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid >= 0)
);
CREATE INDEX idx_emp_loan_entries_employee ON public.employee_loan_entries (employee_id);
CREATE INDEX idx_emp_loan_entries_tab      ON public.employee_loan_entries (tab);

-- Catalogue of leave categories, each scoped to the agencies it applies to
-- (see src/lib/leave.ts). '*' in agencies = all agencies; '' = direct hires.
CREATE TABLE public.leave_types (
  id                text        PRIMARY KEY,
  name              text        NOT NULL,
  code              text        NOT NULL,             -- short code on payslips, e.g. 'VL'
  description       text        NOT NULL DEFAULT '',
  days_per_year     integer     NOT NULL DEFAULT 0 CHECK (days_per_year BETWEEN 0 AND 365),
  pay_rule          text        NOT NULL DEFAULT 'paid' CHECK (pay_rule IN ('paid','unpaid')),
  -- Not foreign-keyed to agencies: the direct-hire bucket isn't an agency row,
  -- and a scope must survive an agency being renamed or de-registered.
  agencies          text[]      NOT NULL DEFAULT ARRAY['*']::text[]
                                CHECK (array_length(agencies, 1) >= 1),
  carry_over        boolean     NOT NULL DEFAULT false,
  requires_approval boolean     NOT NULL DEFAULT true,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- Name/code uniqueness is case-insensitive, mirroring validateLeaveType().
CREATE UNIQUE INDEX uq_leave_types_name ON public.leave_types (lower(btrim(name)));
CREATE UNIQUE INDEX uq_leave_types_code ON public.leave_types (upper(btrim(code)));
CREATE INDEX idx_leave_types_status   ON public.leave_types (status);
CREATE INDEX idx_leave_types_agencies ON public.leave_types USING gin (agencies);

-- Filed leave applications (see src/lib/leaveRecords.ts). A biometric import
-- sees no punch on a leave day and would otherwise book it as LWOP, docking pay
-- for approved time off; it consults these records so an approved day is
-- 'on-leave' rather than 'absent'. Only 'approved' suppresses a deduction.
CREATE TABLE public.leave_records (
  id               text        PRIMARY KEY,
  employee_id      text        NOT NULL REFERENCES public.employees(id)
                               ON DELETE CASCADE ON UPDATE CASCADE,
  employee_name    text        NOT NULL DEFAULT '',   -- denormalised for display
  -- SET NULL, not CASCADE: deleting a leave type must not delete the
  -- applications filed under it (the snapshot columns keep them readable).
  leave_type_id    text        REFERENCES public.leave_types(id)
                               ON DELETE SET NULL ON UPDATE CASCADE,
  -- Snapshots taken at filing time: a record is a historical fact, so
  -- re-pricing a type must not re-price leave already taken.
  leave_type_name  text        NOT NULL DEFAULT '',
  leave_type_code  text        NOT NULL DEFAULT '',
  pay_rule         text        NOT NULL DEFAULT 'paid' CHECK (pay_rule IN ('paid','unpaid')),
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  reason           text        NOT NULL DEFAULT '',
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by       text,                              -- NULL while pending
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_leave_records_range CHECK (end_date >= start_date)
);
-- The attendance import walks a date range per employee; this serves that scan.
CREATE INDEX idx_leave_records_employee_dates
  ON public.leave_records (employee_id, start_date, end_date);
CREATE INDEX idx_leave_records_status ON public.leave_records (status);

CREATE TABLE public.reports (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  type          text        NOT NULL,
  range         text        NOT NULL DEFAULT '',
  rows          integer     NOT NULL DEFAULT 0 CHECK (rows >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  type          text        NOT NULL DEFAULT '',
  size          text        NOT NULL DEFAULT '',
  owner         text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id            text        PRIMARY KEY,
  icon          text        NOT NULL DEFAULT '',
  title         text        NOT NULL,
  descr         text        NOT NULL DEFAULT '',
  time          text        NOT NULL DEFAULT '',
  unread        boolean     NOT NULL DEFAULT true,
  tint          text        NOT NULL DEFAULT ''
);

CREATE TABLE public.log_entries (
  id            text        PRIMARY KEY,
  type          public.log_type NOT NULL,
  actor         text        NOT NULL DEFAULT '',
  action        text        NOT NULL,
  target        text        NOT NULL DEFAULT '—',
  time          timestamptz NOT NULL DEFAULT now(),
  actor_email   text,        -- actor's email/identity when signed in (security audit)
  ip            text,        -- client public IP at event time (security audit)
  device        text         -- browser · OS descriptor from the User-Agent
);
CREATE INDEX idx_log_entries_time ON public.log_entries (time DESC);
CREATE INDEX idx_log_entries_type ON public.log_entries (type);

CREATE TABLE public.settings (
  id                  integer    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  workspace_name      text       NOT NULL DEFAULT 'Aurora',
  timezone            text       NOT NULL DEFAULT 'Asia/Manila',
  week_start          public.week_start NOT NULL DEFAULT 'Monday',
  email_notifications boolean    NOT NULL DEFAULT true,
  product_updates     boolean    NOT NULL DEFAULT true,
  weekly_digest       boolean    NOT NULL DEFAULT false,
  theme               text       NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark'))
);

-- -----------------------------------------------------------------------------
-- Telecom Report base view (duty = (out−in)/3600 − 1h lunch; live Bio ID)
-- -----------------------------------------------------------------------------
CREATE VIEW public.telecom_daily AS
SELECT
  a.employee_id,
  e.name                                   AS employee_name,
  COALESCE(e.bio_id, a.bio_id)             AS bio_id,
  a.date,
  a.day,
  a.state,
  a.time_in,
  a.time_out,
  CASE
    WHEN a.time_in IS NOT NULL AND a.time_out IS NOT NULL AND a.time_out > a.time_in
    THEN round((EXTRACT(EPOCH FROM (a.time_out - a.time_in)) / 3600.0 - 1)::numeric, 2)
    ELSE 0
  END                                      AS total_of_duty
FROM public.attendance_records a
JOIN public.employees e ON e.id = a.employee_id;

-- =============================================================================
-- Row Level Security.
-- The anon key alone (no login) cannot read/write anything; a Supabase Auth
-- session is required. Two tiers:
--   • DATA tables — any signed-in staff member has full CRUD (shared HR data).
--   • PRIVILEGE tables (users/roles/settings) — the security boundary, so writes
--     are admin-only and users can only read their own account. This is what
--     stops a signed-in non-admin from self-granting access via the API. See
--     the is_admin()/auth_email() helpers and db/migrations/008_*.sql.
-- =============================================================================

-- Data tables: authenticated full CRUD (privilege tables handled separately).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments','agencies','employees','attendance_records',
    'payroll_runs','payroll_approvals','payroll_entries','contribution_rates',
    'loans','employee_loan_entries','leave_types','leave_records',
    'reports','documents','notifications','log_entries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- One permissive policy covering SELECT/INSERT/UPDATE/DELETE for signed-in users.
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    $f$, 'authenticated_all_' || t, t);
  END LOOP;
END $$;

-- Authorization helpers (SECURITY DEFINER so they read users under the policy
-- that would otherwise recurse; search_path pinned so they can't be hijacked).
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email = public.auth_email() AND '*' = ANY (u.access)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()   TO authenticated;

-- users: read own row (admins read all); only admins may insert/update/delete.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin() OR email = public.auth_email());
CREATE POLICY users_admin_insert ON public.users
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY users_admin_update ON public.users
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY users_admin_delete ON public.users
  FOR DELETE TO authenticated USING (public.is_admin());

-- roles: everyone signed-in reads; only admins write.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_select_authenticated ON public.roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_admin_write ON public.roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- settings: everyone signed-in reads; only admins write.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_select_authenticated ON public.settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_write ON public.settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =============================================================================
-- Storage stats RPC — lets the app (Settings → Database) read on-disk size.
-- PostgREST clients can't call pg_* size functions directly, so wrap them in a
-- SECURITY DEFINER function and grant EXECUTE to signed-in users only.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.db_storage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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
          AND c.relkind = 'r'
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.db_storage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.db_storage_stats() TO authenticated;

COMMIT;

-- =============================================================================
-- Notes
-- • DATA tables grant every signed-in user full CRUD (shared HR data model).
-- • PRIVILEGE tables (users/roles/settings) are admin-gated for writes and
--   self-scoped for reads on users — so the client-side access list can't be
--   bypassed from the API. Admin = a users row whose access[] contains '*'.
-- • The `anon` role (no session) has NO access — the app must sign in first.
-- • Credentials are NOT stored here — Supabase Auth owns them (no password col).
-- • To let the app auto-seed, it detects empty tables on first load and inserts
--   the demo rows (see src/store/index.tsx).
-- =============================================================================
