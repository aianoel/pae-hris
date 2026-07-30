import { useNavigate } from "react-router-dom";
import {
  Search,
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  CreditCard,
  LifeBuoy,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Kbd } from "@/components/ui/kbd";
import { useAuth } from "@/store/auth-context";

interface TopbarProps {
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenSearch, onOpenMobileNav }: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const name = user?.name ?? "Maya Kapoor";
  const email = user?.email ?? "maya@aurora.app";
  const initials = user?.initials ?? "MK";
  const role = user?.role ?? "Administrator";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* Mobile nav toggle */}
        <button
          onClick={onOpenMobileNav}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <div className="hidden md:block">
          <Breadcrumbs />
        </div>

        {/* Global search */}
        <button
          onClick={onOpenSearch}
          className="group ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary sm:ml-4 sm:w-full sm:max-w-xs sm:justify-between sm:px-3 md:ml-auto"
          aria-label="Search"
        >
          <span className="flex items-center gap-2.5">
            <Search className="h-[18px] w-[18px]" />
            <span className="hidden text-sm sm:inline">Search anything…</span>
          </span>
          <span className="hidden items-center gap-0.5 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[0.7rem]">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden text-left leading-tight lg:block">
                  <p className="text-xs font-semibold text-foreground">{name}</p>
                  <p className="text-[0.7rem] text-muted-foreground">{role}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <div className="flex items-center gap-3 p-2">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <User /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/payroll")}>
                <CreditCard /> Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <LifeBuoy /> Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal">
                Signed in as {role}
              </DropdownMenuLabel>
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
