/**
 * Minimal module-resolution hook so verification scripts can import the app's
 * TypeScript sources directly.
 *
 * Node 24 strips types natively, but it knows nothing about the `@/*` → `src/*`
 * alias configured in tsconfig/vite. This maps that one prefix and defers
 * everything else to the default resolver, so a script can exercise the real
 * payroll modules rather than a re-implementation of them.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), "src");

/**
 * TypeScript imports are extensionless (`@/lib/payroll`), but Node's ESM
 * resolver requires a real filename — so try each source extension in turn.
 */
function withExtension(base) {
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of [".ts", ".tsx"]) {
    const index = join(base, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return base;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const resolved = withExtension(join(SRC, specifier.slice(2)));
    return next(pathToFileURL(resolved).href, context);
  }
  return next(specifier, context);
}
