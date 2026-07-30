import * as React from "react";
import { Plus, FileUp, FileDown, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { downloadCsv, parseCsv } from "@/lib/export";
import { formatCurrency } from "@/lib/format";
import {
  CONTRIBUTION_TYPES,
  validateRate,
  type ContributionRate,
  type ContributionType,
  type RateStatus,
  type RateDraft,
} from "@/lib/contributions";
import { matrixReport } from "@/lib/contributionReports";
import { ContributionMatrix } from "@/components/contributions/ContributionMatrix";
import { ScheduleMatrix } from "@/components/contributions/ScheduleMatrix";
import { RateFormDialog } from "@/components/contributions/RateFormDialog";
import { SalaryCalculator } from "@/components/contributions/SalaryCalculator";
import { EmployeeContribution } from "@/components/contributions/EmployeeContribution";
import { GroupDeleteDialog } from "@/components/contributions/GroupDeleteDialog";
import { ContributionReports } from "@/components/contributions/ContributionReports";

const MONTH_INDEX: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Parse an imported CSV row (matrix export shape) into a rate draft. */
function rowToDraft(row: Record<string, string>): RateDraft | null {
  const type = row["Type"] as ContributionType;
  if (!CONTRIBUTION_TYPES.includes(type)) return null;
  const monthRaw = (row["Month"] ?? "").toLowerCase();
  const month = MONTH_INDEX[monthRaw] ?? (Number(monthRaw) || 1);
  const status = (row["Status"] === "inactive" ? "inactive" : "active") as RateStatus;
  return {
    type,
    salaryFrom: Number(row["Salary From"]) || 0,
    salaryTo: Number(row["Salary To"]) || 0,
    msc: Number(row["MSC"]) || 0,
    employerShare: Number(row["Employer Share"]) || 0,
    employeeShare: Number(row["Employee Share"]) || 0,
    effectiveMonth: month,
    effectiveYear: Number(row["Year"]) || 2026,
    status,
  };
}

export function ContributionsPage() {
  const {
    contributionRates,
    addContributionRate,
    updateContributionRate,
    removeContributionRate,
    importContributionRates,
    removeContributionRatesBy,
  } = useStore();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContributionRate | null>(null);
  const [deleting, setDeleting] = React.useState<ContributionRate | null>(null);
  const [groupDeleteOpen, setGroupDeleteOpen] = React.useState(false);

  // ---- CRUD --------------------------------------------------------------
  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (rate: ContributionRate) => {
    setEditing(rate);
    setFormOpen(true);
  };

  const submitRate = (draft: RateDraft) => {
    if (editing) {
      updateContributionRate(editing.id, draft);
      toast({ variant: "success", title: "Rate updated", description: `${draft.type} band saved.` });
    } else {
      addContributionRate(draft);
      toast({ variant: "success", title: "Rate added", description: `New ${draft.type} band created.` });
    }
  };

  // ---- Import / export ---------------------------------------------------
  const exportAll = () => {
    downloadCsv("contribution-matrix", matrixReport(contributionRates));
    toast({ variant: "success", title: "Exported", description: `${contributionRates.length} rates exported to CSV.` });
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      const drafts: RateDraft[] = [];
      let skipped = 0;
      const running = [...contributionRates];
      for (const row of parsed) {
        const draft = rowToDraft(row);
        if (!draft || !validateRate(draft, running).ok) {
          skipped += 1;
          continue;
        }
        drafts.push(draft);
        // Track imported rows so intra-file overlaps are also rejected.
        running.push({ ...draft, id: `tmp-${running.length}`, total: draft.employerShare + draft.employeeShare });
      }
      if (drafts.length) importContributionRates(drafts);
      toast({
        variant: drafts.length ? "success" : "info",
        title: "Import complete",
        description: `${drafts.length} imported${skipped ? `, ${skipped} skipped (invalid or overlapping)` : ""}.`,
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      <PageHeader
        title="Contribution Management"
        description="Manage statutory contribution tables and auto-compute employee deductions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onImportFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={exportAll}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setGroupDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Bulk delete
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New rate
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix">Contribution Matrix</TabsTrigger>
          <TabsTrigger value="rates">Rate Table</TabsTrigger>
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="employee">Employee</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <ScheduleMatrix rates={contributionRates} />
        </TabsContent>

        <TabsContent value="rates">
          <ContributionMatrix
            rates={contributionRates}
            onEdit={openEdit}
            onDelete={setDeleting}
          />
        </TabsContent>

        <TabsContent value="calculator">
          <div className="max-w-2xl">
            <SalaryCalculator rates={contributionRates} />
          </div>
        </TabsContent>

        <TabsContent value="employee">
          <div className="max-w-2xl">
            <EmployeeContribution rates={contributionRates} />
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <ContributionReports rates={contributionRates} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        rates={contributionRates}
        onSubmit={submitRate}
      />

      <GroupDeleteDialog
        open={groupDeleteOpen}
        onOpenChange={setGroupDeleteOpen}
        rates={contributionRates}
        onConfirm={(filter) => {
          const n = removeContributionRatesBy(filter);
          toast({ variant: "success", title: "Rates deleted", description: `${n} contribution rate${n === 1 ? "" : "s"} removed.` });
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete contribution rate?"
        description={
          deleting
            ? `The ${deleting.type} band ${formatCurrency(deleting.salaryFrom)}–${formatCurrency(deleting.salaryTo)} will be permanently removed.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeContributionRate(deleting.id);
            toast({ variant: "success", title: "Rate deleted", description: `${deleting.type} band removed.` });
          }
        }}
      />
    </>
  );
}
