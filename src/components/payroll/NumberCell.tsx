import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface NumberCellProps {
  value: number;
  onCommit: (next: number) => void;
  editable?: boolean;
  /** Short unit suffix shown at rest, e.g. "h" or "d". */
  unit?: string;
  ariaLabel: string;
}

/**
 * A compact editable count cell (overtime hours, LWOP days, …). Shows the value
 * with an optional unit at rest; on focus becomes a bare numeric input.
 * Committing (blur / Enter) flashes an auto-save tick and pushes the value up
 * so the derived amount recalculates. Escape reverts. Invalid input → 0.
 */
export function NumberCell({ value, onCommit, editable = true, unit, ariaLabel }: NumberCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [saved, setSaved] = React.useState(false);
  const savedTimer = React.useRef<number>();

  React.useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const startEdit = () => {
    if (!editable) return;
    setDraft(value ? String(value) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = Math.max(0, Math.round(Number(draft) || 0));
    if (next !== value) {
      onCommit(next);
      setSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 1200);
    }
  };

  if (editing) {
    return (
      <div className="flex h-8 items-center rounded-lg border border-primary bg-card px-2 shadow-focus">
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={ariaLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(String(value));
              setEditing(false);
            }
          }}
          className="h-full w-full min-w-0 bg-transparent px-1 text-right text-sm tabular-nums outline-none"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`${ariaLabel}: ${value}${unit ?? ""}${editable ? ", click to edit" : ""}`}
      className={cn(
        "group relative flex h-8 w-full items-center justify-end gap-1 rounded-lg px-2 text-sm tabular-nums transition-colors",
        editable ? "cursor-text hover:bg-primary/5 hover:ring-1 hover:ring-primary/30" : "cursor-default",
        "text-foreground",
      )}
    >
      {saved && (
        <Check className="absolute left-1.5 h-3.5 w-3.5 animate-fade-in text-success" aria-hidden="true" />
      )}
      <span className={cn(value === 0 && "text-muted-foreground/50")}>
        {value}
        {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
      </span>
    </button>
  );
}
