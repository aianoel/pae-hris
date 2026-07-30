import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Check,
  UserPlus,
  Wallet,
  CalendarClock,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/store/store-context";
import { cn } from "@/lib/utils";

// Map the persisted icon-name keys to actual lucide components.
const icons: Record<string, LucideIcon> = {
  UserPlus,
  Wallet,
  CalendarClock,
  ShieldAlert,
};

export function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useStore();
  const unread = notifications.filter((i) => i.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold text-white ring-2 ring-background"
              >
                {unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <Check className="h-3 w-3" /> Mark all read
          </button>
        </div>
        <div className="max-h-[22rem] overflow-y-auto py-1">
          {notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
          )}
          {notifications.map((n) => {
            const Icon = icons[n.icon] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => markNotificationRead(n.id)}
                className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", n.tint)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[0.7rem] text-muted-foreground">{n.time}</span>
                  {n.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <button
            onClick={() => navigate("/logs")}
            className="w-full rounded-lg py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
