"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Clock, HelpCircle, Loader2, Maximize, Mic, MicOff, MonitorUp, Shield, UserRound, Video, VideoOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateWarning } from "@/components/ui/candidate-warning";
import { JoinCard, JoinShell } from "./join-shell";
import { CandidateEditor } from "./candidate-editor";
import { ApiError } from "@/lib/api/client";
import {
  getCandidateSession,
  getCandidateTasks,
  postMediaReady,
  type CandidateSessionInfo,
  type CandidateTask,
} from "@/lib/candidate/api";
import {
  getCameraStream,
  requestCameraAndMic,
  requestScreen,
  setCameraEnabled,
  setMicEnabled,
  stopAllMedia,
  trackState,
  type TrackState,
} from "@/lib/candidate/media";
import { connectCandidateSocket, syncClock, type CandidateServerEvents, type CandidateSocket } from "@/lib/candidate/socket";
import { EditorSync, TelemetryReporter } from "@/lib/candidate/telemetry";
import { CandidateRtc } from "@/lib/candidate/rtc";
import { CvProducer } from "@/lib/candidate/cv";
import { ScreenShareMonitor } from "@/lib/candidate/screen-monitor";
import { isTestMode } from "@/lib/candidate/test-mode";
import { enterFullscreen, isFullscreen, startLockdown, type ViolationKind } from "@/lib/candidate/lockdown";
import { cn } from "@/lib/utils";

type Phase = "loading" | "waiting" | "live" | "ended";
type SocketStatus = "connecting" | "connected" | "disconnected";
type ActiveWarning = CandidateServerEvents["warn.show"];

const ENDED_STATUSES = new Set(["SEALING", "PROCESSING", "COMPLETE", "ABORTED", "EXPIRED"]);

function phaseFor(status: string): Phase {
  if (status === "LIVE") return "live";
  return ENDED_STATUSES.has(status) ? "ended" : "waiting";
}

function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface CandidateRoomProps {
  candidateToken: string;
  /** The candidate token is no longer accepted (e.g. it expired); the caller resets to the join flow. */
  onInvalid: () => void;
  onFinished: () => void;
}

export function CandidateRoom({ candidateToken, onInvalid, onFinished }: CandidateRoomProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<CandidateSessionInfo | null>(null);
  const [socket, setSocket] = useState<CandidateSocket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [endedMessage, setEndedMessage] = useState("Thank you for completing your interview.");
  const [remaining, setRemaining] = useState<{ ms: number; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [warning, setWarning] = useState<ActiveWarning | null>(null);
  const [warningAcked, setWarningAcked] = useState(false);
  const [tasks, setTasks] = useState<CandidateTask[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [media, setMedia] = useState<TrackState>(() => trackState());
  const [mediaReported, setMediaReported] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [resharing, setResharing] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryReporter | null>(null);
  const [editorSync, setEditorSync] = useState<EditorSync | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [newTaskNotice, setNewTaskNotice] = useState(false);
  const [cvLocal, setCvLocal] = useState<{ state: string; faces: number; away: boolean; object?: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [testMode] = useState(() => isTestMode());
  const [blockedNotice, setBlockedNotice] = useState(false);
  const armedRef = useRef(false);
  const violationSent = useRef(false);
  const socketRefLatest = useRef<CandidateSocket | null>(null);

  const selfVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const rtcRef = useRef<CandidateRtc | null>(null);
  const snapshotGetters = useRef(new Map<string, () => { language: string; content: string }>());
  const activeTaskRef = useRef<string | null>(null);

  // Keep the freshest handlers reachable from socket callbacks that are registered once.
  const onInvalidRef = useRef(onInvalid);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onInvalidRef.current = onInvalid;
    onFinishedRef.current = onFinished;
    activeTaskRef.current = activeTaskId;
  }, [onInvalid, onFinished, activeTaskId]);

  // ---- Initial state from the server -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    getCandidateSession(candidateToken)
      .then((res) => {
        if (cancelled) return;
        setInfo(res);
        setPhase(phaseFor(res.status));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) onInvalidRef.current();
        else setPhase("waiting");
      });
    return () => {
      cancelled = true;
    };
  }, [candidateToken]);

  // ---- Real-time connection ----------------------------------------------------------------
  useEffect(() => {
    const s = connectCandidateSocket(candidateToken);
    setSocket(s);

    s.on("connect", () => {
      setSocketStatus("connected");
      void syncClock(s);
    });
    s.on("disconnect", () => setSocketStatus("disconnected"));
    s.on("connect_error", () => setSocketStatus("disconnected"));

    s.on("session.state", (e: CandidateServerEvents["session.state"]) => {
      setPhase(e.status === "LIVE" ? "live" : e.status === "ENDED" ? "ended" : "waiting");
    });
    s.on("time.remaining", (e: CandidateServerEvents["time.remaining"]) => setRemaining({ ms: e.remainingMs, at: Date.now() }));
    s.on("warn.show", (e: ActiveWarning) => {
      setWarning(e);
      setWarningAcked(false);
    });
    s.on("task.frozen", (e: CandidateServerEvents["task.frozen"]) => {
      setTasks((prev) => prev?.map((t) => (t.taskId === e.taskId ? { ...t, frozen: true } : t)) ?? prev);
    });
    s.on("task.assigned", () => {
      // The interviewer handed over another task: reload the list and bring the new one into view.
      getCandidateTasks(candidateToken)
        .then((res) => {
          setTasks(res);
          setActiveTaskId((current) => current ?? res[0]?.taskId ?? null);
          setNewTaskNotice(true);
        })
        .catch(() => undefined);
    });
    s.on("session.ended", (e: CandidateServerEvents["session.ended"]) => {
      setEndedMessage(e.message);
      setPhase("ended");
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [candidateToken]);

  // Fallback for a missed `session.state` event while waiting.
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => {
      getCandidateSession(candidateToken)
        .then((res) => setPhase(phaseFor(res.status)))
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, [phase, candidateToken]);

  // ---- Clock tick for the countdown ---------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Media health -------------------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => setMedia(trackState()), 1000);
    return () => clearInterval(id);
  }, []);

  const mediaOk = media.camera && media.microphone && media.screen && media.screenIsMonitor;

  // Tell the server the tracks are live so the interviewer is allowed to start the session.
  useEffect(() => {
    if (phase === "loading" || phase === "ended" || !mediaOk || mediaReported) return;
    postMediaReady(candidateToken, { camera: media.camera, microphone: media.microphone, screen: media.screen })
      .then(() => {
        setMediaReported(true);
        setMediaError(null);
      })
      .catch((err) => setMediaError(err instanceof ApiError ? err.message : "Could not confirm your camera and screen."));
  }, [phase, mediaOk, mediaReported, candidateToken, media.camera, media.microphone, media.screen]);

  // Show the candidate their own camera.
  useEffect(() => {
    const video = selfVideoRef.current;
    if (video && phase !== "ended") video.srcObject = getCameraStream();
  }, [phase, media.camera]);

  // ---- Full screen & lockdown ---------------------------------------------------------------
  useEffect(() => {
    socketRefLatest.current = socket;
  }, [socket]);

  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    armedRef.current = !testMode && phase === "live" && mediaOk && fullscreen;
  }, [testMode, phase, mediaOk, fullscreen]);

  const inRoom = phase !== "loading" && phase !== "ended";
  useEffect(() => {
    if (!inRoom) return;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = startLockdown({
      isArmed: () => armedRef.current,
      onViolation: (kind: ViolationKind) => {
        if (violationSent.current) return;
        violationSent.current = true;
        socketRefLatest.current?.emit("session.violation", { kind });
        setEndedMessage("Your interview was ended because you left the full-screen interview window. The interviewer has been notified.");
        setPhase("ended");
      },
      onBlocked: () => {
        setBlockedNotice(true);
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => setBlockedNotice(false), 2500);
      },
    });
    return () => {
      stop();
      clearTimeout(noticeTimer);
    };
  }, [inRoom]);

  // Video call with the interviewer: send our camera/mic/screen, show theirs.
  useEffect(() => {
    if (!socket || phase === "ended" || phase === "loading") return;
    const rtc = new CandidateRtc(socket, setRemoteStream);
    rtcRef.current = rtc;
    rtc.start();
    return () => {
      rtc.stop();
      rtcRef.current = null;
    };
  }, [socket, phase === "ended" || phase === "loading"]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (video && video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
      void video.play().catch(() => undefined);
    }
  }, [remoteStream, phase, mediaOk]);

  // Camera analysis (face presence, face count, gaze) runs in the browser while the interview is live.
  useEffect(() => {
    if (phase !== "live" || !socket || !media.camera) return;
    const cv = new CvProducer(socket);
    cv.onStatus = setCvLocal;
    cv.start();
    return () => cv.stop();
  }, [phase, socket, media.camera]);

  // SCREEN channel: flags the shared screen ending or losing full-monitor scope mid-interview.
  useEffect(() => {
    if (phase !== "live" || !socket) return;
    const monitor = new ScreenShareMonitor(socket);
    monitor.start();
    return () => monitor.stop();
  }, [phase, socket]);

  // ---- Coding tasks & live signals ----------------------------------------------------------
  useEffect(() => {
    if (phase !== "live" || tasks !== null) return;
    let cancelled = false;
    getCandidateTasks(candidateToken)
      .then((res) => {
        if (cancelled) return;
        setTasks(res);
        setActiveTaskId(res[0]?.taskId ?? null);
      })
      .catch((err) => !cancelled && setTasksError(err instanceof ApiError ? err.message : "Could not load your coding task."));
    return () => {
      cancelled = true;
    };
  }, [phase, tasks, candidateToken]);

  useEffect(() => {
    if (phase !== "live" || !socket) return;
    const reporter = new TelemetryReporter(socket);
    const sync = new EditorSync(socket, () => {
      const id = activeTaskRef.current;
      const get = id ? snapshotGetters.current.get(id) : undefined;
      const snap = get?.();
      return id && snap ? { taskId: id, ...snap } : null;
    });
    reporter.start();
    sync.start();
    setTelemetry(reporter);
    setEditorSync(sync);
    return () => {
      reporter.stop();
      sync.stop();
      setTelemetry(null);
      setEditorSync(null);
    };
  }, [phase, socket]);

  // ---- End of interview ---------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "ended") return;
    stopAllMedia();
    onFinishedRef.current();
  }, [phase]);

  const registerSnapshot = useCallback((taskId: string, get: () => { language: string; content: string }) => {
    snapshotGetters.current.set(taskId, get);
  }, []);

  const acknowledgeWarning = () => {
    if (!warning) return;
    setWarningAcked(true);
    socket?.emit("warn.ack", { warningId: warning.warningId, ackedAt: Date.now() });
  };

  // A NOTICE fades on its own; WARNING and INTERRUPT wait for the candidate.
  useEffect(() => {
    if (!warning || warning.tier !== "NOTICE") return;
    const id = setTimeout(() => setWarning(null), warning.displayMs ?? 12_000);
    return () => clearTimeout(id);
  }, [warning]);

  const reshare = async () => {
    setResharing(true);
    if (!media.camera || !media.microphone) await requestCameraAndMic();
    if (!media.screen || !media.screenIsMonitor) await requestScreen();
    setMedia(trackState());
    setMediaReported(false);
    setResharing(false);
    rtcRef.current?.refresh();
  };

  // ---- Render -------------------------------------------------------------------------------
  if (phase === "loading") {
    return (
      <JoinShell>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </JoinShell>
    );
  }

  if (phase === "ended") {
    return (
      <JoinShell>
        <JoinCard title="Interview complete">
          <p className="text-sm text-muted-foreground leading-relaxed">{endedMessage}</p>
          <p className="text-xs text-muted-foreground">You can close this window. Your camera and screen sharing have been stopped.</p>
        </JoinCard>
      </JoinShell>
    );
  }

  const remainingMs = remaining ? Math.max(0, remaining.ms - (now - remaining.at)) : null;

  if (!mediaOk) {
    return (
      <JoinShell>
        <JoinCard
          title="Share your camera and screen to continue"
          description="Your camera, microphone and entire screen need to be shared for the interview. If you reloaded this page or stopped sharing, please share again."
        >
          <div className="flex justify-end">
            <Button onClick={reshare} isLoading={resharing}>
              <MonitorUp className="h-4 w-4 mr-1.5" /> Share again
            </Button>
          </div>
        </JoinCard>
      </JoinShell>
    );
  }

  const fullscreenGate = !testMode && !fullscreen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-6">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-4 shadow-lg">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Maximize className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Enter full screen to continue</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This interview must run in full screen. Copy and paste are disabled. Once the interview starts, leaving full screen, switching tabs or switching to another window ends the interview immediately.
        </p>
        <Button onClick={() => void enterFullscreen()} className="w-full">
          Enter full screen
        </Button>
      </div>
    </div>
  );

  if (phase === "waiting") {
    return (
      <>
      {fullscreenGate}
      <JoinShell>
        <JoinCard
          title="You're checked in"
          description={`${info?.title ? `${info.title} — ` : ""}Please keep this window open. Your interviewer will begin the interview shortly.`}
        >
          <video ref={selfVideoRef} autoPlay muted playsInline className="w-full max-h-56 rounded-lg bg-black object-cover" aria-label="Your camera preview" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for the interviewer to start…
          </div>
          {mediaError && (
            <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
              {mediaError}
            </div>
          )}
          {socketStatus === "disconnected" && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
            </div>
          )}
        </JoinCard>
      </JoinShell>
      </>
    );
  }

  // ---- Live ---------------------------------------------------------------------------------
  const activeTask = tasks?.find((t) => t.taskId === activeTaskId) ?? null;
  const interrupted = warning?.tier === "INTERRUPT" && !warningAcked;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {fullscreenGate}
      {testMode && (
        <div className="fixed bottom-3 left-3 z-40 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Test mode: full screen and switch-away rules are off
        </div>
      )}
      {blockedNotice && (
        <div role="status" className="fixed top-3 left-1/2 z-40 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg">
          Copy and paste are disabled during this interview.
        </div>
      )}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-semibold text-foreground">{info?.title ?? "Technical Interview"}</h1>
            <p className="text-[10px] text-muted-foreground">HiringGuard candidate environment</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2.5 py-1 font-mono text-xs font-semibold text-foreground" aria-label="Time remaining">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{remainingMs !== null ? formatTimer(remainingMs) : "--:--"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", socketStatus === "connected" ? "bg-sage-500" : "bg-amber-500")} />
            <span>{socketStatus === "connected" ? "Connected" : "Reconnecting…"}</span>
          </div>
        </div>
      </header>

      {warning && (
        <div className="px-2.5 pt-2.5">
          <CandidateWarning key={warning.warningId} tier={warning.tier} message={warning.message} onAcknowledge={acknowledgeWarning} />
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2.5 p-2.5 overflow-hidden">
        <div className="lg:col-span-4 flex flex-col gap-2.5 h-full overflow-hidden">
          <div className="grid grid-cols-2 gap-2 h-32 shrink-0">
            <div className="relative rounded-lg border border-border bg-slate-950 overflow-hidden flex flex-col items-center justify-center gap-1 text-muted-foreground">
              <video ref={remoteVideoRef} autoPlay playsInline className={cn("w-full h-full object-cover", !remoteStream && "hidden")} aria-label="Interviewer video" />
              {!remoteStream && (
                <>
                  <UserRound className="h-6 w-6" />
                  <span className="text-[10px] px-2 text-center">Connecting to your interviewer&apos;s video…</span>
                </>
              )}
              {remoteStream && <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">Interviewer</div>}
            </div>

            <div className="relative rounded-lg border border-border bg-slate-950 overflow-hidden flex items-center justify-center">
              <video ref={selfVideoRef} autoPlay muted playsInline className={cn("w-full h-full object-cover", !camOn && "hidden")} aria-label="Your camera" />
              {!camOn && <VideoOff className="h-5 w-5 text-slate-500" />}
              <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">You</div>
              {cvLocal?.state === "ok" && (
                <div className={cn("absolute top-1 left-1 rounded px-1.5 py-0.5 text-[9px] text-white", cvLocal.faces === 1 && !cvLocal.away && !cvLocal.object ? "bg-sage-600/90" : "bg-terra-600/90")}>
                  {cvLocal.object ? `Remove ${cvLocal.object}` : cvLocal.faces === 0 ? "No face" : cvLocal.faces > 1 ? `${cvLocal.faces} faces` : cvLocal.away ? "Look at screen" : "Face OK"}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 rounded-lg border border-border bg-card p-3.5 overflow-y-auto space-y-2.5 text-xs">
            {newTaskNotice && (
              <div role="status" className="flex items-center justify-between gap-2 rounded-md border border-sage-500/30 bg-sage-500/10 px-2.5 py-1.5 text-[11px] text-sage-700 dark:text-sage-400">
                <span>Your interviewer assigned a coding task.</span>
                <button onClick={() => setNewTaskNotice(false)} className="font-semibold underline">
                  Dismiss
                </button>
              </div>
            )}
            {tasksError ? (
              <p className="text-terra-600 dark:text-terra-400">{tasksError}</p>
            ) : tasks === null ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : tasks.length === 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <HelpCircle className="h-3.5 w-3.5" /> Live conversation
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  This interview has no coding task. Your interviewer will talk with you directly. Please keep this window open and in focus.
                </p>
              </div>
            ) : (
              <>
                {tasks.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap pb-1">
                    {tasks.map((t, i) => (
                      <button
                        key={t.taskId}
                        onClick={() => setActiveTaskId(t.taskId)}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                          t.taskId === activeTaskId ? "border-foreground bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Task {i + 1}
                        {t.frozen ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
                {activeTask && (
                  <>
                    <div className="flex items-center justify-between pb-1.5 border-b border-border">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5" /> Technical Problem
                      </span>
                      {activeTask.frozen && (
                        <Badge variant="outline" size="sm" className="text-[10px]">
                          Submitted
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{activeTask.title}</h3>
                      <p className="mt-1 text-muted-foreground text-[11px] leading-relaxed whitespace-pre-wrap">{activeTask.statement}</p>
                    </div>
                    {activeTask.visibleTests.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <h4 className="font-semibold text-foreground text-[11px]">Examples</h4>
                        <ul className="space-y-1 text-muted-foreground text-[11px]">
                          {activeTask.visibleTests.map((t, i) => (
                            <li key={i} className="rounded bg-secondary/50 px-2 py-1 font-mono">
                              <span className="text-foreground">{t.input}</span> → {t.expectedOutput}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 h-full min-h-[420px]">
          {activeTask ? (
            <CandidateEditor
              key={activeTask.taskId}
              task={activeTask}
              candidateToken={candidateToken}
              telemetry={telemetry}
              editorSync={editorSync}
              locked={interrupted}
              frozen={activeTask.frozen}
              onSubmitted={(taskId) => setTasks((prev) => prev?.map((t) => (t.taskId === taskId ? { ...t, frozen: true } : t)) ?? prev)}
              registerSnapshot={registerSnapshot}
            />
          ) : (
            <div className="h-full rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
              {tasks && tasks.length === 0 ? "No coding task for this interview." : "Loading your workspace…"}
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between px-5 py-2 border-t border-border bg-card">
        <div className="text-xs text-muted-foreground">HiringGuard Candidate Assessment Environment</div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setMicEnabled(!micOn);
              setMicOn(!micOn);
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              !micOn ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400" : "bg-secondary border-border text-foreground hover:bg-secondary/80",
            )}
            title="Toggle microphone"
            aria-label="Toggle microphone"
          >
            {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => {
              setCameraEnabled(!camOn);
              setCamOn(!camOn);
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              !camOn ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400" : "bg-secondary border-border text-foreground hover:bg-secondary/80",
            )}
            title="Toggle camera"
            aria-label="Toggle camera"
          >
            {camOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="w-40" />
      </footer>
    </div>
  );
}
