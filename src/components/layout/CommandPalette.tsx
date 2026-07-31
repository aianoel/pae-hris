import * as React from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Moon,
  Search,
  Sun,
  Plus,
  FileBarChart,
  UserPlus,
} from "lucide-react";

import { navItems } from "@/config/nav";
import { canAccess } from "@/lib/access";
import { useAuth } from "@/store/auth-context";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, isEmployeeSession } = useAuth();

  // Mirror the sidebar: the palette is a second way to reach every module, so
  // it has to respect the same access list. An employee signed in via Google
  // would otherwise find "Payroll" here and land on the "access restricted"
  // card — offering a door that is known to be locked.
  const reachable = React.useMemo(
    () =>
      navItems.filter(
        (i) => canAccess(user?.access, i.to) && !(isEmployeeSession && i.to === "/"),
      ),
    [user?.access, isEmployeeSession],
  );
  const quickActions = React.useMemo(
    () =>
      [
        { to: "/employees", icon: UserPlus, label: "Add employee" },
        { to: "/reports", icon: FileBarChart, label: "Create report" },
        { to: "/payroll", icon: Plus, label: "Generate payroll" },
      ].filter((a) => canAccess(user?.access, a.to)),
    [user?.access],
  );

  const run = React.useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      // let the dialog close before navigating for a smoother transition
      requestAnimationFrame(fn);
    },
    [onOpenChange],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />
      <Command
        loop
        className={cn(
          "relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover",
          "animate-fade-up",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-[18px] w-[18px] text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Search or jump to…"
            className="h-14 flex-1 bg-transparent text-[0.95rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[22rem] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group
            heading="Quick actions"
            className="px-2 pb-1 pt-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-items]]:mt-1"
          >
            {quickActions.map(({ to, icon: Icon, label }) => (
              <PaletteItem
                key={to}
                icon={<Icon className="h-4 w-4" />}
                label={label}
                onSelect={() => run(() => navigate(to))}
              />
            ))}
            <PaletteItem
              icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onSelect={() => run(toggleTheme)}
            />
          </Command.Group>

          <Command.Group
            heading="Navigation"
            className="px-2 pb-1 pt-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-items]]:mt-1"
          >
            {reachable.map((item) => (
              <PaletteItem
                key={item.to}
                icon={<item.icon className="h-4 w-4" />}
                label={item.label}
                onSelect={() => run(() => navigate(item.to))}
              />
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function PaletteItem({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-foreground outline-none",
        "data-[selected=true]:bg-secondary [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-primary",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
