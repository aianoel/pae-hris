import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { navGroups, navItems } from "@/config/nav";
import { canAccess } from "@/lib/access";
import { useAuth } from "@/store/auth-context";
import { Logo } from "@/components/brand/Logo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * An item needs exact ("end") matching when another nav item is nested beneath
 * it — otherwise the parent (e.g. "Payroll") lights up on child routes like
 * "/payroll/data-entry", double-activating the menu and hijacking the active
 * indicator. Leaf items keep prefix matching so future detail pages still
 * highlight their parent.
 */
function needsExactMatch(to: string) {
  return to === "/" || navItems.some((o) => o.to !== to && o.to.startsWith(`${to}/`));
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, isEmployeeSession } = useAuth();
  // Only show modules this user may open (admins see everything). Dashboard is
  // dropped for employee sessions: HomeRoute redirects "/" straight to "/my"
  // for them, so the link would be a second button for the item below it.
  const visibleItems = navItems.filter(
    (i) => canAccess(user?.access, i.to) && !(isEmployeeSession && i.to === "/"),
  );
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-smooth",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        {/* Brand + collapse */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-border px-4",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {collapsed ? (
            <Logo withWordmark={false} />
          ) : (
            <Logo />
          )}
          {!collapsed && (
            <button
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const items = visibleItems.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-5 last:mb-0">
                {!collapsed && (
                  <p className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const link = (
                      <NavLink
                        to={item.to}
                        end={needsExactMatch(item.to)}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors",
                            "focus-visible:ring-2 focus-visible:ring-ring",
                            collapsed && "justify-center px-0",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId="sidebar-active"
                                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                              />
                            )}
                            <item.icon className="h-[18px] w-[18px] shrink-0" />
                            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                            {!collapsed && item.badge && (
                              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground group-hover:bg-card">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );

                    return (
                      <li key={item.to}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Collapse footer — only needed to re-expand when collapsed. */}
        {collapsed && (
          <div className="shrink-0 border-t border-border p-3">
            <button
              onClick={onToggle}
              className="flex h-10 w-full items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="h-[18px] w-[18px]" />
            </button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
