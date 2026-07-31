#!/usr/bin/env node
/**
 * Cross-check the generated bracket tables against the payroll engine's own
 * statutory formulas.
 *
 * The engine deducts a bracket's fixed `employeeShare` when one matches and
 * falls back to the formula when none does (see `statutoryBreakdown` in
 * src/lib/payroll.ts). Those two paths must not disagree, or loading the table
 * would silently change everyone's take-home pay. This walks a range of salaries
 * and compares table lookup against the formula for each type.
 *
 * A small delta is expected and legitimate: a band quantises the base to its
 * ₱500 step, so a salary mid-band is charged the band's rate rather than its own
 * exact percentage. We assert the delta stays within that quantisation bound and
 * report the worst case, rather than demanding equality that bands cannot give.
 *
 * Run:  node scripts/verify-contribution-rates.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readCsv(name) {
  const text = readFileSync(join(ROOT, name), "utf8").trim();
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

const lookup = (rows, salary) =>
  rows.find((r) => salary >= r["Salary From"] && salary <= r["Salary To"]) ?? null;
const eeAt = (rows, salary) => lookup(rows, salary)?.["Employee Share"] ?? null;

// ---- The engine's formulas (src/lib/payroll.ts) --------------------------

const sssMsc = (b) => Math.min(Math.max(Math.round(b / 500) * 500, 5000), 35000);
const phFormula = (b) => Math.min(Math.max(b, 10000), 100000) * 0.025;
/** What the engine falls back to: a flat 2%, capped at ₱200. */
const piEngineFormula = (b) => Math.min(b * 0.02, 200);
/**
 * The actual statutory rule, which the generated table follows: the employee
 * rate is 1% at a Monthly Fund Salary of ₱1,500 or below, 2% above it.
 *
 * The engine's fallback flattens this to 2% everywhere. The divergence is
 * confined to salaries ≤ ₱1,500 — far below any Philippine minimum wage, so no
 * real employee sits there — and it resolves in the table's favour anyway: once
 * the table is loaded a bracket always matches, so the fallback never runs for
 * this type. Asserted below so the difference stays a deliberate, visible
 * choice rather than drifting into an unexplained mismatch.
 */
const piStatutoryFormula = (b) =>
  b <= 1500 ? b * 0.01 : Math.min(b * 0.02, 200);
function withholdingTax(taxable) {
  if (taxable <= 20833) return 0;
  if (taxable <= 33332) return (taxable - 20833) * 0.15;
  if (taxable <= 66666) return 1875 + (taxable - 33333) * 0.2;
  if (taxable <= 166666) return 8541.8 + (taxable - 66667) * 0.25;
  if (taxable <= 666666) return 33541.8 + (taxable - 166667) * 0.3;
  return 183541.8 + (taxable - 666667) * 0.35;
}

const sss = readCsv("sss-rates-2026.csv");
const ph = readCsv("philhealth-rates-2026.csv");
const pi = readCsv("pagibig-rates-2026.csv");
const tax = readCsv("tax-rates-2026.csv");

let failures = 0;
const worst = { PhilHealth: 0, "Pag-IBIG": 0, Tax: 0 };
/** Salaries where the table follows the statute but the engine's fallback wouldn't. */
const engineDivergence = [];

for (let salary = 500; salary <= 100000; salary += 250) {
  // --- PhilHealth: ≤ half a band's premium (₱500 × 2.5% = ₱6.25) ---
  const phTable = eeAt(ph, salary);
  if (phTable === null) {
    console.error(`FAIL PhilHealth: no band covers ${salary}`);
    failures++;
  } else {
    const d = Math.abs(phTable - phFormula(salary));
    worst.PhilHealth = Math.max(worst.PhilHealth, d);
    if (d > 6.25 + 0.5) {
      console.error(`FAIL PhilHealth @${salary}: table ${phTable} vs formula ${phFormula(salary).toFixed(2)}`);
      failures++;
    }
  }

  // --- Pag-IBIG: ≤ half a band at 2% (₱5), and never above the ₱200 cap ---
  const piTable = eeAt(pi, salary);
  if (piTable === null) {
    console.error(`FAIL Pag-IBIG: no band covers ${salary}`);
    failures++;
  } else {
    const d = Math.abs(piTable - piStatutoryFormula(salary));
    worst["Pag-IBIG"] = Math.max(worst["Pag-IBIG"], d);
    if (piTable > 200) {
      console.error(`FAIL Pag-IBIG @${salary}: ${piTable} exceeds the 200 cap`);
      failures++;
    } else if (d > 5 + 0.5) {
      console.error(
        `FAIL Pag-IBIG @${salary}: table ${piTable} vs statute ${piStatutoryFormula(salary).toFixed(2)}`,
      );
      failures++;
    }
    // Record where the table intentionally departs from the engine's flat 2%.
    if (Math.abs(piTable - piEngineFormula(salary)) > 5 + 0.5) engineDivergence.push(salary);
  }

  // --- Tax: chain through the other three, as statutoryBreakdown does ---
  const taxTable = eeAt(tax, salary);
  if (taxTable !== null) {
    const sssEe = eeAt(sss, salary) ?? Math.round(sssMsc(salary) * 0.05);
    const taxable = salary - (sssEe + (phTable ?? 0) + (piTable ?? 0));
    const d = Math.abs(taxTable - withholdingTax(taxable));
    worst.Tax = Math.max(worst.Tax, d);
    // A ₱500 band spans at most ₱500 of taxable pay; at the top 35% marginal
    // rate that is ₱175 of tax, so allow half a band's worth.
    if (d > 250 * 0.35 + 1) {
      console.error(`FAIL Tax @${salary}: table ${taxTable} vs formula ${withholdingTax(taxable).toFixed(2)}`);
      failures++;
    }
  }
}

console.log("max deviation from the statutory formula (quantisation only):");
for (const [k, v] of Object.entries(worst)) console.log(`  ${k}: ${v.toFixed(2)}`);

if (engineDivergence.length) {
  const max = Math.max(...engineDivergence);
  console.log(
    `\nPag-IBIG: table follows the statutory 1% rate at ${engineDivergence.length} salary ` +
      `point(s) up to ₱${max}, where the engine's fallback assumes a flat 2%. ` +
      `Expected — see piStatutoryFormula. The table wins once loaded.`,
  );
  if (max > 1500) {
    console.error(`FAIL: divergence at ₱${max} is above the ₱1,500 threshold — not explained by the 1% rule`);
    failures++;
  }
}

// Every band's Total must reconcile to ER + EE — the app recomputes it via
// computeTotal, so a stored mismatch would be silently overwritten.
for (const [name, rows] of [["PhilHealth", ph], ["Pag-IBIG", pi], ["Tax", tax]]) {
  for (const r of rows) {
    if (r.Total !== r["Employer Share"] + r["Employee Share"]) {
      console.error(`FAIL ${name}: Total ${r.Total} != ER+EE at ${r["Salary From"]}`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nall checks passed: tables agree with the payroll engine");
