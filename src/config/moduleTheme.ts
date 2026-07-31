/**
 * Per-module backdrop identity.
 *
 * Each route gets a hue and a pattern motif so a module is recognisable before
 * you read its title. The treatment is deliberately faint — this is an HRIS
 * whose pages are mostly dense tables, so the backdrop has to read as texture
 * and never compete with the data sitting on top of it.
 *
 * Hues are drawn from the same wheel as the `--chart-*` tokens in index.css,
 * so the backdrop stays in family with charts rendered over it.
 */

/** Geometric motif layered over the gradient wash. */
export type ModulePattern = "grid" | "dots" | "diagonal" | "rings";

export interface ModuleTheme {
  /** HSL hue angle, 0–360. Saturation/lightness are fixed in the CSS. */
  hue: number;
  pattern: ModulePattern;
}

/**
 * Route path → backdrop. Keys are matched as prefixes, longest first, so
 * `/payroll/report` picks its own entry rather than inheriting `/payroll`.
 */
const MODULE_THEMES: Record<string, ModuleTheme> = {
  // Overview — the app's primary blue, kept for the landing surfaces.
  "/": { hue: 221, pattern: "grid" },
  "/analytics": { hue: 199, pattern: "diagonal" },

  // People — violet through indigo.
  "/users": { hue: 262, pattern: "dots" },
  "/employees": { hue: 239, pattern: "dots" },
  "/departments": { hue: 280, pattern: "grid" },

  // Time — greens, distinct from both People and Payroll.
  "/attendance": { hue: 172, pattern: "grid" },
  "/leave": { hue: 152, pattern: "rings" },

  // Payroll — a warm amber family; the three payroll screens are adjacent
  // hues so they feel related while staying individually identifiable.
  "/payroll": { hue: 38, pattern: "rings" },
  "/payroll/data-entry": { hue: 28, pattern: "grid" },
  "/payroll/report": { hue: 45, pattern: "diagonal" },

  // Remaining Operations screens.
  "/contributions": { hue: 190, pattern: "rings" },
  "/reports": { hue: 255, pattern: "diagonal" },
  "/documents": { hue: 210, pattern: "grid" },

  // System — desaturated slate-leaning blues, quieter than the rest.
  "/settings": { hue: 215, pattern: "dots" },
  "/logs": { hue: 225, pattern: "diagonal" },
  "/roles": { hue: 205, pattern: "grid" },
};

/** Fallback for any route not listed above (e.g. a new page). */
const DEFAULT_THEME: ModuleTheme = { hue: 221, pattern: "grid" };

/**
 * Resolve the backdrop for a pathname by longest matching prefix. Sorting by
 * key length is what keeps `/payroll/report` from matching `/payroll`; the "/"
 * root entry only wins when nothing else does, since it is the shortest key.
 */
export function moduleThemeFor(pathname: string): ModuleTheme {
  if (pathname === "/") return MODULE_THEMES["/"];

  const match = Object.keys(MODULE_THEMES)
    .filter((route) => route !== "/")
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname === route || pathname.startsWith(`${route}/`));

  return match ? MODULE_THEMES[match] : DEFAULT_THEME;
}
