import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { FLAG_STATUS_LABEL, type ReportFlag } from "@/lib/api/reports";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<string, string> = {
  GAZE: "Gaze",
  FACE: "Face",
  IDENTITY: "Identity",
  SCENE: "Scene",
  AUDIO: "Audio",
  SCREEN: "Screen",
  FOCUS: "Focus",
  PASTE: "Paste",
  RHYTHM: "Typing rhythm",
  POINTER: "Pointer",
  ENVIRONMENT: "Environment",
};

const SEVERITY_STYLE = {
  HIGH: "bg-terra-500/10 text-terra-700 dark:text-terra-400 border-terra-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  LOW: "bg-secondary text-foreground border-border",
} as const;

const SEVERITY_LABEL = { HIGH: "High severity", MEDIUM: "Medium severity", LOW: "Low severity" } as const;

/** Time since the interview started, as hh:mm:ss. */
function offset(iso: string, startedAt: string | null): string {
  if (!startedAt) return new Date(iso).toLocaleTimeString("en-US");
  const total = Math.max(0, Math.floor((new Date(iso).getTime() - new Date(startedAt).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}

interface FlagTimelineProps {
  flags: ReportFlag[];
  startedAt: string | null;
}

export function FlagTimeline({ flags, startedAt }: FlagTimelineProps) {
  if (flags.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 text-sage-600 dark:text-sage-400 mx-auto mb-2" />
        <p className="font-semibold text-foreground">No flags were raised</p>
        <p className="mt-0.5 text-[11px]">Nothing crossed a detection threshold during the interview.</p>
      </div>
    );
  }

  const ordered = [...flags].sort((a, b) => a.startTs.localeCompare(b.startTs));

  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
      {ordered.map((flag) => {
        const excluded = flag.status === "DISMISSED" || flag.status === "SUPERSEDED" || flag.supersededByReview;
        return (
          <li key={flag.id} className={cn("relative rounded-md border border-border bg-card p-3 text-xs space-y-1.5", excluded && "opacity-60")}>
            <span className="absolute -left-[18px] top-4 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">{offset(flag.startTs, startedAt)}</span>
                <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", SEVERITY_STYLE[flag.severity])}>{SEVERITY_LABEL[flag.severity]}</span>
                <span className="text-[11px] text-muted-foreground">{CHANNEL_LABEL[flag.channel] ?? flag.channel}</span>
              </div>
              <div className="flex items-center gap-2">
                {flag.status !== "OPEN" && <span className="rounded border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">{FLAG_STATUS_LABEL[flag.status]}</span>}
                <span className="font-mono text-[11px] text-foreground" title="Integrity points this flag cost">
                  −{(Math.round(flag.scoreDelta * 10) / 10).toFixed(1)} pts
                </span>
              </div>
            </div>
            <p className={cn("leading-relaxed text-foreground", excluded && "line-through decoration-muted-foreground/50")}>{flag.narrative}</p>
            {excluded && <p className="text-[11px] text-muted-foreground">Excluded from the final score after review.</p>}
          </li>
        );
      })}
    </ol>
  );
}
