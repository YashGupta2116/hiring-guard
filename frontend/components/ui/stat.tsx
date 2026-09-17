import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral" | "warning";
  className?: string;
}

export function Stat({
  label,
  value,
  change,
  trend = "neutral",
  className,
}: StatProps) {
  const trendClasses = {
    up: "text-emerald-600 dark:text-emerald-400",
    down: "text-rose-600 dark:text-rose-400",
    warning: "text-amber-600 dark:text-amber-400",
    neutral: "text-muted-foreground",
  }[trend];

  return (
    <div className={cn("p-4 transition-colors", className)}>
      <span className="text-xs font-medium text-muted-foreground block truncate">
        {label}
      </span>
      <div className="text-2xl font-semibold tracking-tight text-foreground mt-1">
        {value}
      </div>
      {change && (
        <span className={cn("text-[11px] block mt-0.5 font-medium truncate", trendClasses)}>
          {change}
        </span>
      )}
    </div>
  );
}

export function StatGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 rounded-lg border border-border bg-card divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
