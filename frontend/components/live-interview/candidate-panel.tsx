"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Code2, Lock, Loader2, Radio, VideoOff, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessionCode, type CodeExecution, type SessionCodeTask } from "@/lib/live/api";
import type { SystemDegraded } from "@/lib/live/socket";
import type { Presence } from "@/lib/live/socket";
import { cn } from "@/lib/utils";

const CODE_POLL_MS = 5000;

/** Polls the candidate's code while the interview runs. Snapshots arrive about every 30 s and on each run/submit. */
function useSessionCode(sessionId: string, enabled: boolean) {
  const [tasks, setTasks] = useState<SessionCodeTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      getSessionCode(sessionId)
        .then((res) => {
          if (cancelled) return;
          setTasks(res);
          setError(null);
        })
        .catch(() => !cancelled && setError("Couldn't refresh the candidate's code."));
    void load();
    const id = setInterval(load, CODE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, enabled]);

  return { tasks, error };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function passCount(results: { passed: boolean }[] | null): string | null {
  return results && results.length > 0 ? `${results.filter((r) => r.passed).length}/${results.length}` : null;
}

function ExecutionRow({ e }: { e: CodeExecution }) {
  const visible = passCount(e.visibleResults);
  const hidden = passCount(e.hiddenResults);
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant="outline" size="sm" className="text-[10px]">
          {e.kind === "SUBMIT" ? "Submit" : "Run"}
        </Badge>
        <span className={cn("font-medium", e.status === "PASSED" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{e.status.toLowerCase()}</span>
        {visible && <span className="text-muted-foreground">visible {visible}</span>}
        {hidden && <span className="text-muted-foreground">hidden {hidden}</span>}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{time(e.createdAt)}</span>
    </li>
  );
}

interface CandidatePanelProps {
  sessionId: string;
  candidateName: string;
  candidateEmail: string | null;
  presence: Presence | null;
  degraded: Record<string, SystemDegraded>;
  calibrating: boolean;
  calibrationEndsAt: string | null;
  now: number;
  live: boolean;
}

export function CandidatePanel({ sessionId, candidateName, candidateEmail, presence, degraded, calibrating, calibrationEndsAt, now, live }: CandidatePanelProps) {
  const { tasks, error } = useSessionCode(sessionId, live);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = tasks?.find((t) => t.taskId === activeId) ?? tasks?.[0] ?? null;
  const latest = active?.snapshots[active.snapshots.length - 1] ?? null;

  const graceLeftMs = presence && !presence.connected && presence.graceEndsAt ? Math.max(0, new Date(presence.graceEndsAt).getTime() - now) : null;
  const degradedList = Object.values(degraded);
  const calibrationLeftMs = calibrating && calibrationEndsAt ? Math.max(0, new Date(calibrationEndsAt).getTime() - now) : null;

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      <div className="rounded-xl border border-border bg-card p-4 shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{candidateName}</h2>
            {candidateEmail && <p className="text-xs text-muted-foreground truncate">{candidateEmail}</p>}
          </div>
          <div className="flex items-center gap-2">
            {presence === null ? (
              <Badge variant="outline" size="sm" className="gap-1.5">
                <Radio className="h-3 w-3" /> Presence unknown
              </Badge>
            ) : presence.connected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Candidate connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                <WifiOff className="h-3 w-3" /> Candidate disconnected
                {graceLeftMs !== null && ` — session ends in ${Math.ceil(graceLeftMs / 1000)}s if they don't return`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <VideoOff className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Live video and audio are not streamed in this environment (the media provider is a stand-in), so there is no candidate feed to show. Signals below are real; camera-based channels such as gaze need a CV producer that isn&apos;t connected.</p>
        </div>

        {calibrationLeftMs !== null && (
          <p className="text-xs text-muted-foreground">
            Calibrating the candidate&apos;s baseline: nothing is scored for another {Math.ceil(calibrationLeftMs / 1000)}s.
          </p>
        )}

        {degradedList.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Some signal sources are degraded: {degradedList.map((d) => `${d.producer}${d.channels?.length ? ` (${d.channels.join(", ")})` : ""}`).join("; ")}. Their channels are not being scored right now.</p>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/30">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Code2 className="h-4 w-4" /> Candidate&apos;s code
          </span>
          <span className="text-[11px] text-muted-foreground">Updates about every 30 s and on each run or submit</span>
        </div>

        {!live ? (
          <p className="p-6 text-sm text-muted-foreground">The candidate&apos;s code appears here once the interview is live.</p>
        ) : tasks === null ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {error ? <span className="text-sm text-red-600 dark:text-red-400">{error}</span> : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        ) : tasks.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">This interview has no coding task, so there is no code to follow.</p>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {tasks.length > 1 && (
              <div className="flex gap-1.5 px-4 pt-3">
                {tasks.map((t, i) => (
                  <button
                    key={t.taskId}
                    onClick={() => setActiveId(t.taskId)}
                    className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", t.taskId === active?.taskId ? "border-foreground bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    Task {i + 1}
                  </button>
                ))}
              </div>
            )}

            {active && (
              <>
                <div className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="font-medium text-foreground">{active.title}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {latest && <span className="font-mono">{latest.language}</span>}
                    {latest && <span>snapshot {time(latest.createdAt)}</span>}
                    {active.frozen && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <Lock className="h-3 w-3" /> submitted {active.submittedAt ? time(active.submittedAt) : ""}
                      </span>
                    )}
                  </span>
                </div>

                <pre className="flex-1 min-h-[120px] overflow-auto mx-4 rounded-lg bg-[#18181b] p-3 text-[12px] leading-relaxed text-zinc-100 font-mono whitespace-pre-wrap">
                  {latest ? latest.content : "No code snapshot yet. The first one arrives within about 30 seconds of the candidate starting."}
                </pre>

                <div className="px-4 py-3 space-y-1.5 max-h-40 overflow-y-auto">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Runs and submission</h4>
                  {active.executions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">The candidate hasn&apos;t run their code yet.</p>
                  ) : (
                    <ul className="space-y-1">{[...active.executions].reverse().map((e) => <ExecutionRow key={e.id} e={e} />)}</ul>
                  )}
                  {active.runner === "mock" && active.executions.length > 0 && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" /> The demo runner is active: it does not execute code and marks every test as passed.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
