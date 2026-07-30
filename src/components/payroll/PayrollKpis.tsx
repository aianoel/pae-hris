import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import {
  Users,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useCountUp } from "./useCountUp";

export interface Kpi {
  id: string;
  label: string;
  value: number;
  currency?: boolean;
  deltaPct: number;
  trend: "up" | "down";
  icon: LucideIcon;
  gradient: string; // tailwind gradient classes for the icon tile
  stroke: string; // chart stroke color
  spark: number[];
}

/** Deterministic spark series from a base figure so cards feel alive. */
function spark(base: number, seed: number) {
  return Array.from({ length: 10 }, (_, i) => ({
    v: Math.round(base * (0.82 + ((Math.sin(seed + i) + 1) / 2) * 0.3)),
  }));
}

export function buildKpis(totals: {
  employees: number;
  earnings: number;
  deductions: number;
  net: number;
}): Kpi[] {
  return [
    { id: "employees", label: "Total Employees", value: totals.employees, deltaPct: 3.2, trend: "up", icon: Users, gradient: "from-blue-500 to-indigo-600", stroke: "hsl(var(--chart-1))", spark: spark(totals.employees, 1).map((d) => d.v) },
    { id: "earnings", label: "Total Earnings", value: totals.earnings, currency: true, deltaPct: 4.6, trend: "up", icon: TrendingUp, gradient: "from-emerald-500 to-teal-600", stroke: "hsl(var(--success))", spark: spark(totals.earnings, 3).map((d) => d.v) },
    { id: "deductions", label: "Total Deductions", value: totals.deductions, currency: true, deltaPct: 1.4, trend: "down", icon: ArrowDownCircle, gradient: "from-rose-500 to-red-600", stroke: "hsl(var(--destructive))", spark: spark(totals.deductions, 4).map((d) => d.v) },
    { id: "net", label: "Net Payroll", value: totals.net, currency: true, deltaPct: 2.8, trend: "up", icon: PiggyBank, gradient: "from-sky-500 to-blue-600", stroke: "hsl(var(--chart-3))", spark: spark(totals.net, 5).map((d) => d.v) },
  ];
}

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const animated = useCountUp(kpi.value);
  const TrendIcon = kpi.trend === "up" ? TrendingUp : TrendingDown;
  const data = kpi.spark.map((v) => ({ v }));
  const gradId = `spark-${kpi.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card interactive className="relative overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-soft",
              kpi.gradient,
            )}
          >
            <kpi.icon className="h-5 w-5" />
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              kpi.trend === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {kpi.deltaPct}%
          </span>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{kpi.label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {kpi.currency ? formatCurrency(animated) : animated.toLocaleString("en-US")}
        </p>

        <div className="pointer-events-none mt-3 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={kpi.stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={kpi.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={kpi.stroke}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

export function PayrollKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <KpiCard key={kpi.id} kpi={kpi} index={i} />
      ))}
    </div>
  );
}
