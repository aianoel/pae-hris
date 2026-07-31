import { moduleThemeFor } from "@/config/moduleTheme";
import { cn } from "@/lib/utils";

interface ModuleBackdropProps {
  /** Current route; decides the hue and pattern. */
  pathname: string;
  className?: string;
}

/**
 * Ambient per-module backdrop behind the scrollable content area.
 *
 * Two stacked layers: a soft gradient wash (two off-screen radial blooms) and a
 * faint geometric pattern. Both derive from a single hue supplied by
 * `moduleThemeFor`, passed down as the `--module-hue` custom property so the
 * CSS in index.css can build every colour from it.
 *
 * `aria-hidden` + `pointer-events-none`: this is decoration, so it must not
 * reach the accessibility tree or intercept clicks meant for the page.
 */
export function ModuleBackdrop({ pathname, className }: ModuleBackdropProps) {
  const { hue, pattern } = moduleThemeFor(pathname);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ ["--module-hue" as string]: String(hue) }}
    >
      {/* Gradient wash — the colour identity. */}
      <div className="module-wash absolute inset-0" />

      {/* Geometric motif, masked so it fades out before the page bottom and
          never forms a hard edge against the content below. */}
      <div className={cn("module-pattern absolute inset-0", `module-pattern-${pattern}`)} />
    </div>
  );
}
