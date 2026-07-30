import * as React from "react";
import { Layers } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EARNING_FIELDS, DEDUCTION_FIELDS, DRIVER_FIELDS, DERIVED_KEYS, type PayrollFieldKey } from "@/lib/payroll";

// Bulk-editable fields: every earning/deduction except basic and the
// auto-calculated amounts, plus the timekeeping drivers (OT Hours, etc.).
const DERIVED = new Set<PayrollFieldKey>(DERIVED_KEYS);
const OPTIONS = [
  ...EARNING_FIELDS,
  ...DEDUCTION_FIELDS,
  ...DRIVER_FIELDS.map((d) => ({ key: d.key, label: d.label })),
].filter((f) => f.key !== "basic" && !DERIVED.has(f.key));

export type BulkMode = "set" | "add";

export function BulkUpdateDialog({
  open,
  onOpenChange,
  count,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  onApply: (field: PayrollFieldKey, mode: BulkMode, amount: number) => void;
}) {
  const [field, setField] = React.useState<PayrollFieldKey>("allowances");
  const [mode, setMode] = React.useState<BulkMode>("set");
  const [amount, setAmount] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <DialogTitle>Bulk update</DialogTitle>
          <DialogDescription>
            Apply a value to {count} selected employee{count > 1 ? "s" : ""} at once. Net pay recalculates instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bulk-field">Field</Label>
            <Select id="bulk-field" value={field} onChange={(e) => setField(e.target.value as PayrollFieldKey)}>
              {OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-mode">Mode</Label>
            <Select id="bulk-mode" value={mode} onChange={(e) => setMode(e.target.value as BulkMode)}>
              <option value="set">Set to</option>
              <option value="add">Add to current</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-amount">Amount</Label>
            <Input
              id="bulk-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onApply(field, mode, Math.max(0, Math.round(Number(amount) || 0)));
              onOpenChange(false);
              setAmount("");
            }}
          >
            Apply to {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
