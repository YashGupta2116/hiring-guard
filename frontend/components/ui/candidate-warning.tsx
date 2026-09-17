"use client";

import React, { useState } from "react";
import { Info, AlertTriangle, PauseCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WarningTier = "NOTICE" | "WARNING" | "INTERRUPT";

export interface CandidateWarningProps {
  tier?: WarningTier;
  message: string;
  subMessage?: string;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  className?: string;
}

export function CandidateWarning({
  tier = "NOTICE",
  message,
  subMessage,
  acknowledged: initialAcknowledged = false,
  onAcknowledge,
  className,
}: CandidateWarningProps) {
  const [acknowledged, setAcknowledged] = useState(initialAcknowledged);

  const handleAck = () => {
    setAcknowledged(true);
    onAcknowledge?.();
  };

  if (tier === "INTERRUPT") {
    // Top Paused Banner (PDF Page 4)
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4 text-xs shadow-sm transition-colors",
          "border-sand-300 dark:border-sand-700",
          className
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <PauseCircle className="h-4 w-4 text-terra-600 dark:text-terra-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-foreground text-xs">
                {message || "Interview paused"}
              </h4>
              <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                {subMessage || "A second person appears to be present. Please continue alone to resume."}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {acknowledged ? (
              <span className="inline-flex items-center gap-1 font-medium text-sage-700 dark:text-sage-400 text-xs px-2.5 py-1">
                <Check className="h-3.5 w-3.5" /> Acknowledged
              </span>
            ) : (
              <button
                onClick={handleAck}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors shadow-xs"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Acknowledge</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tier === "WARNING") {
    // Amber warning banner (PDF Page 3)
    return (
      <div
        className={cn(
          "rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground block">
              {message}
            </span>
            {subMessage && (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {subMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // NOTICE: Subtle Info banner (PDF Page 3)
  return (
    <div
      className={cn(
        "rounded-md border border-sand-200 dark:border-sand-800 bg-sand-50 dark:bg-sand-900/40 p-3 text-xs",
        className
      )}
    >
      <div className="flex items-center gap-2 text-foreground">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-xs text-foreground">
          {message}
        </span>
      </div>
    </div>
  );
}
