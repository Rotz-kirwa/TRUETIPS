import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Gradient = "primary" | "blue" | "coral" | "green" | "orange" | "purple";

interface Props {
  label: string;
  value: string;
  sub?: string;
  change?: number;
  icon: LucideIcon;
  gradient?: Gradient;
  accent?: "primary" | "success" | "warning" | "muted";
}

const GRADIENTS: Record<Gradient, string> = {
  primary: "var(--gradient-primary)",
  blue: "var(--gradient-blue)",
  coral: "var(--gradient-coral)",
  green: "var(--gradient-green)",
  orange: "var(--gradient-orange)",
  purple: "linear-gradient(135deg, #6366f1, #8b5cf6)",
};

export function StatCard({ label, value, sub, change, icon: Icon, gradient, accent = "primary" }: Props) {
  const up = (change ?? 0) >= 0;

  if (gradient) {
    return (
      <div
        className="group relative overflow-hidden rounded-2xl p-6 text-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
        style={{ background: GRADIENTS[gradient] }}
      >
        {/* Decorative circle */}
        <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-white/10" />

        <div className="relative flex items-start justify-between">
          <p className="text-sm font-medium text-white/80">{label}</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-inner">
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        <p className="relative mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
        {sub && <p className="relative mt-1 text-xs text-white/70">{sub}</p>}
        {change !== undefined && (
          <div className="relative mt-3 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-medium text-white">
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span className="text-xs text-white/60">vs yesterday</span>
          </div>
        )}
      </div>
    );
  }

  const accentClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    muted: "bg-secondary text-muted-foreground",
  }[accent];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
      {change !== undefined && (
        <div className="mt-4 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
              up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">vs previous</span>
        </div>
      )}
    </div>
  );
}
