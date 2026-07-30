import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

interface CurrencyCellProps {
  value: number;
  onCommit: (next: number) => void;
  editable?: boolean;
  tone?: "default" | "positive" | "negative";
  ariaLabel: string;
}

/**
 * A single editable money cell. Shows formatted currency at rest; on focus it
 * becomes a bare numeric input. Committing (blur / Enter) flashes a brief
 * auto-save tick and pushes the value up for instant recalculation. Escape
 * reverts. Empty/invalid input is treated as 0.
 */
export function CurrencyCell({
  value,
  onCommit,
  editable = true,
  tone = "default",
  ariaLabel,
}: CurrencyCellProps) {
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
        <span className="text-xs text-muted-foreground">₱</span>
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
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`${ariaLabel}: ${formatCurrency(value)}${editable ? ", click to edit" : ""}`}
      className={cn(
        "group relative flex h-8 w-full items-center justify-end gap-1 rounded-lg px-2 text-sm tabular-nums transition-colors",
        editable ? "cursor-text hover:bg-primary/5 hover:ring-1 hover:ring-primary/30" : "cursor-default",
        tone === "positive" && value > 0 && "text-success",
        tone === "negative" && value > 0 && "text-destructive",
        tone === "default" && "text-foreground",
      )}
    >
      {saved && (
        <Check className="absolute left-1.5 h-3.5 w-3.5 animate-fade-in text-success" aria-hidden="true" />
      )}
      <span className={cn(value === 0 && "text-muted-foreground/50")}>
        {tone === "negative" && value > 0 ? "−" : ""}
        {formatCurrency(value)}
      </span>
    </button>
  );
}
