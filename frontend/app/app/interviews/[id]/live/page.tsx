"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CandidatePanel } from "@/components/live-interview/candidate-panel";
import { LiveSidebar } from "@/components/live-interview/live-sidebar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { SessionPill } from "@/components/ui/session-pill";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { sessionCandidateName, sessionRef, sessionRole } from "@/lib/api/sessions";
import { isEndedStatus, useLiveRoom } from "@/lib/live/use-live-room";
import { Radio, PhoneOff, Clock, Shield, ChevronLeft, Loader2, Play, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export default function LiveInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const { canConductInterview } = usePermissions();
  const room = useLiveRoom(id);

  const [now, setNow] = useState(() => Date.now());
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { session, status, timer, snapshot } = room;

  if (room.loading) {
    return (
      <div className="p-6">
        <LoadingState variant="detail" />
      </div>
    );
  }

  if (room.notFound) {
    return (
      <EmptyState
        icon={Radio}
        title="Live Interview Not Found"
        description="This interview doesn't exist or you aren't assigned to it."
        actionLabel="Return to Interviews"
        onAction={() => router.push("/app/interviews")}
      />
    );
  }

  if (room.error || !session) {
    return <ErrorState title="Couldn't load the live room" description={room.error ?? undefined} onRetry={room.reload} />;
  }

  const candidateName = sessionCandidateName(session);
  const ref = sessionRef(session.id);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await room.start();
      toast({ title: "Interview started", description: "The candidate is live. Calibration runs for the first minute.", type: "success" });
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : "Couldn't start the interview.");
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      await room.end();
      setEndDialogOpen(false);
      toast({ title: "Interview ended", description: "Evidence is being sealed and the report is being prepared.", type: "info" });
      router.push(`/app/interviews/${session.id}/processing`);
    } catch (err) {
      setEnding(false);
      toast({ title: "Couldn't end the interview", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  // ---- Not live: pre-start and ended states ------------------------------------------------------
  if (status !== "LIVE") {
    const ended = isEndedStatus(status);
    const admitted = status === "ADMITTED";
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground">
            {ended ? <PhoneOff className="h-5 w-5" /> : admitted ? <Play className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-foreground">{ended ? "This interview has ended" : admitted ? `${candidateName} is ready` : `Waiting for ${candidateName} to join`}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {ended
                ? status === "ABORTED"
                  ? "The interview was cancelled."
                  : status === "EXPIRED"
                    ? "The candidate link expired before the candidate joined."
                    : "The session is closed. Its evidence is sealed and the report is being prepared."
                : admitted
                  ? "The candidate has consented and shared their camera and screen. Start the interview when you're ready. The clock begins immediately."
                  : "The candidate hasn't completed the join steps yet. This page updates on its own when they do."}
            </p>
          </div>

          {admitted && (
            <>
              {startError && (
                <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  {startError}
                </div>
              )}
              {canConductInterview ? (
                <Button onClick={handleStart} isLoading={starting} className="gap-2">
                  <Play className="h-4 w-4" /> Start interview
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Only the interview team can start it.</p>
              )}
            </>
          )}

          <div className="flex items-center justify-center gap-3 pt-1 text-sm">
            <Link href={`/app/interviews/${session.id}`} className="text-muted-foreground hover:text-foreground underline">
              Interview details
            </Link>
            {ended && !room.reportId && (status === "SEALING" || status === "PROCESSING") && (
              <Link href={`/app/interviews/${session.id}/processing`} className="text-muted-foreground hover:text-foreground underline">
                Processing status
              </Link>
            )}
            {room.reportId && (
              <Link href={`/app/reports/${room.reportId}`} className="text-muted-foreground hover:text-foreground underline">
                Report
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Live ---------------------------------------------------------------------------------------
  const elapsedMs = timer ? timer.elapsedMs + (now - timer.receivedAt) : 0;
  const remainingMs = timer ? Math.max(0, timer.remainingMs - (now - timer.receivedAt)) : null;
  const recording = session.config.recordVideo || session.config.recordAudio || session.config.recordScreen;
  const browserChannels = room.integrity.channels.filter((c) => ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"].includes(c.channel)).length;

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden animate-fade-in-up">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background shrink-0">
            <Radio className="h-4 w-4" />
          </div>

          <Link href={`/app/interviews/${session.id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" /> Exit Room
          </Link>

          <SessionPill status="Live" size="sm" />

          <div className="hidden sm:block ml-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight truncate">{candidateName}</h1>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {sessionRole(session)} • Interview #{ref}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 font-mono text-sm font-semibold text-foreground" aria-label="Elapsed time">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatTimer(elapsedMs)}</span>
            {remainingMs !== null && <span className="text-xs font-normal text-muted-foreground">/ {formatTimer(remainingMs)} left</span>}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {room.connection === "connected" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live updates on
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-amber-500" /> Reconnecting…
              </>
            )}
          </div>

          {recording && (
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-muted-foreground" title="Recording is enabled for this interview; the media provider in this environment is a stand-in.">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Recording enabled
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden">
        <div className="lg:col-span-8 h-full overflow-hidden">
          <CandidatePanel
            sessionId={session.id}
            candidateName={candidateName}
            candidateEmail={session.candidate?.email ?? null}
            presence={room.presence}
            degraded={room.degraded}
            calibrating={room.integrity.calibrating}
            calibrationEndsAt={snapshot?.calibrationEndsAt ?? null}
            now={now}
            live
          />
        </div>

        <div className="lg:col-span-4 h-full overflow-hidden">
          <LiveSidebar room={room} canAct={canConductInterview} />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <Shield className={cn("h-4 w-4 shrink-0", room.integrity.calibrating ? "text-muted-foreground" : "text-sage-600 dark:text-sage-400")} />
          <div className="leading-tight hidden sm:block">
            <p className="text-xs font-medium text-foreground">
              Baseline: <span className={room.integrity.calibrating ? "text-muted-foreground" : "text-sage-600 dark:text-sage-400"}>{room.integrity.calibrating ? "Calibrating" : "Monitoring"}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{browserChannels} browser signal{browserChannels === 1 ? "" : "s"} scored</p>
          </div>
        </div>

        <Button variant="destructive" onClick={() => setEndDialogOpen(true)} disabled={!canConductInterview} className="h-10 px-4 text-sm gap-2 rounded-full">
          <PhoneOff className="h-4 w-4" /> End Interview
        </Button>

        <div className="text-xs text-muted-foreground hidden md:block text-right leading-tight shrink-0">
          <p>Session #{ref}</p>
          <p className="text-[11px]">{snapshot?.startedAt ? `Started at ${new Date(snapshot.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</p>
        </div>
      </div>

      <Dialog open={endDialogOpen} onOpenChange={(open) => !ending && setEndDialogOpen(open)}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-terra-600 dark:text-terra-400">
            <PhoneOff className="h-4 w-4" />
            <DialogTitle>End this interview?</DialogTitle>
          </div>
          <DialogDescription>Ending closes the session for the candidate, seals the collected evidence, and starts generating the report. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setEndDialogOpen(false)} disabled={ending}>
            Continue Interview
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEnd} disabled={ending}>
            {ending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "End & seal evidence"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
