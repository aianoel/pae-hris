import * as React from "react";

import { useToast } from "@/components/ui/toast";
import { employees as seedEmployees } from "@/lib/data";
import {
  seedContributionRates,
  computeTotal,
  defaultEarningsMatrix,
  toggleEarning,
  type ContributionRate,
  type EarningsMatrix,
} from "@/lib/contributions";
import {
  seedLoans,
  computeAmortization,
  applyPayment,
  type Loan,
} from "@/lib/loans";
import {
  groupByTab,
  controlFromId,
  computePerMonth,
  type LoanEntry,
} from "@/lib/employeeLoans";
import { normalizeCode, normalizeAgencies, type LeaveType } from "@/lib/leave";
import type { LeaveRecord } from "@/lib/leaveRecords";
import type {
  Employee,
  User,
  Department,
  Agency,
  AttendanceRecord,
  PayrollRun,
  PayrollApproval,
  Report,
  Document,
  Role,
  Settings,
  Notification,
  LogEntry,
} from "./types";
import {
  seedUsers,
  seedDepartments,
  seedAttendance,
  seedPayrollRuns,
  seedReports,
  seedDocuments,
  seedRoles,
  seedSettings,
  seedNotifications,
  seedLogs,
} from "./seed";
import { db } from "@/lib/db/api";
import { loadAll } from "@/lib/db/api";
import { StoreContext, type StoreValue } from "./store-context";
// Re-export the value type only (types are erased, so this doesn't reintroduce
// the mixed-export HMR problem). Consumers import the `useStore` hook directly
// from ./store-context to keep this file a clean Provider-only Fast Refresh
// boundary — see the react-context-hmr note.
export type { StoreValue } from "./store-context";
import { errorMessage } from "@/lib/utils";
import { grossPay, buildPayrollRows, payrollTotals, COMPONENT_KEYS, setContributionRates as setEngineRates, setEarningsMatrix as setEngineMatrix, setDeductionInputs as setEngineDeductions, type PayrollComponents, type PayrollOverrides, type TimekeepingByEmployee } from "@/lib/payroll";
import { buildPayrollDeductionInputs } from "@/lib/payrollInputs";
import { ALL_AGENCIES, DIRECT_HIRE } from "@/lib/payrollReports";
import { isSupabaseConfigured, shouldSeed, supabase } from "@/lib/supabase";
import { detectDevice, getActiveActor, getActiveActorEmail, getCachedIp, resolvePublicIp } from "@/lib/clientInfo";

/**
 * A single in-memory store for the whole admin app. State lives in React state
 * (no persistence — a page refresh resets to seed data, by design). Every
 * mutating action funnels through helpers that also append an audit log entry.
 */

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

/**
 * Advance the shared id counter past every id already in the backend. The
 * counter resets to 1000 on each page load, but persisted rows keep the ids
 * minted in earlier sessions (e.g. ATT-1001). Without this, a freshly created
 * record reuses an existing suffix and its INSERT collides on the primary key
 * — surfacing as a 409 on write-through. Ids share one counter across all
 * prefixes, so we bump past the global max numeric suffix.
 */
const primeIdCounter = (ids: Iterable<string>) => {
  for (const id of ids) {
    const suffix = Number(id.slice(id.lastIndexOf("-") + 1));
    if (Number.isFinite(suffix) && suffix > idCounter) idCounter = suffix;
  }
};

// Agencies are a lightweight, user-managed registry persisted in the database
// (public.agencies). The default registry below is only the starting point for a
// fresh/offline store; every mutation write-throughs to the DB.
const DEFAULT_AGENCIES: Agency[] = [{ name: "Direct Hire" }];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [employees, setEmployees] = React.useState<Employee[]>(seedEmployees);
  const [users, setUsers] = React.useState<User[]>(seedUsers);
  const [departments, setDepartments] = React.useState<Department[]>(seedDepartments);
  const [attendance, setAttendance] = React.useState<AttendanceRecord[]>(seedAttendance);
  const [payrollRuns, setPayrollRuns] = React.useState<PayrollRun[]>(seedPayrollRuns);
  // Pending/approved batches awaiting review on the Data-Entry screen. Local
  // workflow state (not persisted) — mirrors the rest of the demo store.
  const [payrollApprovals, setPayrollApprovals] = React.useState<PayrollApproval[]>([]);
  const [reports, setReports] = React.useState<Report[]>(seedReports);
  const [documents, setDocuments] = React.useState<Document[]>(seedDocuments);
  const [roles, setRoles] = React.useState<Role[]>(seedRoles);
  const [settings, setSettings] = React.useState<Settings>(seedSettings);
  const [notifications, setNotifications] = React.useState<Notification[]>(seedNotifications);
  const [logs, setLogs] = React.useState<LogEntry[]>(seedLogs);
  const [contributionRates, setContributionRates] =
    React.useState<ContributionRate[]>(seedContributionRates);
  // Contribution Matrix: which earning lines are added to basic pay to form each
  // contribution's base. Lives in the store (not the Contributions page) because
  // the payroll engine reads it — a matrix change must move what payroll deducts.
  const [earningsMatrix, setEarningsMatrix] =
    React.useState<EarningsMatrix>(defaultEarningsMatrix);
  const [loans, setLoans] = React.useState<Loan[]>(seedLoans);
  // Leave-type catalogue. Ships empty; HR/Admin populate it (the statutory PH
  // presets are one click away on the Leave page).
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  // Filed leave applications. Approved records suppress the LWOP an attendance
  // import would otherwise book for a day with no punch — see lib/leaveRecords.
  const [leaveRecords, setLeaveRecords] = React.useState<LeaveRecord[]>([]);
  // Per-employee, tabbed Loans ledger (flat list; grouped per employee for the UI).
  const [employeeLoanEntries, setEmployeeLoanEntries] = React.useState<LoanEntry[]>([]);
  // Itemised timekeeping from the latest biometric import: unpaid-leave days,
  // unexcused absent days and pro-rated tardiness, per employee. Drives the
  // LWOP / absences / late deductions on every payroll row.
  const [timekeepingByEmployee, setTimekeepingByEmployee] =
    React.useState<TimekeepingByEmployee>({});
  const [payrollOverrides, setPayrollOverrides] = React.useState<PayrollOverrides>({});
  const [agencies, setAgencies] = React.useState<Agency[]>(DEFAULT_AGENCIES);

  // Feed the configured contribution brackets to the payroll engine so SSS,
  // PhilHealth, HDMF (Pag-IBIG) and Tax are deducted at the configured rates
  // everywhere payroll is computed (data-entry grid, register, payslip, NET
  // 15/30). Done during render rather than in an effect so children reading
  // derived payroll on this same commit already see the current table.
  setEngineRates(contributionRates);
  // Likewise the matrix: it decides each contribution's base, so an edit under
  // Contributions → Matrix must be visible to payroll on this same commit.
  setEngineMatrix(earningsMatrix);
  // And the loan ledgers: recording a loan (or paying one off) must move what
  // the next payroll run deducts. Memoised so the fold only re-runs when a
  // ledger actually changes, not on every unrelated store render.
  const deductionInputs = React.useMemo(
    () => buildPayrollDeductionInputs(loans, employeeLoanEntries),
    [loans, employeeLoanEntries],
  );
  setEngineDeductions(deductionInputs);

  // Ready immediately when there's no backend to wait for.
  const [ready, setReady] = React.useState(!isSupabaseConfigured);
  const backed = isSupabaseConfigured;

  /**
   * Fire a write-through to Supabase without blocking the (already-applied)
   * optimistic state update. Errors are logged; the UI stays responsive. In
   * offline/seed mode this is a no-op.
   */
  const persist = React.useCallback(
    (op: () => Promise<void>, opts?: { silent?: boolean }) => {
      if (!isSupabaseConfigured) return;
      op().catch((err: unknown) => {
        // Best-effort writes (e.g. audit logs, which also fire before sign-in
        // when RLS rejects them) pass silent:true — log to console at most, no
        // toast, so a failed login doesn't spam "Couldn't save" errors.
        if (opts?.silent) {
          // eslint-disable-next-line no-console
          console.debug("[aurora] Supabase write skipped:", errorMessage(err));
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[aurora] Supabase write failed:", err);
        toast({
          variant: "error",
          title: "Couldn't save to the database",
          description: errorMessage(err),
        });
      });
    },
    [toast],
  );

  // Resolve the client's public IP once so audit logs can stamp it.
  React.useEffect(() => {
    void resolvePublicIp();
  }, []);

  // ---- Load from Supabase (after auth) -----------------------------------
  // RLS gates every table to authenticated users, so loading must happen once
  // a session exists — NOT on bare mount (that returns 0 rows and would leave
  // logs/employees/etc. empty until refresh). We load on the restored session
  // and again on every sign-in.
  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase;
    let cancelled = false;
    let loading = false;

    const load = async () => {
      if (loading) return; // dedupe concurrent triggers (getSession + INITIAL_SESSION)
      loading = true;
      try {
        const data = await loadAll();
        if (cancelled) return;

        // Advance the id counter past every persisted id so newly minted ids
        // don't collide with existing rows on write-through (see primeIdCounter).
        primeIdCounter([
          ...data.employees, ...data.users, ...data.departments, ...data.attendance,
          ...data.payrollRuns, ...data.payrollApprovals, ...data.reports,
          ...data.documents, ...data.roles, ...data.notifications, ...data.logs,
          ...data.contributionRates, ...data.loans, ...data.employeeLoanEntries,
          ...data.leaveTypes, ...data.leaveRecords,
        ].map((r) => r.id));

        // If the backend is empty and seeding is enabled, push the seed data up
        // once, then use it locally. Otherwise adopt whatever the backend has.
        const empty = data.employees.length === 0 && data.users.length === 0;
        if (empty && shouldSeed) {
          await seedBackend();
          if (cancelled) return;
          // Local state already holds the seed defaults from useState initialisers.
        } else if (!empty) {
          setEmployees(data.employees);
          setUsers(data.users);
          setDepartments(data.departments);
          // Agencies live in the DB when backed; keep the in-memory default
          // only if the table is empty (fresh/unseeded backend).
          if (data.agencies.length) setAgencies(data.agencies);
          setAttendance(data.attendance);
          setPayrollRuns(data.payrollRuns);
          setPayrollApprovals(data.payrollApprovals);
          setReports(data.reports);
          setDocuments(data.documents);
          setRoles(data.roles);
          if (data.settings) setSettings(data.settings);
          setNotifications(data.notifications);
          setLogs(data.logs);
          setContributionRates(data.contributionRates);
          setLoans(data.loans);
          setEmployeeLoanEntries(data.employeeLoanEntries);
          setLeaveTypes(data.leaveTypes);
          setLeaveRecords(data.leaveRecords);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[aurora] Supabase load failed; using seed data.", err);
      } finally {
        loading = false;
        if (!cancelled) setReady(true);
      }
    };

    // Load immediately if a session is already restored; otherwise mark ready
    // so the login screen isn't blocked. Re-load whenever a session appears.
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void load();
      else setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        void load();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Push the current in-memory seed data to an empty backend (best-effort). */
  const seedBackend = React.useCallback(async () => {
    // Order respects FK dependencies (roles→users, departments→employees, …).
    await db.upsertRoles(seedRoles);
    await db.upsertDepartments(seedDepartments);
    await db.upsertAgencies(DEFAULT_AGENCIES);
    await db.upsertUsers(seedUsers);
    await db.upsertEmployees(seedEmployees);
    await db.upsertAttendanceMany(seedAttendance);
    await db.upsertPayrollRuns(seedPayrollRuns);
    await db.upsertReports(seedReports);
    await db.upsertDocuments(seedDocuments);
    await db.upsertContributionRates(seedContributionRates);
    await db.upsertNotifications(seedNotifications);
    await db.upsertLogs(seedLogs);
    await db.upsertSettings(seedSettings);
  }, []);

  const addLog = React.useCallback<StoreValue["addLog"]>((type, action, target = "—") => {
    const entry: LogEntry = {
      id: nextId("LOG"),
      type,
      actor: getActiveActor(),
      actorEmail: getActiveActorEmail() || undefined,
      action,
      target,
      time: new Date().toISOString(),
      // Security context: public IP (cached) + device from the User-Agent.
      ip: getCachedIp(),
      device: detectDevice(),
    };
    setLogs((prev) => [entry, ...prev]);
    // Audit-log persistence is best-effort: it can fire before sign-in (e.g. a
    // failed login) when RLS rejects the insert, so never surface a toast.
    persist(() => db.insertLog(entry), { silent: true });
  }, [persist]);

  const deptColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  // Ensure a department row exists for `name` (the employees FK targets
  // departments.name). Adds a minimal one to state if missing and returns it so
  // the caller can persist it BEFORE the employee row (avoids an FK violation on
  // an unknown dept). Returns null when the department already exists.
  const ensureDepartment = React.useCallback((name: string): Department | null => {
    if (!name) return null;
    let created: Department | null = null;
    setDepartments((prev) => {
      if (prev.some((d) => d.name === name)) return prev;
      created = {
        id: nextId("DEP"),
        name,
        lead: "",
        budget: 0,
        color: deptColors[prev.length % deptColors.length],
      };
      return [...prev, created];
    });
    if (created) addLog("system", `created department ${name}`);
    return created;
  }, [addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Employees ---------------------------------------------------------
  const addEmployee = React.useCallback<StoreValue["addEmployee"]>(
    (e) => {
      // The employee row references departments(name). If the dept is new, its
      // row must be committed FIRST — chain both writes so ordering is guaranteed.
      const newDept = ensureDepartment(e.department);
      const created: Employee = { ...e, id: nextId("EMP") };
      setEmployees((prev) => [created, ...prev]);
      persist(async () => {
        if (newDept) await db.upsertDepartment(newDept);
        await db.upsertEmployee(created);
      });
      addLog("employee", `added ${e.name} to ${e.department}`, created.id);
      return created;
    },
    [addLog, persist, ensureDepartment],
  );

  const updateEmployee = React.useCallback<StoreValue["updateEmployee"]>(
    (id, patch) => {
      // A changed department must exist (and be committed) first (FK).
      const newDept = patch.department ? ensureDepartment(patch.department) : null;
      setEmployees((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
        const updated = next.find((e) => e.id === id);
        if (updated)
          persist(async () => {
            if (newDept) await db.upsertDepartment(newDept);
            await db.upsertEmployee(updated);
          });
        return next;
      });
      addLog("employee", `updated employee ${patch.name ?? id}`, id);
    },
    [addLog, persist, ensureDepartment],
  );

  const removeEmployee = React.useCallback<StoreValue["removeEmployee"]>(
    (id) => {
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      persist(() => db.deleteEmployee(id));
      addLog("employee", `deleted employee`, id);
    },
    [addLog, persist],
  );

  const bulkSetEmployeeStatus = React.useCallback<StoreValue["bulkSetEmployeeStatus"]>(
    (ids, status) => {
      setEmployees((prev) => {
        const next = prev.map((e) => (ids.includes(e.id) ? { ...e, status } : e));
        persist(() => db.upsertEmployees(next.filter((e) => ids.includes(e.id))));
        return next;
      });
      addLog("employee", `set ${ids.length} employees to ${status}`, ids.join(", "));
    },
    [addLog, persist],
  );

  // ---- Agencies ----------------------------------------------------------
  const addAgency = React.useCallback<StoreValue["addAgency"]>(
    (name, logo) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setAgencies((prev) => {
        // Case-insensitive de-dupe; keep the first spelling registered.
        if (prev.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) return prev;
        const created = { name: trimmed, logo };
        const next = [...prev, created];
        persist(() => db.upsertAgency(created));
        return next;
      });
      addLog("settings", `registered agency "${trimmed}"`);
    },
    [addLog, persist],
  );

  const updateAgencyLogo = React.useCallback<StoreValue["updateAgencyLogo"]>(
    (name, logo) => {
      setAgencies((prev) => {
        let updated: Agency | undefined;
        const next = prev.map((a) => {
          if (a.name !== name) return a;
          updated = { ...a, logo };
          return updated;
        });
        if (!updated) return prev;
        persist(() => db.upsertAgency(updated!));
        return next;
      });
      addLog("settings", `${logo ? "updated" : "removed"} logo for agency "${name}"`);
    },
    [addLog, persist],
  );

  const removeAgency = React.useCallback<StoreValue["removeAgency"]>(
    (name) => {
      setAgencies((prev) => {
        const next = prev.filter((a) => a.name !== name);
        if (next.length === prev.length) return prev;
        persist(() => db.deleteAgency(name));
        return next;
      });
      addLog("settings", `removed agency "${name}"`);
    },
    [addLog, persist],
  );

  // ---- Users -------------------------------------------------------------
  const addUser = React.useCallback<StoreValue["addUser"]>(
    (u) => {
      const created: User = { ...u, id: nextId("USR"), lastActive: "just now" };
      setUsers((prev) => [created, ...prev]);
      persist(() => db.upsertUser(created));
      addLog("user", `invited user ${u.email}`, created.id);
    },
    [addLog, persist],
  );

  const updateUser = React.useCallback<StoreValue["updateUser"]>(
    (id, patch) => {
      setUsers((prev) => {
        const next = prev.map((u) => (u.id === id ? { ...u, ...patch } : u));
        const updated = next.find((u) => u.id === id);
        if (updated) persist(() => db.upsertUser(updated));
        return next;
      });
      addLog("user", `updated user ${patch.name ?? id}`, id);
    },
    [addLog, persist],
  );

  const removeUser = React.useCallback<StoreValue["removeUser"]>(
    (id) => {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      persist(() => db.deleteUser(id));
      addLog("user", `removed user`, id);
    },
    [addLog, persist],
  );

  const toggleUserActive = React.useCallback<StoreValue["toggleUserActive"]>(
    (id) => {
      setUsers((prev) => {
        const next = prev.map((u) =>
          u.id === id ? { ...u, status: (u.status === "active" ? "inactive" : "active") as User["status"] } : u,
        );
        const updated = next.find((u) => u.id === id);
        if (updated) persist(() => db.upsertUser(updated));
        return next;
      });
      addLog("user", `toggled account status`, id);
    },
    [addLog, persist],
  );

  // ---- Departments -------------------------------------------------------
  const headcountFor = React.useCallback(
    (name: string) => employees.filter((e) => e.department === name).length,
    [employees],
  );

  const addDepartment = React.useCallback<StoreValue["addDepartment"]>(
    (d) => {
      setDepartments((prev) => {
        const created: Department = {
          ...d,
          id: nextId("DEP"),
          color: deptColors[prev.length % deptColors.length],
        };
        persist(() => db.upsertDepartment(created));
        return [...prev, created];
      });
      addLog("system", `created department ${d.name}`);
    },
    [addLog, persist], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const updateDepartment = React.useCallback<StoreValue["updateDepartment"]>(
    (id, patch) => {
      setDepartments((prev) => {
        const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d));
        const updated = next.find((d) => d.id === id);
        if (updated) persist(() => db.upsertDepartment(updated));
        return next;
      });
      addLog("system", `updated department ${patch.name ?? id}`, id);
    },
    [addLog, persist],
  );

  const removeDepartment = React.useCallback<StoreValue["removeDepartment"]>(
    (id) => {
      setDepartments((prev) => prev.filter((d) => d.id !== id));
      persist(() => db.deleteDepartment(id));
      addLog("system", `deleted department`, id);
    },
    [addLog, persist],
  );

  // ---- Attendance --------------------------------------------------------
  const setAttendanceState = React.useCallback<StoreValue["setAttendance"]>(
    (id, state) => {
      setAttendance((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, state } : a));
        const updated = next.find((a) => a.id === id);
        if (updated) persist(() => db.upsertAttendance(updated));
        return next;
      });
      addLog("attendance", `marked attendance as ${state}`, id);
    },
    [addLog, persist],
  );

  const importAttendance = React.useCallback<StoreValue["importAttendance"]>(
    (records) => {
      let added = 0;
      let updated = 0;
      const persisted: AttendanceRecord[] = [];
      setAttendance((prev) => {
        const next = [...prev];
        for (const r of records) {
          // One record per employee+date: update in place, else append.
          const idx = next.findIndex((a) => a.employeeId === r.employeeId && a.date === r.date);
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...r };
            persisted.push(next[idx]);
            updated++;
          } else {
            const created = { ...r, id: nextId("ATT") };
            next.push(created);
            persisted.push(created);
            added++;
          }
        }
        return next;
      });
      // Bulk upsert on the (employee_id, date) unique key.
      persist(() => db.upsertAttendanceMany(persisted));
      addLog("attendance", `imported attendance: ${added} added, ${updated} updated`, `${records.length} rows`);
      return { added, updated };
    },
    [addLog, persist],
  );

  const setImportedLwop = React.useCallback<StoreValue["setImportedLwop"]>(
    (timekeeping) => {
      setTimekeepingByEmployee(timekeeping);
      const entries = Object.values(timekeeping);
      const total = entries.reduce(
        (s, t) => s + t.absentDays + t.unpaidLeaveDays + t.tardyDays,
        0,
      );
      addLog(
        "attendance",
        `recorded unpaid time for ${entries.length} employee(s)`,
        `${Math.round(total * 100) / 100} day(s)`,
      );
    },
    [addLog],
  );

  // ---- Payroll -----------------------------------------------------------
  const runPayroll = React.useCallback<StoreValue["runPayroll"]>(
    (period, agency) => {
      // Scope the run to an agency (or direct hires when agency === "") when a
      // selection is passed; otherwise include every active employee.
      const scoped =
        agency === undefined
          ? employees
          : employees.filter((e) => (e.agency ?? "") === agency);
      // Book the run at what payroll actually computes — every earning line,
      // the saved data-entry edits and any imported LWOP — not the raw HR
      // annual salary ÷ 12, which ignored overtime, allowances and edits and so
      // never matched the register the run was reviewed against. buildPayrollRows
      // also drops inactive employees, so the headcount is who is really paid.
      const rows = buildPayrollRows(scoped, timekeepingByEmployee, payrollOverrides);
      const gross = Math.round(payrollTotals(rows).gross);
      const scopeNote = agency === undefined ? "" : ` (${agency || "Direct hire"})`;
      const run: PayrollRun = {
        id: nextId("PAY"),
        period,
        // Record what this run paid, so the Payroll Report can tell a processed
        // agency from an unprocessed one instead of unlocking the whole period.
        agencyScope: agency === undefined ? null : agency,
        headcount: rows.length,
        gross,
        status: "processing",
        createdAt: new Date().toISOString(),
      };
      setPayrollRuns((prev) => [run, ...prev]);
      persist(() => db.upsertPayrollRun(run));
      addLog("payroll", `started payroll run for ${period}${scopeNote}`, run.id);
      // Simulate processing → processed. The run stops at "processed" (awaiting
      // approval); only Approve on the Payroll Report promotes it to "paid".
      window.setTimeout(() => {
        const processed: PayrollRun = { ...run, status: "processed" };
        setPayrollRuns((prev) => prev.map((r) => (r.id === run.id ? processed : r)));
        persist(() => db.upsertPayrollRun(processed));
      }, 2500);
    },
    [employees, timekeepingByEmployee, payrollOverrides, addLog, persist],
  );

  const markPayrollPaid = React.useCallback<StoreValue["markPayrollPaid"]>(
    (id) => {
      setPayrollRuns((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, status: "paid" as const } : r));
        const updated = next.find((r) => r.id === id);
        if (updated) persist(() => db.upsertPayrollRun(updated));
        return next;
      });
      addLog("payroll", `marked payroll run paid`, id);
    },
    [addLog, persist],
  );

  // Disapprove a single run: revert a paid run back to "processed" so it awaits
  // approval again (keeps the run; does not delete it).
  const disapprovePayrollRun = React.useCallback<StoreValue["disapprovePayrollRun"]>(
    (id) => {
      setPayrollRuns((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, status: "processed" as const } : r,
        );
        const updated = next.find((r) => r.id === id);
        if (updated) persist(() => db.upsertPayrollRun(updated));
        return next;
      });
      addLog("payroll", `disapproved payroll run`, id);
    },
    [addLog, persist],
  );

  // Permanently remove a single payroll run.
  const removePayrollRun = React.useCallback<StoreValue["removePayrollRun"]>(
    (id) => {
      setPayrollRuns((prev) => prev.filter((r) => r.id !== id));
      persist(() => db.deletePayrollRun(id));
      addLog("payroll", `deleted payroll run`, id);
    },
    [addLog, persist],
  );

  /**
   * Which runs an approve/disapprove targets.
   *
   * With no agency (or "All Agencies") this is every run in the period, the
   * original behaviour. With a specific agency it is only the runs booked for
   * that agency — a whole-company run is deliberately *not* matched, because
   * acting on it while one agency is on screen would silently approve or
   * destroy every other agency's payroll for the month.
   */
  const runsInScope = React.useCallback(
    (runs: PayrollRun[], period: string, agency?: string) =>
      runs.filter((r) => {
        if (r.period !== period) return false;
        if (agency === undefined || agency === ALL_AGENCIES) return true;
        const scope = r.agencyScope ?? null;
        return agency === DIRECT_HIRE ? scope === "" : scope === agency;
      }),
    [],
  );

  // Approve a processed period from the Payroll Report: mark the in-scope runs
  // paid (final). No-op if nothing is in scope.
  const approvePayrollPeriod = React.useCallback<StoreValue["approvePayrollPeriod"]>(
    (period, agency) => {
      let approvedCount = 0;
      setPayrollRuns((prev) => {
        const targets = new Set(runsInScope(prev, period, agency).map((r) => r.id));
        approvedCount = targets.size;
        const next = prev.map((r) =>
          targets.has(r.id) ? { ...r, status: "paid" as const } : r,
        );
        for (const r of next) {
          if (targets.has(r.id)) persist(() => db.upsertPayrollRun(r));
        }
        return next;
      });
      const note = agency && agency !== ALL_AGENCIES ? ` (${agency})` : "";
      if (approvedCount) addLog("payroll", `approved ${period} payroll${note}`, period);
      return approvedCount;
    },
    [runsInScope, addLog, persist],
  );

  // Disapprove a processed period: drop the in-scope run(s) so isPayrollProcessed
  // goes false, the report locks, and it can be re-run. Returns count removed.
  const disapprovePayrollPeriod = React.useCallback<StoreValue["disapprovePayrollPeriod"]>(
    (period, agency) => {
      let removed: PayrollRun[] = [];
      setPayrollRuns((prev) => {
        removed = runsInScope(prev, period, agency);
        const drop = new Set(removed.map((r) => r.id));
        return prev.filter((r) => !drop.has(r.id));
      });
      for (const r of removed) persist(() => db.deletePayrollRun(r.id));
      if (removed.length) {
        const note = agency && agency !== ALL_AGENCIES ? ` (${agency})` : "";
        addLog("payroll", `disapproved ${period} payroll${note} — run removed`, period);
      }
      return removed.length;
    },
    [runsInScope, addLog, persist],
  );

  const submitPayrollForApproval = React.useCallback<StoreValue["submitPayrollForApproval"]>(
    (batch) => {
      const created: PayrollApproval = {
        ...batch,
        id: nextId("PAP"),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setPayrollApprovals((prev) => [created, ...prev]);
      persist(() => db.upsertPayrollApproval(created));
      addLog("payroll", `submitted ${batch.period} for approval (${batch.agencyLabel})`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const approvePayroll = React.useCallback<StoreValue["approvePayroll"]>(
    (id) => {
      let approved: PayrollApproval | undefined;
      setPayrollApprovals((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, status: "approved" as const } : a));
        approved = next.find((a) => a.id === id);
        return next;
      });
      if (!approved) return;
      persist(() => db.upsertPayrollApproval(approved!));
      // Approving locks the amounts and kicks off the actual run. A null scope
      // means "all"; runPayroll treats undefined as all, "" as direct hires.
      runPayroll(approved.period, approved.agencyScope ?? undefined);
      addLog("payroll", `approved ${approved.period} payroll (${approved.agencyLabel})`, id);
    },
    [runPayroll, addLog, persist],
  );

  const disapprovePayroll = React.useCallback<StoreValue["disapprovePayroll"]>(
    (id) => {
      let removed: PayrollApproval | undefined;
      setPayrollApprovals((prev) => {
        removed = prev.find((a) => a.id === id);
        return prev.filter((a) => a.id !== id);
      });
      if (removed) {
        persist(() => db.deletePayrollApproval(id));
        addLog(
          "payroll",
          `disapproved ${removed.period} payroll (${removed.agencyLabel}) — returned to Payroll`,
          id,
        );
      }
    },
    [addLog, persist],
  );

  const savePayrollEntries = React.useCallback<StoreValue["savePayrollEntries"]>(
    async (period, rows) => {
      // A deterministic run id per period keeps re-saves idempotent (upsert on
      // run_id+employee_id updates in place instead of piling up duplicates).
      const runId = `RUN-${period.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const run: PayrollRun = {
        id: runId,
        period,
        headcount: rows.length,
        gross: Math.round(rows.reduce((s, r) => s + grossPay(r), 0)),
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      // Capture the hand-edited components per employee so buildPayrollRows can
      // overlay them onto the derived rows — this is what makes edits here show
      // up in the Payroll Report and the pre-run review.
      setPayrollOverrides((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          const edited: Partial<PayrollComponents> = {};
          for (const k of COMPONENT_KEYS) edited[k] = r[k];
          next[r.employeeId] = edited;
        }
        return next;
      });

      // Reflect the run in local state so the Payroll page sees it too.
      setPayrollRuns((prev) => {
        const idx = prev.findIndex((r) => r.id === runId);
        if (idx >= 0) {
          const next = [...prev];
          // Preserve a non-draft status if this run was already processed/paid.
          next[idx] = { ...run, status: prev[idx].status };
          return next;
        }
        return [run, ...prev];
      });

      if (isSupabaseConfigured) {
        // The FK requires the run row first, then the entries.
        await db.upsertPayrollRun(run);
        await db.upsertPayrollEntries(runId, rows);
      }
      addLog("payroll", `saved payroll entries for ${period}`, `${rows.length} employees`);
      return rows.length;
    },
    [addLog],
  );

  // ---- Reports -----------------------------------------------------------
  const addReport = React.useCallback<StoreValue["addReport"]>(
    (r) => {
      const created: Report = { ...r, id: nextId("RPT"), createdAt: new Date().toISOString() };
      setReports((prev) => [created, ...prev]);
      persist(() => db.upsertReport(created));
      addLog("report", `generated report "${r.name}"`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const removeReport = React.useCallback<StoreValue["removeReport"]>(
    (id) => {
      setReports((prev) => prev.filter((r) => r.id !== id));
      persist(() => db.deleteReport(id));
      addLog("report", `deleted report`, id);
    },
    [addLog, persist],
  );

  // ---- Documents ---------------------------------------------------------
  const addDocument = React.useCallback<StoreValue["addDocument"]>(
    (d) => {
      const created: Document = { ...d, id: nextId("DOC"), updatedAt: new Date().toISOString() };
      setDocuments((prev) => [created, ...prev]);
      persist(() => db.upsertDocument(created));
      addLog("document", `uploaded "${d.name}"`);
    },
    [addLog, persist],
  );

  const removeDocument = React.useCallback<StoreValue["removeDocument"]>(
    (id) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      persist(() => db.deleteDocument(id));
      addLog("document", `deleted document`, id);
    },
    [addLog, persist],
  );

  // ---- Roles -------------------------------------------------------------
  const addRole = React.useCallback<StoreValue["addRole"]>(
    (r) => {
      const created: Role = { ...r, id: nextId("ROLE"), members: 0 };
      setRoles((prev) => [...prev, created]);
      persist(() => db.upsertRole(created));
      addLog("role", `created role ${r.name}`);
    },
    [addLog, persist],
  );

  const updateRole = React.useCallback<StoreValue["updateRole"]>(
    (id, patch) => {
      setRoles((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        const updated = next.find((r) => r.id === id);
        if (updated) persist(() => db.upsertRole(updated));
        return next;
      });
      addLog("role", `updated role ${patch.name ?? id}`, id);
    },
    [addLog, persist],
  );

  const removeRole = React.useCallback<StoreValue["removeRole"]>(
    (id) => {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      persist(() => db.deleteRole(id));
      addLog("role", `deleted role`, id);
    },
    [addLog, persist],
  );

  const toggleRolePermission = React.useCallback<StoreValue["toggleRolePermission"]>(
    (id, perm) => {
      setRoles((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, permissions: { ...r.permissions, [perm]: !r.permissions[perm] } } : r,
        );
        const updated = next.find((r) => r.id === id);
        if (updated) persist(() => db.upsertRole(updated));
        return next;
      });
      addLog("role", `changed ${perm} permission`, id);
    },
    [addLog, persist],
  );

  // ---- Settings ----------------------------------------------------------
  const updateSettings = React.useCallback<StoreValue["updateSettings"]>(
    (patch) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(() => db.upsertSettings(next));
        return next;
      });
      addLog("settings", `updated workspace settings`);
    },
    [addLog, persist],
  );

  // ---- Notifications -----------------------------------------------------
  const markNotificationRead = React.useCallback<StoreValue["markNotificationRead"]>(
    (id) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, unread: false } : n));
        const updated = next.find((n) => n.id === id);
        if (updated) persist(() => db.upsertNotification(updated));
        return next;
      });
    },
    [persist],
  );

  const markAllNotificationsRead = React.useCallback<StoreValue["markAllNotificationsRead"]>(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, unread: false }));
      persist(() => db.upsertNotifications(next));
      return next;
    });
  }, [persist]);

  const removeNotification = React.useCallback<StoreValue["removeNotification"]>(
    (id) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      persist(() => db.deleteNotification(id));
    },
    [persist],
  );

  // ---- Contribution rates ------------------------------------------------
  const addContributionRate = React.useCallback<StoreValue["addContributionRate"]>(
    (r) => {
      const created: ContributionRate = {
        ...r,
        id: nextId("CR"),
        total: computeTotal(r.employerShare, r.employeeShare),
      };
      setContributionRates((prev) => [created, ...prev]);
      persist(() => db.upsertContributionRate(created));
      addLog("payroll", `added ${r.type} contribution rate`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const updateContributionRate = React.useCallback<StoreValue["updateContributionRate"]>(
    (id, patch) => {
      setContributionRates((prev) => {
        const next = prev.map((r) => {
          if (r.id !== id) return r;
          const merged = { ...r, ...patch };
          merged.total = computeTotal(merged.employerShare, merged.employeeShare);
          return merged;
        });
        const updated = next.find((r) => r.id === id);
        if (updated) persist(() => db.upsertContributionRate(updated));
        return next;
      });
      addLog("payroll", `updated contribution rate`, id);
    },
    [addLog, persist],
  );

  const removeContributionRate = React.useCallback<StoreValue["removeContributionRate"]>(
    (id) => {
      setContributionRates((prev) => prev.filter((r) => r.id !== id));
      persist(() => db.deleteContributionRate(id));
      addLog("payroll", `deleted contribution rate`, id);
    },
    [addLog, persist],
  );

  const importContributionRates = React.useCallback<StoreValue["importContributionRates"]>(
    (rows) => {
      const created = rows.map((r) => ({
        ...r,
        id: nextId("CR"),
        total: computeTotal(r.employerShare, r.employeeShare),
      }));
      setContributionRates((prev) => [...created, ...prev]);
      persist(() => db.upsertContributionRates(created));
      addLog("payroll", `imported ${created.length} contribution rates`);
      return created.length;
    },
    [addLog, persist],
  );

  const removeContributionRatesBy = React.useCallback<StoreValue["removeContributionRatesBy"]>(
    (filter) => {
      const matches = (r: ContributionRate) =>
        (filter.type === undefined || r.type === filter.type) &&
        (filter.month === undefined || r.effectiveMonth === filter.month) &&
        (filter.year === undefined || r.effectiveYear === filter.year);
      const removedRows = contributionRates.filter(matches);
      setContributionRates((prev) => prev.filter((r) => !matches(r)));
      persist(() => db.deleteContributionRates(removedRows.map((r) => r.id)));
      addLog(
        "payroll",
        `bulk-deleted ${removedRows.length} contribution rates`,
        [filter.type, filter.month, filter.year].filter(Boolean).join(" / ") || "all",
      );
      return removedRows.length;
    },
    [addLog, persist, contributionRates],
  );

  // ---- Contribution matrix -----------------------------------------------
  // Toggling an earning in/out of a contribution's base changes what every
  // payroll screen deducts, so these log like any other payroll config change.
  const toggleMatrixEarning = React.useCallback<StoreValue["toggleMatrixEarning"]>(
    (type, code) => {
      setEarningsMatrix((m) => toggleEarning(m, type, code));
      addLog("payroll", `toggled ${code} in the ${type} contribution base`);
    },
    [addLog],
  );

  const setMatrixEarnings = React.useCallback<StoreValue["setMatrixEarnings"]>(
    (type, codes) => {
      setEarningsMatrix((m) => ({ ...m, [type]: codes }));
      addLog("payroll", `set the ${type} contribution base to ${codes.length} earning(s)`);
    },
    [addLog],
  );

  // ---- Leave types -------------------------------------------------------
  // The catalogue of leave categories (Vacation, Sick, …), each scoped to the
  // agencies it applies to. Creating/editing is gated to HR + Administrator in
  // the UI (see canManageLeave); the store itself stays unopinionated so the
  // same actions back any future caller.
  const addLeaveType = React.useCallback<StoreValue["addLeaveType"]>(
    (draft) => {
      const created: LeaveType = {
        ...draft,
        name: draft.name.trim(),
        code: normalizeCode(draft.code),
        description: draft.description.trim(),
        agencies: normalizeAgencies(draft.agencies),
        id: nextId("LVT"),
        createdAt: new Date().toISOString(),
      };
      setLeaveTypes((prev) => [created, ...prev]);
      persist(() => db.upsertLeaveType(created));
      addLog("employee", `created leave type "${created.name}" (${created.code})`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const updateLeaveType = React.useCallback<StoreValue["updateLeaveType"]>(
    (id, patch) => {
      let updated: LeaveType | undefined;
      setLeaveTypes((prev) => {
        const next = prev.map((t) => {
          if (t.id !== id) return t;
          updated = {
            ...t,
            ...patch,
            // Keep the stored form canonical however the caller supplied it.
            ...(patch.name !== undefined && { name: patch.name.trim() }),
            ...(patch.code !== undefined && { code: normalizeCode(patch.code) }),
            ...(patch.agencies !== undefined && { agencies: normalizeAgencies(patch.agencies) }),
          };
          return updated;
        });
        return next;
      });
      if (!updated) return;
      persist(() => db.upsertLeaveType(updated!));
      addLog("employee", `updated leave type "${updated.name}"`, id);
    },
    [addLog, persist],
  );

  const removeLeaveType = React.useCallback<StoreValue["removeLeaveType"]>(
    (id) => {
      const removed = leaveTypes.find((t) => t.id === id);
      setLeaveTypes((prev) => prev.filter((t) => t.id !== id));
      persist(() => db.deleteLeaveType(id));
      addLog("employee", `deleted leave type "${removed?.name ?? id}"`, id);
    },
    [addLog, persist, leaveTypes],
  );

  const addLeaveTypes = React.useCallback<StoreValue["addLeaveTypes"]>(
    (drafts) => {
      const now = new Date().toISOString();
      const created: LeaveType[] = drafts.map((d) => ({
        ...d,
        name: d.name.trim(),
        code: normalizeCode(d.code),
        description: d.description.trim(),
        agencies: normalizeAgencies(d.agencies),
        id: nextId("LVT"),
        createdAt: now,
      }));
      if (!created.length) return 0;
      setLeaveTypes((prev) => [...created, ...prev]);
      persist(() => db.upsertLeaveTypes(created));
      addLog("employee", `added ${created.length} leave type(s)`);
      return created.length;
    },
    [addLog, persist],
  );

  // ---- Leave records (filed applications) --------------------------------
  // `payRule` and the type's name/code are snapshotted from the catalogue at
  // filing time: a record is a historical fact, so re-pricing "Vacation Leave"
  // from paid to unpaid next year must not retroactively dock leave already
  // taken. See the module note in lib/leaveRecords.
  const fileLeave = React.useCallback<StoreValue["fileLeave"]>(
    (draft) => {
      const type = leaveTypes.find((t) => t.id === draft.leaveTypeId);
      if (!type) return null;
      const created: LeaveRecord = {
        ...draft,
        id: nextId("LVR"),
        leaveTypeName: type.name,
        leaveTypeCode: type.code,
        payRule: type.payRule,
        // A record filed as already-approved is decided by whoever filed it.
        decidedBy: draft.status === "approved" ? getActiveActor() : "",
        decidedAt: draft.status === "approved" ? new Date().toISOString() : "",
        createdAt: new Date().toISOString(),
      };
      setLeaveRecords((prev) => [created, ...prev]);
      persist(() => db.upsertLeaveRecord(created));
      addLog(
        "employee",
        `filed ${type.code} leave for ${draft.employeeName} (${draft.startDate} to ${draft.endDate})`,
        created.id,
      );
      return created;
    },
    [addLog, persist, leaveTypes],
  );

  const decideLeave = React.useCallback<StoreValue["decideLeave"]>(
    (id, status) => {
      let updated: LeaveRecord | undefined;
      setLeaveRecords((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          updated = {
            ...r,
            status,
            // Reverting to pending clears the decision so the audit trail never
            // claims someone approved a record that is awaiting a decision.
            decidedBy: status === "pending" ? "" : getActiveActor(),
            decidedAt: status === "pending" ? "" : new Date().toISOString(),
          };
          return updated;
        }),
      );
      if (!updated) return;
      persist(() => db.upsertLeaveRecord(updated!));
      addLog("employee", `${status} ${updated.leaveTypeCode} leave for ${updated.employeeName}`, id);
    },
    [addLog, persist],
  );

  const removeLeaveRecord = React.useCallback<StoreValue["removeLeaveRecord"]>(
    (id) => {
      const removed = leaveRecords.find((r) => r.id === id);
      setLeaveRecords((prev) => prev.filter((r) => r.id !== id));
      persist(() => db.deleteLeaveRecord(id));
      addLog("employee", `deleted leave record for ${removed?.employeeName ?? id}`, id);
    },
    [addLog, persist, leaveRecords],
  );

  // ---- Loans -------------------------------------------------------------
  const addLoan = React.useCallback<StoreValue["addLoan"]>(
    (draft) => {
      const created: Loan = {
        ...draft,
        id: nextId("LOAN"),
        // Amortisation is always derived from principal/rate/term.
        monthlyAmortization: computeAmortization(draft.principal, draft.interestRate, draft.termMonths),
      };
      setLoans((prev) => [created, ...prev]);
      persist(() => db.upsertLoan(created));
      addLog("payroll", `added ${draft.type} for ${draft.employeeName}`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const updateLoan = React.useCallback<StoreValue["updateLoan"]>(
    (id, patch) => {
      setLoans((prev) => {
        const next = prev.map((l) => {
          if (l.id !== id) return l;
          const merged = { ...l, ...patch };
          // Keep the amortisation in sync whenever a driver changes.
          merged.monthlyAmortization = computeAmortization(
            merged.principal,
            merged.interestRate,
            merged.termMonths,
          );
          return merged;
        });
        const updated = next.find((l) => l.id === id);
        if (updated) persist(() => db.upsertLoan(updated));
        return next;
      });
      addLog("payroll", `updated loan`, id);
    },
    [addLog, persist],
  );

  const removeLoan = React.useCallback<StoreValue["removeLoan"]>(
    (id) => {
      setLoans((prev) => prev.filter((l) => l.id !== id));
      persist(() => db.deleteLoan(id));
      addLog("payroll", `deleted loan`, id);
    },
    [addLog, persist],
  );

  const importLoans = React.useCallback<StoreValue["importLoans"]>(
    (rows) => {
      const created = rows.map<Loan>((r) => ({
        ...r,
        id: nextId("LOAN"),
        monthlyAmortization: computeAmortization(r.principal, r.interestRate, r.termMonths),
      }));
      setLoans((prev) => [...created, ...prev]);
      persist(() => db.upsertLoans(created));
      addLog("payroll", `imported ${created.length} loans`);
      return created.length;
    },
    [addLog, persist],
  );

  // Record a repayment against a loan; the balance advances and the loan
  // auto-closes to "paid" once fully settled (see applyPayment).
  const recordLoanPayment = React.useCallback<StoreValue["recordLoanPayment"]>(
    (id, amount) => {
      setLoans((prev) => {
        const next = prev.map((l) => (l.id === id ? applyPayment(l, amount) : l));
        const updated = next.find((l) => l.id === id);
        if (updated) persist(() => db.upsertLoan(updated));
        return next;
      });
      addLog("payroll", `recorded loan payment of ${amount}`, id);
    },
    [addLog, persist],
  );

  // ---- Employee loan entries (per-employee, tabbed ledger) ---------------
  const loansForEmployee = React.useCallback<StoreValue["loansForEmployee"]>(
    (employeeId) => groupByTab(employeeLoanEntries.filter((e) => e.employeeId === employeeId)),
    [employeeLoanEntries],
  );

  const addEmployeeLoanEntry = React.useCallback<StoreValue["addEmployeeLoanEntry"]>(
    (entry) => {
      const id = nextId("ELN");
      const created: LoanEntry = {
        ...entry,
        id,
        control: controlFromId(id),
        // Per-month is always derived from amount ÷ term (whole PHP).
        perMonth: computePerMonth(entry.amount, entry.term),
      };
      setEmployeeLoanEntries((prev) => [created, ...prev]);
      persist(() => db.upsertEmployeeLoanEntry(created));
      addLog("payroll", `added ${entry.tab} loan entry`, created.id);
      return created;
    },
    [addLog, persist],
  );

  const removeEmployeeLoanEntry = React.useCallback<StoreValue["removeEmployeeLoanEntry"]>(
    (id) => {
      setEmployeeLoanEntries((prev) => prev.filter((e) => e.id !== id));
      persist(() => db.deleteEmployeeLoanEntry(id));
      addLog("payroll", `deleted loan entry`, id);
    },
    [addLog, persist],
  );

  const value: StoreValue = {
    employees,
    users,
    departments,
    attendance,
    payrollRuns,
    reports,
    documents,
    roles,
    settings,
    notifications,
    logs,
    contributionRates,
    loans,
    agencies,
    ready,
    backed,
    addLog,
    addEmployee,
    updateEmployee,
    removeEmployee,
    bulkSetEmployeeStatus,
    addAgency,
    updateAgencyLogo,
    removeAgency,
    addUser,
    updateUser,
    removeUser,
    toggleUserActive,
    addDepartment,
    updateDepartment,
    removeDepartment,
    headcountFor,
    setAttendance: setAttendanceState,
    importAttendance,
    timekeepingByEmployee,
    setImportedLwop,
    runPayroll,
    markPayrollPaid,
    disapprovePayrollRun,
    removePayrollRun,
    approvePayrollPeriod,
    disapprovePayrollPeriod,
    payrollApprovals,
    submitPayrollForApproval,
    approvePayroll,
    disapprovePayroll,
    savePayrollEntries,
    payrollOverrides,
    addReport,
    removeReport,
    addDocument,
    removeDocument,
    addRole,
    updateRole,
    removeRole,
    toggleRolePermission,
    updateSettings,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    addContributionRate,
    updateContributionRate,
    removeContributionRate,
    importContributionRates,
    removeContributionRatesBy,
    addLoan,
    updateLoan,
    removeLoan,
    importLoans,
    recordLoanPayment,
    leaveTypes,
    addLeaveType,
    updateLeaveType,
    removeLeaveType,
    addLeaveTypes,
    leaveRecords,
    fileLeave,
    decideLeave,
    removeLeaveRecord,
    earningsMatrix,
    toggleMatrixEarning,
    setMatrixEarnings,
    employeeLoanEntries,
    loansForEmployee,
    addEmployeeLoanEntry,
    removeEmployeeLoanEntry,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
