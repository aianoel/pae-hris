import { FileDown, Printer, FileBarChart } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { downloadCsv } from "@/lib/export";
import {
  REPORT_META,
  buildReport,
  printReport,
  type ContributionReportKind,
} from "@/lib/contributionReports";
import type { ContributionRate } from "@/lib/contributions";

const KINDS: ContributionReportKind[] = [
  "matrix",
  "employee",
  "monthly-summary",
  "employer-share",
  "employee-share",
];

/** Report catalog — each generates an Excel/CSV export and a printable PDF. */
export function ContributionReports({ rates }: { rates: ContributionRate[] }) {
  const { employees } = useStore();
  const { toast } = useToast();

  const exportCsv = (kind: ContributionReportKind) => {
    const rows = buildReport(kind, rates, employees);
    if (!rows.length) {
      toast({ variant: "info", title: "Nothing to export", description: "No data for this report." });
      return;
    }
    downloadCsv(`contribution-${kind}`, rows);
    toast({ variant: "success", title: "Export ready", description: `${REPORT_META[kind].title} exported (${rows.length} rows).` });
  };

  const print = (kind: ContributionReportKind) => {
    const rows = buildReport(kind, rates, employees);
    const ok = printReport(REPORT_META[kind].title, rows);
    if (!ok) {
      toast({ variant: "error", title: "Popup blocked", description: "Allow popups to print or save as PDF." });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {KINDS.map((kind) => (
        <Card key={kind} interactive>
          <CardContent className="flex h-full flex-col p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileBarChart className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{REPORT_META[kind].title}</h3>
            <p className="mt-0.5 flex-1 text-sm text-muted-foreground">{REPORT_META[kind].description}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => exportCsv(kind)}>
                <FileDown className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => print(kind)}>
                <Printer className="h-4 w-4" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
