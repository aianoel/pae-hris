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
 * Three stacked layers: a photographic base, a soft gradient wash (two
 * off-screen radial blooms) and a faint geometric pattern. The upper two
 * derive from a single hue supplied by `moduleThemeFor`, passed down as the
 * `--module-hue` custom property so the CSS in index.css can build every
 * colour from it. The photo is desaturated and held at a very low opacity so
 * it reads as texture under the module's colour rather than as an image.
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
      {/* Photographic base — shared across every module, tinted by the wash
          that sits on top of it. */}
      <div className="module-photo absolute inset-0" />

      {/* Gradient wash — the colour identity. */}
      <div className="module-wash absolute inset-0" />

      {/* Geometric motif, masked so it fades out before the page bottom and
          never forms a hard edge against the content below. */}
      <div className={cn("module-pattern absolute inset-0", `module-pattern-${pattern}`)} />
    </div>
  );
}
