import { motion } from "framer-motion";
import {
  LogIn,
  UserPlus,
  Wallet,
  CalendarCheck,
  CheckCircle2,
  Bell,
  type LucideIcon,
} from "lucide-react";

import { activities, type Activity } from "@/lib/data";
import { cn } from "@/lib/utils";

const typeConfig: Record<Activity["type"], { icon: LucideIcon; tint: string }> = {
  login: { icon: LogIn, tint: "bg-primary/10 text-primary" },
  employee: { icon: UserPlus, tint: "bg-chart-2/10 text-chart-2" },
  payroll: { icon: Wallet, tint: "bg-chart-5/10 text-chart-5" },
  attendance: { icon: CalendarCheck, tint: "bg-chart-3/10 text-chart-3" },
  leave: { icon: CheckCircle2, tint: "bg-success/10 text-success" },
  system: { icon: Bell, tint: "bg-muted text-muted-foreground" },
};

export function ActivityTimeline() {
  return (
    <ol className="relative space-y-1">
      {/* connecting line */}
      <span className="absolute bottom-2 left-[15px] top-2 w-px bg-border" aria-hidden="true" />
      {activities.map((a, i) => {
        const { icon: Icon, tint } = typeConfig[a.type];
        return (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="relative flex gap-3 rounded-xl p-2 transition-colors hover:bg-secondary"
          >
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                tint,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm text-foreground">
                <span className="font-medium">{a.actor}</span>{" "}
                <span className="text-muted-foreground">{a.message}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.time}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
