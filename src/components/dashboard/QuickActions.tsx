import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  UserPlus,
  Wallet,
  CalendarCheck,
  FileBarChart,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  tint: string;
  to?: string;
  run?: () => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function QuickActions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { runPayroll, addLog } = useStore();

  const actions: QuickAction[] = [
    { label: "Add Employee", icon: UserPlus, tint: "text-primary bg-primary/10", to: "/employees" },
    {
      label: "Generate Payroll",
      icon: Wallet,
      tint: "text-chart-5 bg-chart-5/10",
      run: () => {
        const period = `${MONTHS[new Date().getMonth()]} 2026`;
        runPayroll(period);
        toast({ variant: "success", title: "Payroll run started", description: `Processing ${period}…` });
      },
    },
    {
      label: "Approve Leave",
      icon: CalendarCheck,
      tint: "text-chart-3 bg-chart-3/10",
      run: () => {
        addLog("attendance", "approved a pending leave request");
        toast({ variant: "success", title: "Leave approved", description: "The request was approved." });
      },
    },
    { label: "Create Report", icon: FileBarChart, tint: "text-chart-4 bg-chart-4/10", to: "/reports" },
    {
      label: "Send Announcement",
      icon: Megaphone,
      tint: "text-amber-500 bg-amber-500/10",
      run: () => {
        addLog("system", "sent a company-wide announcement");
        toast({ variant: "success", title: "Announcement sent", description: "Everyone was notified." });
      },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {actions.map((action, i) => (
        <motion.button
          key={action.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (action.to) navigate(action.to);
            else action.run?.();
          }}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
              action.tint,
            )}
          >
            <action.icon className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium leading-tight text-foreground">
            {action.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
