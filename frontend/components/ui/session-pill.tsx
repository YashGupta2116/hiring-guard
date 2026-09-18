"use client";

import React from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export type SessionStatusType =
  | "DRAFT"
  | "CONFIGURED"
  | "ARMED"
  | "ADMITTED"
  | "LIVE"
  | "PAUSED"
  | "SEALING"
  | "PROCESSING"
  | "COMPLETE"
  | "ABORTED"
  | "EXPIRED"
  | "Draft"
  | "Armed"
  | "Live"
  | "Paused"
  | "Sealing"
  | "Processing"
  | "Complete"
  | "Aborted"
  | "Expired"
  | "Scheduled"
  | "Completed"
  | "Cancelled";

export interface SessionPillProps {
  status: SessionStatusType | string;
  size?: "sm" | "md";
  className?: string;
}

export function SessionPill({
  status,
  size = "md",
  className,
}: SessionPillProps) {
  const norm = status.toUpperCase();

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-1 text-xs";

  let label = status;
  let dot: React.ReactNode = null;
  let customStyle = "border-border bg-card text-foreground";

  switch (norm) {
    case "DRAFT":
      label = "Draft";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-sand-400 dark:bg-sand-500" />;
      customStyle = "border-border bg-secondary/50 text-muted-foreground";
      break;

    case "ARMED":
      label = "Armed";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-clay-500" />;
      customStyle = "border-border bg-card text-foreground";
      break;

    case "SCHEDULED":
      label = "Scheduled";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />;
      customStyle = "border-amber-500/30 bg-amber-100/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-semibold";
      break;

    case "LIVE":
      label = "Live";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />;
      customStyle = "border-sage-500/30 bg-sage-50/50 dark:bg-sage-950/30 text-sage-800 dark:text-sage-200 font-semibold";
      break;

    case "PAUSED":
      label = "Paused";
      dot = <Pause className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />;
      customStyle = "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200";
      break;

    case "SEALING":
      label = "Sealing";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-sand-500 animate-spin" />;
      customStyle = "border-border bg-card text-foreground";
      break;

    case "PROCESSING":
      label = "Processing";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-clay-400 animate-pulse" />;
      customStyle = "border-border bg-secondary/60 text-foreground";
      break;

    case "COMPLETE":
    case "COMPLETED":
      label = norm === "COMPLETED" ? "Completed" : "Complete";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />;
      customStyle = "border-border bg-card text-foreground";
      break;

    case "ABORTED":
    case "CANCELLED":
      label = "Aborted";
      dot = <span className="h-1.5 w-1.5 rounded-full bg-terra-500" />;
      customStyle = "border-terra-500/30 bg-terra-50/40 dark:bg-terra-950/20 text-terra-800 dark:text-terra-300";
      break;

    case "EXPIRED":
      label = "Expired";
      dot = null;
      customStyle = "border-border bg-hatch-sand text-muted-foreground";
      break;

    default:
      label = status;
      dot = <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />;
      customStyle = "border-border bg-card text-foreground";
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors select-none",
        sizeClasses,
        customStyle,
        className
      )}
    >
      {dot}
      <span>{label}</span>
    </span>
  );
}