import * as React from "react";
import { FileBarChart, Download, Trash2, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import type { Report } from "@/store/types";
import { downloadCsv } from "@/lib/export";
import { formatDate } from "@/lib/format";

const REPORT_TYPES = ["Headcount", "Payroll", "Attendance", "Turnover", "Compensation"];
const RANGES = ["Last 7 days", "Last 30 days", "This quarter", "This year", "All time"];

export function ReportsPage() {
  const { reports, employees, departments, addReport, removeReport } = useStore();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Report | null>(null);

  const [type, setType] = React.useState(REPORT_TYPES[0]);
  const [range, setRange] = React.useState(RANGES[1]);

  const rowCountFor = (t: string) => {
    if (t === "Headcount") return departments.length;
    return employees.length;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const report = addReport({
      name: `${type} · ${range}`,
      type,
      range,
      rows: rowCountFor(type),
    });
    toast({ variant: "success", title: "Report generated", description: report.name });
    setFormOpen(false);
  };

  // Export a report's underlying rows to CSV.
  const exportReport = (r: Report) => {
    if (r.type === "Headcount") {
      downloadCsv(
        r.name,
        departments.map((d) => ({ department: d.name, lead: d.lead, budget: d.budget })),
      );
    } else {
      downloadCsv(
        r.name,
        employees.map((e) => ({
          id: e.id,
          name: e.name,
          department: e.department,
          role: e.role,
          status: e.status,
          salary: e.salary,
        })),
      );
    }
    toast({ variant: "success", title: "Export complete", description: `${r.name} downloaded.` });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Build and export custom reports."
        actions={
          <Button size="lg" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New report
          </Button>
        }
      />

      {reports.length === 0 ? (
        <Card className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <FileBarChart className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No reports yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Generate your first report to see it here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <Card key={r.id} interactive>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chart-4/10 text-chart-4">
                    <FileBarChart className="h-5 w-5" />
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{r.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.rows} rows · {r.type}</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="default" className="h-9 flex-1" onClick={() => exportReport(r)}>
                    <Download className="h-4 w-4" /> Export
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    aria-label="Delete report"
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New report</DialogTitle>
            <DialogDescription>Choose a type and time range to generate.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rpt-type">Report type</Label>
              <Select id="rpt-type" value={type} onChange={(e) => setType(e.target.value)}>
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rpt-range">Time range</Label>
              <Select id="rpt-range" value={range} onChange={(e) => setRange(e.target.value)}>
                {RANGES.map((rg) => (
                  <option key={rg} value={rg}>{rg}</option>
                ))}
              </Select>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit">Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete report?"
        description={deleting ? `"${deleting.name}" will be removed.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeReport(deleting.id);
            toast({ variant: "success", title: "Report deleted" });
          }
        }}
      />
    </>
  );
}
