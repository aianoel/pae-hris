/**
 * One-off server-side seeder for the live Supabase backend.
 *
 * WHY THIS EXISTS: the app's in-browser `seedBackend()` runs on mount, before
 * any user has signed in. RLS on every table is `TO authenticated`, so the
 * publishable/anon key cannot write — app-driven seeding silently no-ops on a
 * fresh backend. This script uses the SERVICE-ROLE (secret) key, which bypasses
 * RLS, to load the same deterministic seed data the app would have pushed.
 *
 * It reuses the app's own seed modules + row mappers so the data matches the
 * schema exactly and stays in sync if the seed changes.
 *
 * Run:  npx tsx scripts/seed-supabase.ts
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (read from process.env)
 */
import { createClient } from "@supabase/supabase-js";

import {
  seedRoles,
  seedDepartments,
  seedUsers,
  seedPayrollRuns,
  seedReports,
  seedDocuments,
  seedNotifications,
  seedLogs,
  seedSettings,
  seedAttendance,
} from "../src/store/seed.ts";
import { employees as seedEmployees } from "../src/lib/data.ts";
import { seedContributionRates } from "../src/lib/contributions.ts";
import * as M from "../src/lib/db/mappers.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function up(table: string, rows: Record<string, unknown>[], onConflict?: string) {
  if (!rows.length) {
    console.log(`  ${table}: (nothing to insert)`);
    return;
  }
  const { error } = await sb
    .from(table)
    .upsert(rows, onConflict ? { onConflict } : { onConflict: "id" });
  if (error) {
    console.error(`  ${table}: FAILED — ${error.message}`);
    throw error;
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

async function main() {
  console.log("Seeding Supabase (service-role, bypasses RLS)…");
  // FK order: roles → users, departments → employees → attendance/payroll, etc.
  await up("roles", seedRoles.map(M.roleToRow));
  await up("departments", seedDepartments.map(M.departmentToRow));
  // Default agency registry (mirrors DEFAULT_AGENCIES in the store).
  await up("agencies", [{ name: "Direct Hire" }].map(M.agencyToRow), "name");
  await up("users", seedUsers.map(M.userToRow));
  await up("employees", seedEmployees.map(M.employeeToRow));
  await up("attendance_records", seedAttendance.map(M.attendanceToRow), "employee_id,date");
  await up("payroll_runs", seedPayrollRuns.map(M.payrollRunToRow));
  await up("contribution_rates", seedContributionRates.map(M.contributionToRow));
  await up("reports", seedReports.map(M.reportToRow));
  await up("documents", seedDocuments.map(M.documentToRow));
  await up("notifications", seedNotifications.map(M.notificationToRow));
  await up("log_entries", seedLogs.map(M.logToRow));
  await up("settings", [{ id: 1, ...M.settingsToRow(seedSettings) }]);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
