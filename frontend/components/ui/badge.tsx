import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "destructive"
    | "success"
    | "warning"
    | "info"
    | "brand"
    | "live";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "default",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] font-medium"
      : "px-2.5 py-0.5 text-xs font-medium";

  const variantClasses = {
    default: "bg-secondary text-secondary-foreground border border-border/70",
    secondary: "bg-secondary/60 text-muted-foreground border border-border/50",
    outline: "text-foreground border border-border bg-transparent",
    brand: "bg-secondary text-foreground border border-border font-medium",
    destructive:
      "bg-terra-50 dark:bg-terra-950/40 text-terra-700 dark:text-terra-300 border border-terra-200 dark:border-terra-800",
    success:
      "bg-sage-50 dark:bg-sage-950/40 text-sage-700 dark:text-sage-300 border border-sage-200 dark:border-sage-800",
    warning:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    info: "bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800",
    live: "bg-sand-900 text-sand-100 dark:bg-sand-800 dark:text-sand-100 border border-sand-700 font-medium",
  }[variant];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md transition-colors select-none",
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    >
      {variant === "live" && (
        <span className="h-1.5 w-1.5 rounded-full bg-terra-500 inline-block animate-pulse" />
      )}
      {children}
    </div>
  );
}
