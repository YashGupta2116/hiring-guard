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
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
    success:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    warning:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    info: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20",
    live: "bg-zinc-800 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-700/80 font-medium",
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
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block animate-pulse" />
      )}
      {children}
    </div>
  );
}
