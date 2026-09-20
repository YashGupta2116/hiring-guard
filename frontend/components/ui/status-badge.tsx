import * as React from "react";
import { Check, AlertTriangle, AlertCircle, Info, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusType =
  | "Clean"
  | "Advisory"
  | "High severity"
  | "System note"
  | "Unscored"
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
      : "px-2.5 py-1 text-xs font-medium";

  const getVariant = (s: string) => {
    switch (s) {
      case "Clean":
        return {
          classes: "bg-sage-100/60 dark:bg-sage-950/40 text-sage-800 dark:text-sage-300 border border-sage-500/30",
          icon: <Check className="h-3 w-3 text-sage-600 dark:text-sage-400" />,
        };
      case "Advisory":
        return {
          classes: "bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-500/30",
          icon: <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />,
        };
      case "High severity":
        return {
          classes: "bg-terra-100/60 dark:bg-terra-950/40 text-terra-800 dark:text-terra-300 border border-terra-500/30 font-semibold",
          icon: <AlertCircle className="h-3 w-3 text-terra-600 dark:text-terra-400" />,
        };
      case "System note":
        return {
          classes: "bg-slate-100/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-300 border border-slate-500/30",
          icon: <Info className="h-3 w-3 text-slate-600 dark:text-slate-400" />,
        };
      case "Unscored":
        return {
          classes: "bg-hatch-sand text-muted-foreground border border-border",
          icon: <HelpCircle className="h-3 w-3 text-muted-foreground" />,
        };
      case "Live":
        return {
          classes: "bg-sage-100/60 dark:bg-sage-950/40 text-sage-800 dark:text-sage-300 border border-sage-500/30 font-semibold",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />,
        };
      case "Completed":
      case "Hired":
      case "High Confidence":
      case "Strong Hire":
      case "Approved":
      case "Easy":
        return {
          classes: "bg-sage-50/80 dark:bg-sage-950/40 text-sage-700 dark:text-sage-300 border border-sage-200/70 dark:border-sage-800/40",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />,
        };
      case "Interviewing":
        return {
          classes: "bg-slate-50/80 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 border border-slate-200/70 dark:border-slate-800/40",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />,
        };
      case "Scheduled":
      case "Hire":
      case "Ready":
        return {
          classes: "bg-sand-200/60 dark:bg-sand-800/60 text-foreground border border-border",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-sand-500" />,
        };
      case "Under Review":
      case "Pending Review":
      case "Moderate Variance":
      case "Leaning Hire":
      case "Medium":
        return {
          classes: "bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/40",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />,
        };
      case "Review Recommended":
      case "Needs Further Review":
      case "Cancelled":
      case "Rejected":
      case "No Hire":
      case "Hard":
        return {
          classes: "bg-terra-50/80 dark:bg-terra-950/40 text-terra-700 dark:text-terra-300 border border-terra-200/70 dark:border-terra-800/40",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-terra-500" />,
        };
      case "Draft":
      case "Shortlisted":
      default:
        return {
          classes: "bg-sand-100/90 dark:bg-sand-800/90 text-sand-700 dark:text-sand-300 border border-sand-200/80 dark:border-sand-700/80",
          icon: <span className="h-1.5 w-1.5 rounded-full bg-sand-400 dark:bg-sand-500" />,
        };
    }
  };

  const { classes, icon } = getVariant(status);

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
      {icon}
      <span>{status}</span>
    </div>
  );
}
