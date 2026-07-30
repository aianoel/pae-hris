import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

import { navItems } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Resolve a crumb label from the full path up to this segment (e.g.
 * "/payroll/data-entry" → "Payroll Data Entry"), falling back to the segment
 * alone and finally a title-cased version. Matching on the cumulative path —
 * not just the last segment — is what lets nested routes show their own nav
 * label instead of a bare "Data-entry".
 */
function labelFor(path: string, segment: string) {
  const match = navItems.find((i) => i.to === path) ?? navItems.find((i) => i.to === `/${segment}`);
  if (match) return match.label;
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">Home</span>
      </Link>
      {segments.map((segment, i) => {
        const to = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={to} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <Link
              to={to}
              className={cn(
                "transition-colors",
                isLast
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isLast ? "page" : undefined}
            >
              {labelFor(to, segment)}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
