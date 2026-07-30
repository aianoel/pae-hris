import {
  LayoutDashboard,
  BarChart3,
  Users,
  IdCard,
  Building2,
  CalendarCheck,
  CalendarDays,
  Wallet,
  PenLine,
  Receipt,
  Landmark,
  FileBarChart,
  FolderOpen,
  Settings,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
  group: "Overview" | "People" | "Operations" | "System";
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, group: "Overview" },
  { label: "Analytics", to: "/analytics", icon: BarChart3, group: "Overview" },

  { label: "Users", to: "/users", icon: Users, group: "People" },
  { label: "Employees", to: "/employees", icon: IdCard, badge: "48", group: "People" },
  { label: "Departments", to: "/departments", icon: Building2, group: "People" },

  { label: "Attendance", to: "/attendance", icon: CalendarCheck, group: "Operations" },
  { label: "Leave", to: "/leave", icon: CalendarDays, group: "Operations" },
  { label: "Payroll", to: "/payroll", icon: Wallet, group: "Operations" },
  { label: "Payroll Data Entry", to: "/payroll/data-entry", icon: PenLine, group: "Operations" },
  { label: "Payroll Report", to: "/payroll/report", icon: Receipt, group: "Operations" },
  { label: "Contributions", to: "/contributions", icon: Landmark, group: "Operations" },
  { label: "Reports", to: "/reports", icon: FileBarChart, group: "Operations" },
  { label: "Documents", to: "/documents", icon: FolderOpen, group: "Operations" },

  { label: "Settings", to: "/settings", icon: Settings, group: "System" },
  { label: "System Logs", to: "/logs", icon: ScrollText, group: "System" },
  { label: "Roles & Permissions", to: "/roles", icon: ShieldCheck, group: "System" },
];

export const navGroups = ["Overview", "People", "Operations", "System"] as const;
