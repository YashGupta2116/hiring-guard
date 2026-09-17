"use client";

import React from "react";
import { Check, ArrowUpRight, X, Eye, Mic, Video, Keyboard, Target, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlagSeverity = "LOW" | "MEDIUM" | "HIGH";
export type FlagStatus = "OPEN" | "CONFIRMED" | "DISMISSED" | "DOWNGRADED" | "SUPERSEDED";

export interface FlagCardProps {
  id: string;
  severity: FlagSeverity;
  timestamp: string; // e.g. "00:14:32"
  status?: FlagStatus;
  narrative: string;
  channels?: string[]; // e.g. ["GAZE", "AUDIO"]
  scoreDelta: number; // e.g. -8
  onAdjudicate?: (action: "CONFIRM" | "DOWNGRADE" | "DISMISS") => void;
  className?: string;
  readOnly?: boolean;
}

export function FlagCard({
  id,
  severity,
  timestamp,
  status = "OPEN",
  narrative,
  channels = ["GAZE", "AUDIO"],
  scoreDelta,
  onAdjudicate,
  className,
  readOnly = false,
}: FlagCardProps) {
  // Severity dot indicator matching the PDF Severity Ladder:
  // Low = hollow circle ○
  // Medium = circle with inner dot ⊙
  // High = solid target dot ● (double ring filled)
  const renderSeverityDot = () => {
    switch (severity) {
      case "HIGH":
        return (
          <span
            className="relative flex h-3 w-3 items-center justify-center rounded-full border border-terra-600 dark:border-terra-400"
            title="High Severity (Solid Dot)"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-terra-600 dark:bg-terra-400" />
          </span>
        );
      case "MEDIUM":
        return (
          <span
            className="relative flex h-3 w-3 items-center justify-center rounded-full border border-amber-600 dark:border-amber-400"
            title="Medium Severity (Center Dot)"
          >
            <span className="h-1 w-1 rounded-full bg-amber-600 dark:bg-amber-400" />
          </span>
        );
      case "LOW":
      default:
        return (
          <span
            className="h-3 w-3 rounded-full border-2 border-sand-500 dark:border-sand-400 bg-transparent inline-block"
            title="Low Severity (Hollow Circle)"
          />
        );
    }
  };

  const getSeverityLabel = () => {
    switch (severity) {
      case "HIGH":
        return "High";
      case "MEDIUM":
        return "Medium";
      case "LOW":
      default:
        return "Low";
    }
  };

  const renderChannelIcon = (channel: string) => {
    const ch = channel.toUpperCase();
    if (ch.includes("GAZE") || ch.includes("FACE")) return <Eye className="h-3.5 w-3.5" key={channel} />;
    if (ch.includes("AUDIO") || ch.includes("VOICE")) return <Mic className="h-3.5 w-3.5" key={channel} />;
    if (ch.includes("SCENE") || ch.includes("SCREEN")) return <Video className="h-3.5 w-3.5" key={channel} />;
    if (ch.includes("INPUT") || ch.includes("PASTE")) return <Keyboard className="h-3.5 w-3.5" key={channel} />;
    if (ch.includes("FOCUS")) return <Target className="h-3.5 w-3.5" key={channel} />;
    return <Wifi className="h-3.5 w-3.5" key={channel} />;
  };

  const isDismissed = status === "DISMISSED";

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3 text-xs transition-opacity duration-200 space-y-2",
        isDismissed && "opacity-40 hover:opacity-75",
        className
      )}
    >
      {/* Top Header: Dot + Severity + Timestamp + Status Badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {renderSeverityDot()}
          <span className="font-semibold text-foreground text-xs">
            {getSeverityLabel()}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
            {timestamp}
          </span>
        </div>

        {/* Adjudication Status Badge */}
        {status !== "OPEN" && (
          <div>
            {status === "CONFIRMED" && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-sand-200 dark:bg-sand-800 text-foreground border border-border">
                Confirmed
              </span>
            )}
            {status === "DISMISSED" && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground line-through">
                Dismissed
              </span>
            )}
            {status === "DOWNGRADED" && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                Downgraded
              </span>
            )}
            {status === "SUPERSEDED" && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
                superseded by review
              </span>
            )}
          </div>
        )}
      </div>

      {/* Narrative Body */}
      <p className="text-foreground text-xs leading-relaxed">
        {narrative}
      </p>

      {/* Bottom Footer: Channels + Score Delta + Action Buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-muted-foreground">
        <div className="flex items-center gap-2.5">
          {/* Corroborating Channels */}
          <div className="flex items-center gap-1">
            {channels.map((ch) => renderChannelIcon(ch))}
          </div>

          {/* Points Impact */}
          <span className="font-mono font-medium text-foreground text-[11px]">
            {scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`} pts
          </span>
        </div>

        {/* Adjudication Action Buttons: [✓] [↗] [✕] */}
        {!readOnly && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdjudicate?.("CONFIRM")}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded border border-border bg-secondary/40 text-foreground hover:bg-secondary transition-colors",
                status === "CONFIRMED" && "bg-sage-100 dark:bg-sage-900 border-sage-500 text-sage-800 dark:text-sage-200"
              )}
              title="Confirm Flag"
            >
              <Check className="h-3 w-3" />
            </button>

            <button
              onClick={() => onAdjudicate?.("DOWNGRADE")}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded border border-border bg-secondary/40 text-foreground hover:bg-secondary transition-colors",
                status === "DOWNGRADED" && "bg-amber-100 dark:bg-amber-900 border-amber-500 text-amber-800 dark:text-amber-200"
              )}
              title="Downgrade Flag"
            >
              <ArrowUpRight className="h-3 w-3" />
            </button>

            <button
              onClick={() => onAdjudicate?.("DISMISS")}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded border border-border bg-secondary/40 text-foreground hover:bg-secondary transition-colors",
                status === "DISMISSED" && "bg-secondary text-muted-foreground border-border"
              )}
              title="Dismiss Flag"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
