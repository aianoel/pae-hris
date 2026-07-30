/**
 * Debounced filter settling — the "less clicks" replacement for the GET /
 * Get Data button.
 *
 * Views derive their rows from the *settled* filters, which lag the live
 * selection by a short window so dragging through a dropdown doesn't recompute
 * on every intermediate value. Each view keeps its own `useMemo` over the
 * settled filters plus its store data, so dependencies stay explicit.
 *
 * Periods with no processed payroll run are handled by the caller as an inline
 * notice, deliberately NOT a modal: with auto-load, a SweetAlert would fire on
 * every filter change, which is the opposite of fewer clicks.
 */
import * as React from "react";

/** Debounce window for a filter change before the data recomputes. */
const DEBOUNCE_MS = 250;

/**
 * Returns `filters` delayed by the debounce window, plus a `settling` flag that
 * is true between a change and the value catching up. Rapid changes coalesce
 * into a single update.
 */
export function useSettledFilters<F>(filters: F): { settled: F; settling: boolean } {
  const [settled, setSettled] = React.useState(filters);
  const [settling, setSettling] = React.useState(false);

  // Compare by value: `filters` is typically rebuilt each render, so an
  // identity check would restart the timer forever.
  const serialized = JSON.stringify(filters);
  // Keep the latest object to hand without making it an effect dependency.
  const latest = React.useRef(filters);
  latest.current = filters;

  React.useEffect(() => {
    setSettling(true);
    const id = setTimeout(() => {
      setSettled(latest.current);
      setSettling(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [serialized]);

  return { settled, settling };
}
