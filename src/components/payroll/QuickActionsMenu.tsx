import {
  Play,
  Wand2,
  FileUp,
  FileDown,
  FileText,
  Printer,
  Mail,
  Eye,
  CheckCheck,
  MoreHorizontal,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tint?: string;
}

/** Build the standard payroll action set, wired to the page's handlers. */
export function buildQuickActions(handlers: Record<string, () => void>): QuickAction[] {
  return [
    { key: "generate", label: "Generate Payroll", icon: Play, onClick: handlers.generate, tint: "text-primary" },
    { key: "autofill", label: "Auto-fill from HR", icon: Wand2, onClick: handlers.autofill, tint: "text-primary" },
    { key: "import", label: "Import Excel", icon: FileUp, onClick: handlers.import },
    { key: "export", label: "Export Excel", icon: FileDown, onClick: handlers.export },
    { key: "pdf", label: "Export PDF", icon: FileText, onClick: handlers.pdf },
    { key: "print", label: "Print Payroll", icon: Printer, onClick: handlers.print },
    { key: "email", label: "Email Payslips", icon: Mail, onClick: handlers.email },
    { key: "preview", label: "Preview Payroll", icon: Eye, onClick: handlers.preview },
    { key: "approve", label: "Approve Payroll", icon: CheckCheck, onClick: handlers.approve, tint: "text-success" },
  ];
}

/** Header dropdown holding the full payroll action set. */
export function QuickActionsMenu({ actions }: { actions: QuickAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <MoreHorizontal className="h-4 w-4" /> Actions
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a) => (
          <DropdownMenuItem key={a.key} onSelect={() => a.onClick()}>
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-secondary", a.tint)}>
              <a.icon className="h-4 w-4" />
            </span>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
