/**
 * Verify the payroll deduction rules end to end, against the real modules.
 *
 * Checks, in order:
 *   1. loans  — both ledgers sum onto the row, respecting status and balance;
 *   2. lwop   — approved UNPAID leave deducts; approved PAID leave does not;
 *   3. absent — a day missed with no filed leave deducts once, not twice;
 *   4. late   — tardiness is pro-rated and charged separately from absences;
 *   5. contributions — the configured bracket's employee share is what's taken;
 *   6. reconciliation — the register's TOTAL DEDN equals the grid's, to the peso.
 *
 * Run: node scripts/verify-payroll-deductions.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Resolve the app's "@/..." alias and strip types so the TS sources run as-is.
register("./ts-alias-loader.mjs", pathToFileURL("./scripts/"));

const payroll = await import("../src/lib/payroll.ts");
const inputs = await import("../src/lib/payrollInputs.ts");
const reports = await import("../src/lib/payrollReports.ts");
const attendance = await import("../src/lib/attendanceImport.ts");

let failures = 0;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
function check(name, pass, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- Fixtures -------------------------------------------------------------
// ₱360,000/yr = ₱30,000/mo. Daily rate = 30000*12/261 = ₱1,379.31.
const MONTHLY = 30000;
const DAILY = (MONTHLY * 12) / 261;
const emp = (over = {}) => ({
  id: "EMP-T1",
  name: "Test Employee",
  role: "Analyst",
  department: "Finance",
  salary: MONTHLY * 12,
  status: "active",
  employmentType: "Regular",
  bioId: "9001",
  ...over,
});

const loan = (over = {}) => ({
  id: "LOAN-1",
  employeeId: "EMP-T1",
  employeeName: "Test Employee",
  type: "SSS Salary Loan",
  reference: "",
  principal: 24000,
  interestRate: 0,
  termMonths: 24,
  monthlyAmortization: 1000,
  amountPaid: 0,
  startDate: "2026-01-01",
  status: "active",
  ...over,
});

const ledgerEntry = (over = {}) => ({
  id: "ELN-1",
  employeeId: "EMP-T1",
  tab: "hdmf",
  amount: 12000,
  term: "24",
  perMonth: 500,
  type: "Multi-Purpose",
  date: "2026-01-01",
  control: "CTRL-1",
  paid: 0,
  ...over,
});

const rowOf = (rows) => rows[0];

console.log("\n1. LOANS — both ledgers deduct, status and balance respected");
{
  payroll.setDeductionInputs(
    inputs.buildPayrollDeductionInputs([loan()], [ledgerEntry()]),
  );
  const r = rowOf(payroll.buildPayrollRows([emp()]));
  check("active loan + ledger entry sum onto `loans`", r.loans === 1500, `got ₱${r.loans}, want ₱1500`);

  // An on-hold loan must deduct nothing.
  payroll.setDeductionInputs(
    inputs.buildPayrollDeductionInputs([loan({ status: "on-hold" })], []),
  );
  check("on-hold loan deducts ₱0", rowOf(payroll.buildPayrollRows([emp()])).loans === 0);

  // A loan in its final month collects only the remaining balance, not a full
  // amortisation: 24,000 payable, 23,700 paid → ₱300 left, amortisation ₱1,000.
  payroll.setDeductionInputs(
    inputs.buildPayrollDeductionInputs([loan({ amountPaid: 23700 })], []),
  );
  const last = rowOf(payroll.buildPayrollRows([emp()])).loans;
  check("final month collects only the balance", last === 300, `got ₱${last}, want ₱300`);

  // A fully-paid ledger line stops deducting.
  payroll.setDeductionInputs(
    inputs.buildPayrollDeductionInputs([], [ledgerEntry({ paid: 12000 })]),
  );
  check("fully-paid ledger line deducts ₱0", rowOf(payroll.buildPayrollRows([emp()])).loans === 0);

  // No records at all → no loan deduction (the "real data only" rule).
  payroll.setDeductionInputs(inputs.buildPayrollDeductionInputs([], []));
  const none = rowOf(payroll.buildPayrollRows([emp()]));
  check("employee with no loans on file is deducted ₱0", none.loans === 0 && none.cashAdvance === 0);
}

console.log("\n2. UNPAID TIME — leave, absence and lateness each charge once");
{
  payroll.setDeductionInputs(inputs.buildPayrollDeductionInputs([], []));

  // No timekeeping data → nothing docked. Inventing absences would cut real pay.
  const clean = rowOf(payroll.buildPayrollRows([emp()]));
  check(
    "no attendance import → no unpaid-time deduction",
    clean.lwop === 0 && clean.absences === 0 && clean.late === 0 && clean.undertime === 0,
    `lwop=${clean.lwop} absences=${clean.absences} late=${clean.late}`,
  );

  // 2 days of approved UNPAID leave.
  const unpaid = rowOf(
    payroll.buildPayrollRows([emp()], {
      "EMP-T1": { absentDays: 0, unpaidLeaveDays: 2, tardyDays: 0 },
    }),
  );
  check(
    "2 d approved unpaid leave → LWOP = daily × 2",
    near(unpaid.lwop, DAILY * 2),
    `got ₱${unpaid.lwop}, want ₱${Math.round(DAILY * 2)}`,
  );
  check("unpaid leave does NOT also hit absences", unpaid.absences === 0);

  // 3 days absent with nothing filed.
  const absent = rowOf(
    payroll.buildPayrollRows([emp()], {
      "EMP-T1": { absentDays: 3, unpaidLeaveDays: 0, tardyDays: 0 },
    }),
  );
  check(
    "3 d absent, no leave filed → absences = daily × 3",
    near(absent.absences, DAILY * 3),
    `got ₱${absent.absences}, want ₱${Math.round(DAILY * 3)}`,
  );
  check("absence does NOT also hit LWOP", absent.lwop === 0);

  // 30 minutes late = 1/16 of an 8-hour day.
  const tardy = rowOf(
    payroll.buildPayrollRows([emp()], {
      "EMP-T1": { absentDays: 0, unpaidLeaveDays: 0, tardyDays: 0.0625 },
    }),
  );
  check(
    "30 min late → late = daily × 0.0625",
    near(tardy.late, DAILY * 0.0625),
    `got ₱${tardy.late}, want ₱${Math.round(DAILY * 0.0625)}`,
  );
  check("lateness does NOT also hit LWOP or absences", tardy.lwop === 0 && tardy.absences === 0);

  // The critical regression: all three at once must total exactly their sum.
  const all = rowOf(
    payroll.buildPayrollRows([emp()], {
      "EMP-T1": { absentDays: 1, unpaidLeaveDays: 1, tardyDays: 0.5 },
    }),
  );
  const want = Math.round(DAILY) * 2 + Math.round(DAILY * 0.5);
  check(
    "1 absent + 1 unpaid-leave + half-day late charges 2.5 days, not more",
    near(all.lwop + all.absences + all.late, want, 2),
    `got ₱${all.lwop + all.absences + all.late}, want ≈₱${want}`,
  );
}

console.log("\n3. PAID LEAVE — filed and approved must never deduct");
{
  // Drive the real parser: an employee with no punches all week, covered by
  // approved PAID leave, must come back with zero unpaid time.
  const employees = [emp()];
  const log = "# no punches for this employee this week\n9002\t2026-07-13 08:00:00\t1\t1\t9002\tI\t0\n";
  const paidLeave = {
    id: "LR-1",
    employeeId: "EMP-T1",
    employeeName: "Test Employee",
    leaveTypeId: "LT-1",
    leaveTypeName: "Vacation Leave",
    leaveTypeCode: "VL",
    payRule: "paid",
    startDate: "2026-07-13",
    endDate: "2026-07-17",
    reason: "",
    status: "approved",
    decidedBy: "HR",
    decidedAt: "2026-07-01",
    createdAt: "2026-07-01",
  };

  // With the leave filed: the employee is on-leave, not absent.
  const withLeave = attendance.parseAttendanceText(log, employees, [paidLeave]);
  const rec = withLeave.lwop.find((l) => l.employeeId === "EMP-T1");
  check(
    "approved PAID leave → no LWOP recorded at all",
    !rec || rec.lwopDays === 0,
    rec ? `lwopDays=${rec.lwopDays}` : "no record (employee never punched)",
  );

  // Same week filed as UNPAID leave must deduct — that is what filing unpaid means.
  const unpaidLeave = { ...paidLeave, payRule: "unpaid" };
  const empWithPunch = [emp({ bioId: "9002" })];
  const punchLog =
    "9002\t2026-07-13 08:00:00\t1\t1\t9002\tI\t0\n9002\t2026-07-17 08:00:00\t1\t1\t9002\tI\t0\n";
  const unpaidResult = attendance.parseAttendanceText(punchLog, empWithPunch, [unpaidLeave]);
  const ur = unpaidResult.lwop.find((l) => l.employeeId === "EMP-T1");
  check(
    "approved UNPAID leave → 5 working days charged",
    ur && ur.unpaidLeaveDays === 5,
    ur ? `unpaidLeaveDays=${ur.unpaidLeaveDays}` : "no record",
  );
  check(
    "a stray punch on a leave day is not a tardiness charge",
    ur && ur.tardyDays === 0,
    ur ? `tardyDays=${ur.tardyDays}` : "",
  );

  // Pending leave must NOT suppress the deduction.
  const pending = { ...paidLeave, status: "pending" };
  const pendingResult = attendance.parseAttendanceText(punchLog, empWithPunch, [pending]);
  const pr = pendingResult.lwop.find((l) => l.employeeId === "EMP-T1");
  check(
    "PENDING leave does not suppress the absence charge",
    pr && pr.absentDays === 3,
    pr ? `absentDays=${pr.absentDays}` : "no record",
  );
}

console.log("\n4. CONTRIBUTIONS — the configured bracket is what's deducted");
{
  payroll.setDeductionInputs(inputs.buildPayrollDeductionInputs([], []));
  // A bracket covering ₱30,000 basic + ₱5,500 statutory allowances (COLA 1500 +
  // rice 2000 + transport 2000) = ₱35,500 contributable base.
  payroll.setContributionRates([
    {
      id: "R-SSS", type: "SSS", salaryFrom: 0, salaryTo: 1000000, msc: 35000,
      employerShare: 3500, employeeShare: 1750, total: 5250,
      effectiveMonth: 1, effectiveYear: 2026, status: "active",
    },
    {
      id: "R-PHIC", type: "PhilHealth", salaryFrom: 0, salaryTo: 1000000, msc: 35500,
      employerShare: 444, employeeShare: 444, total: 888,
      effectiveMonth: 1, effectiveYear: 2026, status: "active",
    },
    {
      id: "R-HDMF", type: "Pag-IBIG", salaryFrom: 0, salaryTo: 1000000, msc: 10000,
      employerShare: 200, employeeShare: 200, total: 400,
      effectiveMonth: 1, effectiveYear: 2026, status: "active",
    },
    {
      id: "R-TAX", type: "Tax", salaryFrom: 0, salaryTo: 1000000, msc: 0,
      employerShare: 0, employeeShare: 1234, total: 1234,
      effectiveMonth: 1, effectiveYear: 2026, status: "active",
    },
  ]);

  const r = rowOf(payroll.buildPayrollRows([emp()]));
  const stat = payroll.statutoryFor(r);
  check("SSS = the bracket's employee share", stat.sss === 1750, `got ₱${stat.sss}`);
  check("PhilHealth = the bracket's employee share", stat.philHealth === 444, `got ₱${stat.philHealth}`);
  check("Pag-IBIG = the bracket's employee share", stat.pagIbig === 200, `got ₱${stat.pagIbig}`);
  check("Tax = the bracket's employee share", stat.tax === 1234, `got ₱${stat.tax}`);
  check(
    "govDeductions = SSS + PHIC + HDMF + Tax",
    r.govDeductions === 1750 + 444 + 200 + 1234,
    `got ₱${r.govDeductions}, want ₱3628`,
  );
  check("every type matched a configured bracket", stat.unmatched.length === 0,
    `unmatched: ${stat.unmatched.join(", ")}`);
  check(
    "base includes basic + statutory allowances (matrix)",
    stat.base.SSS === 35500,
    `got ₱${stat.base.SSS}, want ₱35500`,
  );
}

console.log("\n5. RECONCILIATION — register TOTAL DEDN equals the grid, to the peso");
{
  payroll.setDeductionInputs(
    inputs.buildPayrollDeductionInputs(
      [loan(), loan({ id: "LOAN-2", type: "Company Loan", monthlyAmortization: 700 })],
      [ledgerEntry(), ledgerEntry({ id: "ELN-2", tab: "hmo", perMonth: 350, amount: 4200 })],
    ),
  );
  const timekeeping = { "EMP-T1": { absentDays: 1, unpaidLeaveDays: 1, tardyDays: 0.25 } };
  const rows = payroll.buildPayrollRows([emp()], timekeeping);
  const r = rows[0];

  const reg = reports.deptRegister(
    [emp()],
    {
      year: "2026", month: "JUL",
      payclass: "All Pay Classes", paytype: "Full month", agency: "All Agencies",
    },
    {},
    timekeeping,
  )[0];

  check(
    "register GROSS EARNINGS === grid gross",
    reg.gross_earnings === payroll.grossPay(r),
    `register ₱${reg.gross_earnings} vs grid ₱${payroll.grossPay(r)}`,
  );
  check(
    "register TOTAL DEDN === grid deductions",
    reg.total_dedn === payroll.totalDeductions(r),
    `register ₱${reg.total_dedn} vs grid ₱${payroll.totalDeductions(r)}`,
  );
  check(
    "register NET === grid net",
    reg.total_net === payroll.netPay(r),
    `register ₱${reg.total_net} vs grid ₱${payroll.netPay(r)}`,
  );
  check(
    "company loan (no column) still deducted, via OTHER DEDN",
    r.loans === 1000 + 700 + 500,
    `loans roll-up ₱${r.loans}, want ₱2200`,
  );
  check(
    "SSS loan lands on its own register column",
    reg.sss_loan === 1000,
    `got ₱${reg.sss_loan}`,
  );
  check(
    "ledger HMO overrides the per-type default premium",
    reg.hmo_dedn === 350,
    `got ₱${reg.hmo_dedn}`,
  );
}

console.log(
  failures === 0
    ? "\nAll payroll deduction checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
