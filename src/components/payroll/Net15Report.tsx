import * as React from "react";
import { Printer, ArrowUpDown } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import { cn } from "@/lib/utils";
import { printReport } from "@/lib/export";
import { net15Rows, runsForPeriod, autoReportBrand, type Net15Row } from "@/lib/payrollReports";
import { fmt } from "./reportFilters";
import { useReportFilters } from "./reportFilterContext";
import { useSettledFilters } from "./useAutoReport";
import { ReportNotice } from "./ReportNotice";

/** Position shown when the signed-in user has no role recorded. */
const FALLBACK_POSITION = "ASST. VICE PRESIDENT FOR OPERATIONS";

type SortKey = "employee_name" | "account_no" | "net";

/**
 * NET 15 — the 1st-half net-pay listing per employee, printed for bank
 * submission over an authorised signature. Data reloads automatically from the
 * shared period filters; the signatory block is pre-filled from the signed-in
 * user and today's date so printing is a single click, and stays editable when
 * someone else signs.
 */
export function Net15Report() {
  const { employees, agencies, payrollRuns, payrollOverrides, contributionRates } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const shared = useReportFilters();

  const [sortKey, setSortKey] = React.useState<SortKey>("employee_name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  // Signatory block, pre-filled from the session. `touched` stops the auto-fill
  // from overwriting a name the user has typed themselves.
  const today = new Date().toISOString().slice(0, 10);
  const [sigDate, setSigDate] = React.useState(today);
  const [sigName, setSigName] = React.useState("");
  const [sigPosition, setSigPosition] = React.useState("");
  const touched = React.useRef(false);

  React.useEffect(() => {
    if (touched.current || !user) return;
    setSigName(user.name);
    setSigPosition(user.role?.toUpperCase() || FALLBACK_POSITION);
  }, [user]);

  const filters = React.useMemo(
    () => ({ year: shared.year, month: shared.month, payclass: shared.payclass, paytype: shared.paytype }),
    [shared.year, shared.month, shared.payclass, shared.paytype],
  );
  const { settled, settling } = useSettledFilters(filters);

  // This tab reports every agency, so it only needs the period's runs to skip
  // employees whose agency was never processed.
  const periodRuns = React.useMemo(
    () => runsForPeriod(payrollRuns, shared.month, shared.year),
    [payrollRuns, shared.month, shared.year],
  );

  const loadedRows = React.useMemo(
    () => (shared.processed ? net15Rows(employees, settled, payrollOverrides, periodRuns) : []),
    // contributionRates: net pay depends on the configured statutory brackets.
    [employees, settled, payrollOverrides, contributionRates, shared.processed, periodRuns],
  );

  const rows = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...loadedRows].sort((a, b) => {
      if (sortKey === "net") return (a.net - b.net) * dir;
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir;
    });
  }, [loadedRows, sortKey, sortDir]);

  const totalNet = React.useMemo(() => rows.reduce((s, r) => s + r.net, 0), [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const scope = `${shared.month} ${shared.year} · ${shared.payclass} · 1st half`;

  // Letterhead, detected from the employees on the page: when they all belong to
  // one agency the printout is branded with its logo, otherwise it stays plain.
  const brand = React.useMemo(
    () => autoReportBrand(rows.map((r) => r.employee_id), employees, agencies),
    [rows, employees, agencies],
  );

  const print = () => {
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to print", description: "No NET 15 data for this period." });
      return;
    }
    // The signatory is what makes this printout an authorised instruction to
    // the bank, so require a name before producing it.
    if (!sigName.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Signatory required",
        text: "Enter the name and position of the signatory before printing the report.",
        confirmButtonText: "OK",
      });
      return;
    }
    const printable = rows.map((r) => ({
      "EMP NAME": r.employee_name,
      "ACCOUNT NO.": r.account_no,
      NET: fmt(r.net),
    }));
    const ok = printReport("NET 15", printable, {
      subtitle: scope,
      brand,
      totals: { "EMP NAME": "TOTAL", NET: fmt(totalNet) },
      signatory: { name: sigName.trim(), position: sigPosition.trim(), date: sigDate || undefined },
    });
    if (!ok) toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
  };

  return (
    <div className="space-y-4">
      {/* Signatory block — pre-filled from the session; printed on the report. */}
      <Card className="border-primary/30 bg-primary/[0.04] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="n15-sig-date">Signatory</Label>
            <Input
              id="n15-sig-date"
              type="date"
              value={sigDate}
              onChange={(e) => {
                touched.current = true;
                setSigDate(e.target.value);
              }}
              className="h-11 w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n15-sig-name" className="sr-only">Signatory name</Label>
            <Input
              id="n15-sig-name"
              placeholder="Enter name"
              value={sigName}
              onChange={(e) => {
                touched.current = true;
                setSigName(e.target.value);
              }}
              className="h-11 w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n15-sig-pos" className="sr-only">Signatory position</Label>
            <Input
              id="n15-sig-pos"
              placeholder="Position"
              value={sigPosition}
              onChange={(e) => {
                touched.current = true;
                setSigPosition(e.target.value);
              }}
              className="h-11 w-[22rem]"
            />
          </div>
          <Button variant="outline" className="ml-auto h-11" onClick={print}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
        <p className="mt-3 text-xs font-medium text-destructive">
          Indicate the name and position of the signatory for the print out report.
        </p>
      </Card>

      {/* NET 15 table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">NET 15</h3>
          <p className="text-xs text-muted-foreground">{scope}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {([
                  { key: "employee_name", label: "Emp Name", numeric: false },
                  { key: "account_no", label: "Account No.", numeric: false },
                  { key: "net", label: "Net", numeric: true },
                ] as const).map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", c.numeric && "flex-row-reverse")}
                    >
                      {c.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-foreground" : "opacity-40")} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-16 text-center">
                    <ReportNotice
                      blocked={!shared.processed}
                      settling={settling}
                      month={shared.month}
                      year={shared.year}
                      payclass={shared.payclass}
                      noun="NET 15 data"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r: Net15Row) => (
                  <tr key={r.employee_id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                    <td className="whitespace-nowrap px-3 py-2.5 pl-5 text-sm font-medium text-foreground">{r.employee_name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums text-muted-foreground">{r.account_no}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(r.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="whitespace-nowrap px-3 py-3 pl-5 text-sm font-semibold text-foreground" colSpan={2}>
                  TOTAL
                </td>
                <td className="whitespace-nowrap px-3 py-3 pr-5 text-right text-sm font-semibold tabular-nums text-foreground">{fmt(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
