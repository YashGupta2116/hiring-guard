import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusType =
  | "Scheduled"
  | "Live"
  | "Completed"
  | "Draft"
  | "Cancelled"
  | "Shortlisted"
  | "Interviewing"
  | "Under Review"
  | "Hired"
  | "Rejected"
  | "High Confidence"
  | "Moderate Variance"
  | "Review Recommended"
  | "Ready"
  | "Pending Review"
  | "Approved"
  | "Strong Hire"
  | "Hire"
  | "Leaning Hire"
  | "Needs Further Review"
  | "No Hire"
  | "Easy"
  | "Medium"
  | "Hard"
  | string;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  size = "sm",
  className,
  ...props
}: StatusBadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] font-medium"
      : "px-2.5 py-0.5 text-xs font-medium";

  const getVariant = (s: string) => {
    switch (s) {
      case "Live":
        return {
          classes: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold",
          dot: "bg-rose-500 animate-pulse",
        };
      case "Completed":
      case "Hired":
      case "High Confidence":
      case "Strong Hire":
      case "Approved":
      case "Easy":
        return {
          classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20",
          dot: "bg-emerald-500",
        };
      case "Scheduled":
      case "Hire":
      case "Interviewing":
      case "Ready":
        return {
          classes: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border border-zinc-500/20",
          dot: "bg-zinc-400",
        };
      case "Under Review":
      case "Pending Review":
      case "Moderate Variance":
      case "Leaning Hire":
      case "Medium":
        return {
          classes: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
          dot: "bg-amber-500",
        };
      case "Review Recommended":
      case "Needs Further Review":
      case "Cancelled":
      case "Rejected":
      case "No Hire":
      case "Hard":
        return {
          classes: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20",
          dot: "bg-rose-500",
        };
      case "Draft":
      case "Shortlisted":
      default:
        return {
          classes: "bg-secondary text-muted-foreground border border-border/70",
          dot: "bg-muted-foreground/60",
        };
    }
  };

  const { classes, dot } = getVariant(status);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md transition-colors select-none",
        sizeClasses,
        classes,
        className
      )}
      {...props}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
      <span>{status}</span>
    </div>
  );
}
