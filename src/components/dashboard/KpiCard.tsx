import { motion } from "framer-motion";
import {
  Users,
  Activity,
  CalendarCheck,
  Wallet,
  Inbox,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Card } from "@/components/ui/card";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/data";

const iconMap: Record<string, LucideIcon> = {
  Users,
  Activity,
  CalendarCheck,
  Wallet,
  Inbox,
  TrendingUp,
};

function formatValue(kpi: Kpi, animated: number) {
  const isFloat = !Number.isInteger(kpi.value);
  const num = isFloat
    ? animated.toFixed(2)
    : Math.round(animated).toLocaleString("en-US");
  return `${kpi.prefix ?? ""}${num}${kpi.suffix ?? ""}`;
}

export function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = iconMap[kpi.icon] ?? Activity;
  const animated = useCountUp(kpi.value, 1200 + index * 120);
  const positive = kpi.trend === "up";
  // For "Pending Requests", a downward trend is actually good — keep color neutral-positive.
  const goodTrend = kpi.id === "requests" ? kpi.trend === "down" : positive;
  const sparkData = kpi.spark.map((v, i) => ({ i, v }));
  const gradientId = `spark-${kpi.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card interactive className="group overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl bg-secondary transition-colors group-hover:bg-primary/10",
                kpi.accent,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
          </div>
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
              goodTrend ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {kpi.deltaPct}%
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">
              {formatValue(kpi, animated)}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              {goodTrend ? (
                <TrendingUp className="h-3 w-3 text-success" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              vs. last month
            </p>
          </div>
          <div className="h-11 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={goodTrend ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={goodTrend ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={goodTrend ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
