"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Code2, Loader2, Lock, Maximize2, Mic, MicOff, Minimize2, Plus, Radio, Video, VideoOff, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/client";
import { difficultyLabel, listCodingTasks, type CodingTaskSummary } from "@/lib/api/coding-tasks";
import { assignLiveTask, getSessionCode, type CodeExecution, type SessionCodeTask } from "@/lib/live/api";
import type { useLiveVideo } from "@/lib/live/use-live-video";
import { useToast } from "@/components/ui/toast";
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
        <span className={cn("font-medium", e.status === "PASSED" ? "text-sage-600 dark:text-sage-400" : "text-terra-600 dark:text-terra-400")}>{e.status.toLowerCase()}</span>
        {visible && <span className="text-muted-foreground">visible {visible}</span>}
        {hidden && <span className="text-muted-foreground">hidden {hidden}</span>}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{time(e.createdAt)}</span>
    </li>
  );
}

/** Plays a MediaStream in a <video>; shows `empty` until a stream arrives. */
function VideoTile({ stream, label, muted = false, mirror = false, empty, className }: { stream: MediaStream | null; label: string; muted?: boolean; mirror?: boolean; empty: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-slate-950", className)}>
      <video ref={ref} autoPlay playsInline muted={muted} className={cn("h-full w-full object-contain", mirror && "-scale-x-100", !stream && "hidden")} aria-label={label} />
      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-slate-400">
          <VideoOff className="h-5 w-5" />
          <span className="text-[11px]">{empty}</span>
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{label}</span>
    </div>
  );
}

type CvStatus = CandidatePanelProps["cvStatus"];

/** Live read-out of the candidate's camera analysis: face present, face count, looking away. */
function FaceIndicator({ status, now }: { status: CvStatus; now: number }) {
  const stale = !status || now - status.at > 5000;
  let tone = "bg-muted text-muted-foreground";
  let text = "Camera analysis: waiting for data…";
  if (status && !stale) {
    if (status.state === "loading") text = "Camera analysis: starting…";
    else if (status.state === "unavailable") {
      tone = "bg-amber-500/15 text-amber-700 dark:text-amber-400";
      text = "Camera analysis unavailable in the candidate's browser";
    } else if (status.object) {
      tone = "bg-terra-500/15 text-terra-700 dark:text-terra-400";
      text = `Foreign object in view: ${status.object}`;
    } else if (status.faces === 0) {
      tone = "bg-terra-500/15 text-terra-700 dark:text-terra-400";
      text = "No face detected";
    } else if (status.faces > 1) {
      tone = "bg-terra-500/15 text-terra-700 dark:text-terra-400";
      text = `${status.faces} faces detected`;
    } else if (status.away) {
      tone = "bg-amber-500/15 text-amber-700 dark:text-amber-400";
      text = "Face detected, looking away";
    } else {
      tone = "bg-sage-500/15 text-sage-700 dark:text-sage-400";
      text = "Face detected, looking at screen";
    }
  }
  return (
    <div role="status" className={cn("rounded-md px-2 py-1 text-[11px] font-medium", tone)}>
      {text}
    </div>
  );
}

/** Lets the interviewer hand the candidate a coding task during the live interview. */
function AssignTask({ sessionId, assignedTitles }: { sessionId: string; assignedTitles: string[] }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<CodingTaskSummary[] | null>(null);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCodingTasks()
      .then((res) => !cancelled && setTasks(res))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const available = (tasks ?? []).filter((t) => !assignedTitles.includes(t.title));
  const assign = async () => {
    if (!taskId) return;
    setBusy(true);
    try {
      await assignLiveTask(sessionId, taskId);
      toast({ title: "Task assigned", description: "The candidate can see it now.", type: "success" });
      setTaskId("");
    } catch (err) {
      toast({ title: "Couldn't assign the task", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Coding task to assign"
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        disabled={tasks === null || available.length === 0}
        className="h-7 max-w-[220px] rounded-md border border-input bg-background px-2 text-[11px] text-foreground focus:outline-none focus:border-foreground/40 disabled:opacity-60"
      >
        <option value="">{tasks === null ? "Loading tasks…" : available.length === 0 ? "No more tasks to assign" : "Assign a coding task…"}</option>
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            [{difficultyLabel(t.difficulty)}] {t.title}
          </option>
        ))}
      </select>
      <button onClick={assign} disabled={!taskId || busy} className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2.5 text-[11px] font-semibold text-background disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Assign
      </button>
    </div>
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
  video: ReturnType<typeof useLiveVideo>;
  cvStatus: { state: "loading" | "ok" | "unavailable"; faces: number; away: boolean; object?: string; at: number } | null;
  canAct: boolean;
}

export function CandidatePanel({ sessionId, candidateName, candidateEmail, presence, degraded, calibrating, calibrationEndsAt, now, live, video, cvStatus, canAct }: CandidatePanelProps) {
  const [screenExpanded, setScreenExpanded] = useState(false);
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
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-sage-50 px-2.5 py-0.5 text-[11px] font-medium text-sage-700 dark:border-sage-800 dark:bg-sage-950/40 dark:text-sage-400">
                <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" /> Candidate connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                <WifiOff className="h-3 w-3" /> Candidate disconnected
                {graceLeftMs !== null && ` — session ends in ${Math.ceil(graceLeftMs / 1000)}s if they don't return`}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className={cn("grid gap-2", screenExpanded ? "grid-cols-1" : "grid-cols-5")}>
            {!screenExpanded && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <VideoTile stream={video.camera} label={candidateName} empty={video.state === "failed" ? "Connection failed, retrying…" : "Waiting for the candidate's camera…"} className="h-36" />
                <FaceIndicator status={cvStatus} now={now} />
              </div>
            )}
            <div className={cn("relative", screenExpanded ? "h-[52vh]" : "col-span-3 h-36")}>
              <VideoTile stream={video.screen} label="Candidate's screen" empty="Waiting for the candidate's screen…" className="h-full w-full" />
              <button
                onClick={() => setScreenExpanded((v) => !v)}
                className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label={screenExpanded ? "Shrink screen view" : "Enlarge screen view"}
              >
                {screenExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <VideoTile stream={video.local} label="You" muted mirror empty="" className="h-12 w-20" />
              <button onClick={video.toggleMic} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-foreground hover:bg-secondary/80" aria-label="Toggle microphone" title="Toggle microphone">
                {video.micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-terra-500" />}
              </button>
              <button onClick={video.toggleCam} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-foreground hover:bg-secondary/80" aria-label="Toggle camera" title="Toggle camera">
                {video.camOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5 text-terra-500" />}
              </button>
            </div>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", video.state === "connected" ? "bg-sage-500" : video.state === "failed" ? "bg-terra-500" : "bg-amber-500 animate-pulse")} />
              {video.state === "connected" ? "Video connected" : video.state === "failed" ? "Video connection failed, retrying" : "Connecting video…"}
            </span>
          </div>
          {video.mediaError && <p className="text-[11px] text-amber-700 dark:text-amber-400">{video.mediaError}</p>}
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
          {canAct && live ? <AssignTask sessionId={sessionId} assignedTitles={(tasks ?? []).map((t) => t.title)} /> : <span className="text-[11px] text-muted-foreground">Updates about every 30 s and on each run or submit</span>}
        </div>

        {!live ? (
          <p className="p-6 text-sm text-muted-foreground">The candidate&apos;s code appears here once the interview is live.</p>
        ) : tasks === null ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {error ? <span className="text-sm text-terra-600 dark:text-terra-400">{error}</span> : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        ) : tasks.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">This interview has no coding task yet. Use the Assign a coding task control above to give the candidate one.</p>
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
                      <span className="inline-flex items-center gap-1 text-sage-700 dark:text-sage-400">
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
