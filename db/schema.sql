-- =============================================================================
-- Aurora HRIS / Payroll — PostgreSQL schema
-- =============================================================================
-- A faithful relational model of the app's in-memory store (src/store/types.ts,
-- src/lib/data.ts, src/lib/contributions.ts, src/lib/payroll.ts).
--
-- Import (creates everything from scratch):
--     createdb aurora
--     psql -d aurora -f db/schema.sql
--
-- Or into an existing database / role:
--     psql "postgresql://user:pass@host:5432/aurora" -f db/schema.sql
--
-- The script is idempotent: it drops and recreates the `aurora` schema, so it
-- is safe to re-run. Money is stored in PHP. Text IDs (e.g. 'EMP-1024',
-- 'ATT-1') are preserved as primary keys so the app's data imports directly.
-- =============================================================================

BEGIN;

-- Isolate everything under a dedicated schema so import never clobbers other
-- objects in the target database. Re-running wipes and rebuilds it.
DROP SCHEMA IF EXISTS aurora CASCADE;
CREATE SCHEMA aurora;
SET search_path TO aurora;

-- Case-insensitive text for emails (safe no-op if already installed globally).
CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- Enumerated types (mirror the TS string-literal unions)
-- -----------------------------------------------------------------------------
CREATE TYPE user_status        AS ENUM ('active', 'inactive');
CREATE TYPE employee_status    AS ENUM ('active', 'on-leave', 'inactive');
CREATE TYPE attendance_state   AS ENUM ('present', 'remote', 'absent');
CREATE TYPE payroll_status     AS ENUM ('draft', 'processing', 'processed', 'paid');
CREATE TYPE employee_type      AS ENUM ('Regular', 'Probationary', 'Contractual', 'Part-time');
CREATE TYPE pay_class          AS ENUM ('Tier 1', 'Tier 2', 'Tier 3', 'Executive');
CREATE TYPE contribution_type  AS ENUM ('SSS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Custom');
CREATE TYPE rate_status        AS ENUM ('active', 'inactive');
CREATE TYPE week_start         AS ENUM ('Monday', 'Sunday');
CREATE TYPE log_type           AS ENUM (
  'auth', 'employee', 'user', 'payroll', 'attendance',
  'report', 'document', 'role', 'settings', 'system'
);
CREATE TYPE approval_status     AS ENUM ('pending', 'approved');

-- -----------------------------------------------------------------------------
-- roles  (RBAC role definitions; User.role references Role.name)
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
  id            text        PRIMARY KEY,
  name          text        NOT NULL UNIQUE,
  description   text        NOT NULL DEFAULT '',
  members       integer     NOT NULL DEFAULT 0 CHECK (members >= 0),
  -- permissions: { view, create, edit, delete } → jsonb of booleans
  permissions   jsonb       NOT NULL DEFAULT '{"view":false,"create":false,"edit":false,"delete":false}'::jsonb
);

-- -----------------------------------------------------------------------------
-- users  (platform login accounts, distinct from HR employees)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  email         citext      NOT NULL UNIQUE,
  role          text        NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
  status        user_status NOT NULL DEFAULT 'active',
  last_active   text        NOT NULL DEFAULT '',
  -- Nav `to` paths the user may open; the sentinel '*' grants full access.
  access        text[]      NOT NULL DEFAULT '{}'
  -- No password column: credentials live in Supabase Auth, never at rest here.
);

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------
CREATE TABLE departments (
  id            text        PRIMARY KEY,
  name          text        NOT NULL UNIQUE,
  lead          text        NOT NULL DEFAULT '',
  budget        numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0), -- annual, PHP
  color         text        NOT NULL DEFAULT '#6366f1'
);

-- -----------------------------------------------------------------------------
-- agencies  (registered manpower/staffing agencies; Settings → Agencies)
-- -----------------------------------------------------------------------------
-- `name` is the natural key. employees.agency references it by value (no FK, so
-- removing an agency never orphans an employee row). Logo is an inlined data URL.
CREATE TABLE agencies (
  name          text        PRIMARY KEY,
  logo          text
);

-- -----------------------------------------------------------------------------
-- employees  (HR records; source of truth for bio_id / salary)
-- -----------------------------------------------------------------------------
CREATE TABLE employees (
  id            text            PRIMARY KEY,
  name          text            NOT NULL,
  email         citext          NOT NULL UNIQUE,
  role          text            NOT NULL DEFAULT '',       -- job title
  department    text            NOT NULL REFERENCES departments(name) ON UPDATE CASCADE,
  status        employee_status NOT NULL DEFAULT 'active',
  -- Employment classification / tenure track. Tenure itself is derived from
  -- `joined` at read time, not stored.
  employment_type employee_type NOT NULL DEFAULT 'Regular',
  -- Payroll rate class / salary band (matches the payroll register payclass).
  pay_class     pay_class       NOT NULL DEFAULT 'Tier 1',
  location      text            NOT NULL DEFAULT '',
  joined        date            NOT NULL,
  salary        numeric(14,2)   NOT NULL DEFAULT 0 CHECK (salary >= 0), -- annual, PHP
  -- Manpower/staffing agency the employee is engaged through (NULL = direct).
  agency        text,
  -- Biometric / timekeeping device enrollment ID (up to 10 digits).
  bio_id        text            UNIQUE,
  avatar        text                                       -- optional data URL
);

CREATE INDEX idx_employees_department ON employees (department);
CREATE INDEX idx_employees_status     ON employees (status);

-- -----------------------------------------------------------------------------
-- attendance_records  (one row per employee per calendar day)
-- -----------------------------------------------------------------------------
-- `bio_id` is denormalised onto the row as an import snapshot, but the app
-- resolves the display Bio ID from employees.bio_id at read time.
CREATE TABLE attendance_records (
  id            text             PRIMARY KEY,
  employee_id   text             NOT NULL REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  date          date             NOT NULL,
  -- Short weekday (Mon..Sun) derived from `date`; kept for display parity.
  day           text             NOT NULL,
  state         attendance_state NOT NULL,
  -- First / last biometric punch of the day (24h). NULL when absent.
  time_in       time,
  time_out      time,
  bio_id        text,
  -- One record per employee per day (matches the store's upsert key).
  CONSTRAINT uq_attendance_emp_date UNIQUE (employee_id, date),
  CONSTRAINT chk_attendance_times CHECK (time_out IS NULL OR time_in IS NULL OR time_out >= time_in)
);

CREATE INDEX idx_attendance_date        ON attendance_records (date);
CREATE INDEX idx_attendance_employee    ON attendance_records (employee_id);
-- Month lookups use a half-open range on `date`, which the index above serves:
--   WHERE date >= '2026-07-01' AND date < '2026-08-01'

-- -----------------------------------------------------------------------------
-- payroll_runs
-- -----------------------------------------------------------------------------
CREATE TABLE payroll_runs (
  id            text           PRIMARY KEY,
  period        text           NOT NULL,                   -- e.g. 'December 2026'
  headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0), -- PHP
  status        payroll_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_runs_status ON payroll_runs (status);

-- -----------------------------------------------------------------------------
-- payroll_approvals  (batches awaiting approval on the Data-Entry screen)
-- -----------------------------------------------------------------------------
-- agency_scope: NULL = all agencies; '' = direct hires; else the agency name.
CREATE TABLE payroll_approvals (
  id            text           PRIMARY KEY,
  period        text           NOT NULL,
  agency_label  text           NOT NULL DEFAULT '',
  agency_scope  text,
  headcount     integer        NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  gross         numeric(16,2)  NOT NULL DEFAULT 0 CHECK (gross >= 0), -- PHP
  net           numeric(16,2)  NOT NULL DEFAULT 0,                    -- PHP
  status        approval_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_approvals_status ON payroll_approvals (status);

-- -----------------------------------------------------------------------------
-- payroll_entries  (per-employee line within a run; mirrors PayrollComponents)
-- -----------------------------------------------------------------------------
-- Optional detail table. The app currently derives these deterministically, but
-- the schema persists them so entries can be edited and stored per run.
CREATE TABLE payroll_entries (
  id              text          PRIMARY KEY,
  run_id          text          NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_id     text          NOT NULL REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_type   employee_type NOT NULL DEFAULT 'Regular',
  -- Earnings (monthly PHP)
  basic           numeric(14,2) NOT NULL DEFAULT 0,
  allowances      numeric(14,2) NOT NULL DEFAULT 0,
  overtime        numeric(14,2) NOT NULL DEFAULT 0,  -- derived from overtime_hours
  night_diff      numeric(14,2) NOT NULL DEFAULT 0,  -- derived from night_diff_hours
  holiday_pay     numeric(14,2) NOT NULL DEFAULT 0,
  adjustments     numeric(14,2) NOT NULL DEFAULT 0,
  bonuses         numeric(14,2) NOT NULL DEFAULT 0,
  commissions     numeric(14,2) NOT NULL DEFAULT 0,
  other_earnings  numeric(14,2) NOT NULL DEFAULT 0,
  -- Deductions (monthly PHP)
  gov_deductions  numeric(14,2) NOT NULL DEFAULT 0,  -- derived from basic
  loans           numeric(14,2) NOT NULL DEFAULT 0,
  cash_advance    numeric(14,2) NOT NULL DEFAULT 0,
  late            numeric(14,2) NOT NULL DEFAULT 0,
  undertime       numeric(14,2) NOT NULL DEFAULT 0,
  absences        numeric(14,2) NOT NULL DEFAULT 0,
  lwop            numeric(14,2) NOT NULL DEFAULT 0,  -- derived: daily rate × lwop_days
  other_deductions numeric(14,2) NOT NULL DEFAULT 0,
  -- Timekeeping drivers (counts, not money)
  overtime_hours  numeric(8,2)  NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  night_diff_hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (night_diff_hours >= 0),
  lwop_days       integer       NOT NULL DEFAULT 0 CHECK (lwop_days >= 0),
  CONSTRAINT uq_payroll_entry UNIQUE (run_id, employee_id)
);

CREATE INDEX idx_payroll_entries_employee ON payroll_entries (employee_id);

-- -----------------------------------------------------------------------------
-- contribution_rates  (salary-band → MSC + ER/EE share per statutory type)
-- -----------------------------------------------------------------------------
CREATE TABLE contribution_rates (
  id              text              PRIMARY KEY,
  type            contribution_type NOT NULL,
  salary_from     numeric(14,2)     NOT NULL CHECK (salary_from >= 0),
  salary_to       numeric(14,2)     NOT NULL CHECK (salary_to >= salary_from),
  msc             numeric(14,2)     NOT NULL DEFAULT 0,  -- Monthly Salary Credit
  employer_share  numeric(14,2)     NOT NULL DEFAULT 0,  -- ER
  employee_share  numeric(14,2)     NOT NULL DEFAULT 0,  -- EE
  total           numeric(14,2)     NOT NULL DEFAULT 0,  -- ER + EE
  effective_month integer           NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  effective_year  integer           NOT NULL CHECK (effective_year BETWEEN 1900 AND 3000),
  status          rate_status       NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_contrib_type_effective ON contribution_rates (type, effective_year, effective_month);
CREATE INDEX idx_contrib_salary_band    ON contribution_rates (salary_from, salary_to);

-- -----------------------------------------------------------------------------
-- reports  (saved report metadata)
-- -----------------------------------------------------------------------------
CREATE TABLE reports (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  type          text        NOT NULL,
  range         text        NOT NULL DEFAULT '',
  rows          integer     NOT NULL DEFAULT 0 CHECK (rows >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
CREATE TABLE documents (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  type          text        NOT NULL DEFAULT '',           -- PDF, DOCX, XLSX…
  size          text        NOT NULL DEFAULT '',           -- human string, e.g. '2.4 MB'
  owner         text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id            text        PRIMARY KEY,
  icon          text        NOT NULL DEFAULT '',           -- lucide icon key
  title         text        NOT NULL,
  descr         text        NOT NULL DEFAULT '',           -- 'desc' is not reserved but renamed for clarity
  time          text        NOT NULL DEFAULT '',
  unread        boolean     NOT NULL DEFAULT true,
  tint          text        NOT NULL DEFAULT ''
);

-- -----------------------------------------------------------------------------
-- log_entries  (audit / activity log)
-- -----------------------------------------------------------------------------
CREATE TABLE log_entries (
  id            text        PRIMARY KEY,
  type          log_type    NOT NULL,
  actor         text        NOT NULL DEFAULT '',
  action        text        NOT NULL,
  target        text        NOT NULL DEFAULT '—',
  time          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_entries_time ON log_entries (time DESC);
CREATE INDEX idx_log_entries_type ON log_entries (type);

-- -----------------------------------------------------------------------------
-- settings  (single-row workspace settings; id fixed to 1)
-- -----------------------------------------------------------------------------
CREATE TABLE settings (
  id                  integer    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  workspace_name      text       NOT NULL DEFAULT 'Aurora',
  timezone            text       NOT NULL DEFAULT 'Asia/Manila',
  week_start          week_start NOT NULL DEFAULT 'Monday',
  email_notifications boolean    NOT NULL DEFAULT true,
  product_updates     boolean    NOT NULL DEFAULT true,
  weekly_digest       boolean    NOT NULL DEFAULT false,
  theme               text       NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark'))
);

-- =============================================================================
-- Convenience view: the Telecom Report base — daily duty with a live Bio ID.
-- TOTAL OF DUTY = (time_out − time_in) − 1h lunch, in decimal hours.
-- =============================================================================
CREATE VIEW telecom_daily AS
SELECT
  a.employee_id,
  e.name                                   AS employee_name,
  COALESCE(e.bio_id, a.bio_id)             AS bio_id,   -- live employee Bio ID first
  a.date,
  a.day,
  a.state,
  a.time_in,
  a.time_out,
  CASE
    WHEN a.time_in IS NOT NULL AND a.time_out IS NOT NULL AND a.time_out > a.time_in
    THEN round(
      GREATEST(0, EXTRACT(EPOCH FROM (a.time_out - a.time_in)) / 3600.0 - 1)::numeric,
      2
    )
    ELSE 0
  END                                      AS total_of_duty
FROM attendance_records a
JOIN employees e ON e.id = a.employee_id;

COMMIT;

-- =============================================================================
-- Notes
-- -----------------------------------------------------------------------------
-- • All tables live under the `aurora` schema. Query with the schema-qualified
--   name (aurora.employees) or `SET search_path TO aurora;` first.
-- • Bio ID matching: attendance_records.bio_id is an import snapshot; join to
--   employees on employee_id and read employees.bio_id for the current value
--   (see the telecom_daily view).
-- • Seed data is intentionally NOT included — this file is schema-only so you
--   can import your own rows. See db/seed.sql (optional) for demo data.
-- =============================================================================
