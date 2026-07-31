#!/usr/bin/env node
/**
 * Generate the PhilHealth, Pag-IBIG (HDMF) and withholding-tax bracket tables
 * for the Contribution Management matrix, as CSVs in the same shape as
 * `sss-rates-2026.csv` (importable through Contributions → Import).
 *
 * WHY GENERATED RATHER THAN HAND-TYPED: all three are published as *formulas*
 * (a percentage of a floored/capped base), not as printed bracket tables the way
 * SSS is. The app, though, looks up a bracket and deducts its fixed
 * `employeeShare` (see findMatchingRate / configuredEmployeeShare), so the
 * formula has to be expanded into bands. Deriving them here keeps the table and
 * the engine's own fallback formulas in agreement — the constants below mirror
 * `statutoryBreakdown` in src/lib/payroll.ts exactly.
 *
 * Bands are ₱500 wide and centred on the base they compute against, matching the
 * published SSS bands (e.g. 5250–5749 → MSC 5500) so all four tables line up in
 * the Schedule cross-tab.
 *
 * Run:  node scripts/generate-contribution-rates.mjs
 * Out:  philhealth-rates-2026.csv, pagibig-rates-2026.csv, tax-rates-2026.csv
 *       (pass --sql to also emit contribution-rates.sql for a direct DB load)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BAND = 500;
/** Upper sentinel for an open-ended top band, per sss-rates-2026.csv. */
const OPEN_TO = 999999;
const MONTH = "January";
const YEAR = 2026;

// ---- Statutory parameters (mirror src/lib/payroll.ts) --------------------

/** PhilHealth: 5% premium split 50/50, base floored ₱10k and capped ₱100k. */
const PH = { rate: 0.05, floor: 10000, ceiling: 100000 };
/**
 * Pag-IBIG: employer always 2%; employee 1% at a Monthly Fund Salary of ₱1,500
 * or below and 2% above it. MFS is capped at ₱10,000, so both shares top out at
 * ₱200 — which is the cap the engine's `Math.min(basic * 0.02, 200)` encodes.
 */
const PI = { erRate: 0.02, eeLowRate: 0.01, eeRate: 0.02, lowThreshold: 1500, cap: 10000 };
/** Tax bands stop here; above it the engine's exact TRAIN computation is used. */
const TAX_CEILING = 100000;

/**
 * Progressive monthly withholding tax — BIR TRAIN-law table effective 2023
 * onwards. Copied verbatim from `withholdingTax` in src/lib/payroll.ts
 * (boundary constants included) so a generated row never disagrees with the
 * value the engine would compute for the same taxable pay.
 */
function withholdingTax(taxable) {
  if (taxable <= 20833) return 0;
  if (taxable <= 33332) return (taxable - 20833) * 0.15;
  if (taxable <= 66666) return 1875 + (taxable - 33333) * 0.2;
  if (taxable <= 166666) return 8541.8 + (taxable - 66667) * 0.25;
  if (taxable <= 666666) return 33541.8 + (taxable - 166667) * 0.3;
  return 183541.8 + (taxable - 666667) * 0.35;
}

/** SSS Monthly Salary Credit — mirrors `sssMonthlySalaryCredit`. */
const sssMsc = (basic) => Math.min(Math.max(Math.round(basic / 500) * 500, 5000), 35000);

// ---- Row helpers ---------------------------------------------------------

const row = (type, from, to, msc, er, ee) => ({
  Type: type,
  "Salary From": from,
  "Salary To": to,
  MSC: msc,
  "Employer Share": er,
  "Employee Share": ee,
  Total: er + ee,
  Month: MONTH,
  Year: YEAR,
  Status: "active",
});

/** Look up a generated table the way the app's findMatchingRate would. */
const shareAt = (rows, salary) =>
  rows.find((r) => salary >= r["Salary From"] && salary <= r["Salary To"])?.["Employee Share"] ?? null;

// ---- PhilHealth ---------------------------------------------------------

/**
 * One band per ₱500 step of the premium base. The floor band opens at 0 (every
 * salary under ₱10k pays the ₱10k premium) and the ceiling band runs open-ended
 * (above ₱100k the premium is flat), so the table is exact at both ends.
 */
function philhealthRows() {
  const rows = [];
  for (let base = PH.floor; base <= PH.ceiling; base += BAND) {
    const from = base === PH.floor ? 0 : base - BAND / 2;
    const to = base === PH.ceiling ? OPEN_TO : base + BAND / 2 - 1;
    const total = Math.round(base * PH.rate);
    const ee = Math.round(total / 2);
    // Derive ER by subtraction so ER + EE always reconciles to the premium.
    rows.push(row("PhilHealth", from, to, base, total - ee, ee));
  }
  return rows;
}

// ---- Pag-IBIG -----------------------------------------------------------

/**
 * Two rate regions, both banded at ₱500 so neither over-collects:
 *
 *  - At or below ₱1,500 the employee rate is 1%. This region is banded rather
 *    than collapsed to a single ₱1,500 row — a single row would charge someone
 *    earning ₱500 the ₱15 due on ₱1,500, triple what they owe.
 *  - Above ₱1,500 the employee rate is 2%, up to the ₱10,000 fund-salary cap,
 *    beyond which both shares are flat ₱200 (so the top band is open-ended).
 *
 * The ₱1,500 threshold lands exactly on a band edge, so nobody straddling it is
 * charged the wrong rate.
 */
function pagibigRows() {
  const rows = [];
  // 1% region: bases 500, 1000, 1500.
  for (let base = BAND; base <= PI.lowThreshold; base += BAND) {
    const from = base === BAND ? 0 : base - BAND / 2;
    // Stop the last low band exactly on the threshold; 2% starts at +1.
    const to = Math.min(base + BAND / 2 - 1, PI.lowThreshold);
    rows.push(
      row("Pag-IBIG", from, to, base, Math.round(base * PI.erRate), Math.round(base * PI.eeLowRate)),
    );
  }
  // 2% region up to the cap.
  for (let base = 2000; base <= PI.cap; base += BAND) {
    const from = base === 2000 ? PI.lowThreshold + 1 : base - BAND / 2;
    const to = base === PI.cap ? OPEN_TO : base + BAND / 2 - 1;
    rows.push(
      row("Pag-IBIG", from, to, base, Math.round(base * PI.erRate), Math.round(base * PI.eeRate)),
    );
  }
  return rows;
}

// ---- Withholding tax ----------------------------------------------------

/**
 * Tax is levied on pay *net* of the three contributions, so each band chains
 * through them: taxable = basic − (SSS + PhilHealth + Pag-IBIG), exactly as
 * `statutoryBreakdown` does. SSS comes from the published table when present so
 * the chain uses the same figures payroll will.
 *
 * Two deliberate choices:
 *  - The whole zero-tax region collapses into a single band. The value is
 *    identically 0 throughout, so merging costs no accuracy and saves ~45 rows.
 *  - The table stops at ₱100,000 with no open top band. A salary above it
 *    matches nothing, which makes the engine fall back to the exact progressive
 *    computation — better than pinning high earners to one flat bracket.
 */
function taxRows(sssRows, phRows, piRows) {
  const bands = [];
  for (let base = BAND; base <= TAX_CEILING; base += BAND) {
    const from = base === BAND ? 0 : base - BAND / 2;
    const to = base + BAND / 2 - 1;

    const sss = shareAt(sssRows, base) ?? Math.round(sssMsc(base) * 0.05);
    const ph = shareAt(phRows, base) ?? 0;
    const pi = shareAt(piRows, base) ?? 0;
    const taxable = base - (sss + ph + pi);
    // Employer share is 0: withholding tax is entirely the employee's.
    bands.push(row("Tax", from, to, Math.max(0, Math.round(taxable)), 0, Math.round(withholdingTax(taxable))));
  }

  // Collapse the leading run of zero-tax bands into one.
  let lastZero = -1;
  for (let i = 0; i < bands.length; i++) {
    if (bands[i]["Employee Share"] !== 0) break;
    lastZero = i;
  }
  if (lastZero <= 0) return bands;
  const merged = bands[lastZero];
  merged["Salary From"] = 0;
  return [merged, ...bands.slice(lastZero + 1)];
}

// ---- CSV ----------------------------------------------------------------

const HEADER = [
  "Type", "Salary From", "Salary To", "MSC",
  "Employer Share", "Employee Share", "Total", "Month", "Year", "Status",
];

const toCsv = (rows) =>
  [HEADER.join(","), ...rows.map((r) => HEADER.map((h) => r[h]).join(","))].join("\n") + "\n";

/** Parse the published SSS table (plain CSV, no quoted fields). */
function readSssRows() {
  const text = readFileSync(join(ROOT, "sss-rates-2026.csv"), "utf8").trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const r = {};
    cols.forEach((c, i) => {
      const n = Number(cells[i]);
      r[c] = Number.isNaN(n) || cells[i] === "" ? cells[i] : n;
    });
    return r;
  });
}

// ---- Main ---------------------------------------------------------------

const sss = readSssRows();
const philhealth = philhealthRows();
const pagibig = pagibigRows();
const tax = taxRows(sss, philhealth, pagibig);

const outputs = [
  ["philhealth-rates-2026.csv", philhealth],
  ["pagibig-rates-2026.csv", pagibig],
  ["tax-rates-2026.csv", tax],
];

for (const [name, rows] of outputs) {
  writeFileSync(join(ROOT, name), toCsv(rows), "utf8");
  console.log(`${name}: ${rows.length} bands`);
}

// Assert the invariant the app's import validator enforces: no overlaps, and a
// contiguous ladder within each type. A gap or overlap here would surface as
// silently skipped rows on import, so fail loudly instead.
for (const [name, rows] of outputs) {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i];
    if (cur["Salary From"] !== prev["Salary To"] + 1) {
      console.error(
        `FAIL ${name}: band ${i} starts at ${cur["Salary From"]}, expected ${prev["Salary To"] + 1}`,
      );
      process.exit(1);
    }
  }
}
console.log("bands are contiguous and non-overlapping");

if (process.argv.includes("--sql")) {
  // Ids are minted well above the app's counter base so a generated row can't
  // collide with one created in the UI (see the nextId note in store/index.tsx).
  let n = 10000;
  const values = [...philhealth, ...pagibig, ...tax]
    .map((r) => {
      const id = `CR-${++n}`;
      return `('${id}','${r.Type}',${r["Salary From"]},${r["Salary To"]},${r.MSC},${r["Employer Share"]},${r["Employee Share"]},${r.Total},1,${r.Year},'active')`;
    })
    .join(",\n  ");
  const sql = `-- Generated by scripts/generate-contribution-rates.mjs — do not edit by hand.
-- Loads the PhilHealth, Pag-IBIG and withholding-tax bracket tables.
-- Re-runnable: each type is cleared for the period before reload.
BEGIN;
DELETE FROM public.contribution_rates
 WHERE type IN ('PhilHealth','Pag-IBIG','Tax') AND effective_month = 1 AND effective_year = ${YEAR};
INSERT INTO public.contribution_rates
  (id, type, salary_from, salary_to, msc, employer_share, employee_share, total, effective_month, effective_year, status)
VALUES
  ${values};
COMMIT;
`;
  writeFileSync(join(ROOT, "contribution-rates.sql"), sql, "utf8");
  console.log(`contribution-rates.sql: ${philhealth.length + pagibig.length + tax.length} rows`);
}
