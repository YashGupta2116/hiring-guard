"use client";

import React from "react";
import { IntegrityEvent, IntegritySeverity } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Info,
  Clock,
  Eye,
  Copy,
  Code,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceTimelineProps {
  events: IntegrityEvent[];
}

export function EvidenceTimeline({ events }: EvidenceTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
        <p className="font-semibold text-foreground">Zero behavioral anomalies flagged</p>
        <p className="mt-0.5 text-[11px]">
          All telemetry channels remained consistent with baseline cognitive distributions throughout the session.
        </p>
      </div>
    );
  }

  // Check if there are correlated groups
  const hasCorrelatedGroup = events.some((e) => e.correlatedGroupId);

  const getSeverityBadge = (severity: IntegritySeverity) => {
    switch (severity) {
      case "High":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
            High Severity
          </span>
        );
      case "Medium":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            Medium Variance
          </span>
        );
      case "Low":
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-foreground border border-border">
            Low Variance
          </span>
        );
      case "Info":
      default:
        return (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary/60 text-muted-foreground border border-border/50">
            Integrity Signal
          </span>
        );
    }
  };

  const getEventIcon = (type: string, severity: IntegritySeverity) => {
    if (type.includes("Gaze")) {
      return <Eye className="h-3 w-3" />;
    }
    if (type.includes("code") || type.includes("Code")) {
      return <Code className="h-3 w-3" />;
    }
    if (type.includes("Copy") || type.includes("Paste")) {
      return <Copy className="h-3 w-3" />;
    }
    if (severity === "High" || severity === "Medium") {
      return <AlertTriangle className="h-3 w-3" />;
    }
    return <Clock className="h-3 w-3" />;
  };

  return (
    <div className="space-y-4">
      {/* Signature Correlated Anomaly Cluster Box */}
      {hasCorrelatedGroup && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-foreground flex items-start gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-foreground shrink-0 mt-0.5">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs">
                Correlated Multi-Signal Anomaly Cluster
              </span>
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                Human review recommended
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Events between <strong>00:08:31</strong> and <strong>00:08:42</strong> demonstrate multi-channel temporal correlation: code insertion burst coincides with off-screen lateral gaze displacement.
            </p>
          </div>
        </div>
      )}

      {/* Signature Time-Coded Stream (Evidence-based, Analytical) */}
      <div className="relative pl-5 space-y-3.5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
        {events.map((evt) => {
          const isCorrelated = Boolean(evt.correlatedGroupId);

          return (
            <div key={evt.id} className="relative group">
              {/* Node Indicator */}
              <div
                className={cn(
                  "absolute -left-5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card text-[9px]",
                  evt.severity === "High"
                    ? "bg-rose-500 text-white"
                    : evt.severity === "Medium"
                    ? "bg-amber-500 text-white"
                    : "bg-secondary text-foreground"
                )}
              >
                {getEventIcon(evt.type, evt.severity)}
              </div>

              {/* Event Content Box */}
              <div
                className={cn(
                  "rounded-md border p-3 text-xs space-y-1.5 transition-colors",
                  isCorrelated
                    ? "border-border bg-secondary/25"
                    : "border-border bg-card"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-foreground bg-secondary px-1.5 py-0.5 rounded border border-border/60">
                      {evt.timestamp}
                    </span>
                    <h4 className="font-semibold text-foreground text-xs">
                      {evt.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getSeverityBadge(evt.severity)}
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {evt.type}
                    </span>
                  </div>
                </div>

                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  {evt.description}
                </p>

                {/* Diagnostics Payload snippet */}
                {evt.contextData && (
                  <div className="rounded border border-border/80 bg-secondary/40 p-2 space-y-0.5 font-mono text-[10px] text-foreground mt-1.5">
                    <div className="text-muted-foreground uppercase font-semibold text-[9px] tracking-wider">
                      Telemetry Diagnostics
                    </div>
                    {evt.contextData.charactersInserted && (
                      <div>Payload: {evt.contextData.charactersInserted} chars (&lt; 120ms)</div>
                    )}
                    {evt.contextData.gazeAngle && (
                      <div>Gaze Vector: {evt.contextData.gazeAngle} (Duration: {evt.contextData.gazeDurationSeconds}s)</div>
                    )}
                    {evt.contextData.latencyMs && (
                      <div>Response Latency Offset: {evt.contextData.latencyMs}ms</div>
                    )}
                    {evt.contextData.codeSnippet && (
                      <div className="mt-1 pt-1 border-t border-border/60 text-foreground truncate">
                        Code snippet: <code>{evt.contextData.codeSnippet}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
