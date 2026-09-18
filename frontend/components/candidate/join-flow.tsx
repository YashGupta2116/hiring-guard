"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, Clock, Loader2, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JoinCard, JoinShell } from "./join-shell";
import { PreflightStep } from "./preflight-step";
import { PolicyStep } from "./policy-step";
import { CandidateRoom } from "./candidate-room";
import { ApiError } from "@/lib/api/client";
import { getJoinSummary, type JoinSummary } from "@/lib/candidate/api";
import { stopAllMedia } from "@/lib/candidate/media";
import { clearCandidateSession, loadCandidateSession, saveCandidateSession } from "@/lib/candidate/storage";

type Phase = "loading" | "link-error" | "intro" | "preflight" | "policy" | "declined" | "room";

const LINK_MESSAGES: Record<string, string> = {
  LINK_EXPIRED: "This interview link has expired. Please contact the person who invited you for a new one.",
  LINK_REVOKED: "This interview link is no longer valid. Please contact the person who invited you.",
  LINK_CONSUMED: "This interview link has already been used. If you started the interview in another window, please return to that window.",
  UNAUTHENTICATED: "This interview link isn't valid. Please check the link in your invitation email.",
};

export function JoinFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [summary, setSummary] = useState<JoinSummary | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [preflightId, setPreflightId] = useState<string | null>(null);
  const [candidateToken, setCandidateToken] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    setPhase("loading");
    getJoinSummary(token)
      .then((res) => {
        setSummary(res);
        setPhase("intro");
      })
      .catch((err) => {
        setLinkError(err instanceof ApiError ? (LINK_MESSAGES[err.code] ?? err.message) : "We couldn't reach the interview server. Please check your connection and try again.");
        setPhase("link-error");
      });
  }, [token]);

  useEffect(() => {
    // A candidate who already consented (and reloaded) goes straight back into the interview.
    const stored = loadCandidateSession(token);
    if (stored) {
      setCandidateToken(stored.candidateToken);
      setPhase("room");
      return;
    }
    loadSummary();
  }, [token, loadSummary]);

  // While the waiting room is closed, check again when it opens so the candidate never has to refresh.
  const opensAtIso = summary?.status === "NOT_YET_OPEN" ? summary.opensAt : null;
  useEffect(() => {
    if (phase !== "intro" || !opensAtIso) return;
    const delay = Math.min(Math.max(new Date(opensAtIso).getTime() - Date.now(), 1000), 2_000_000_000);
    const timer = setTimeout(loadSummary, delay);
    return () => clearTimeout(timer);
  }, [phase, opensAtIso, loadSummary]);

  if (phase === "loading") {
    return (
      <JoinShell>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </JoinShell>
    );
  }

  if (phase === "link-error") {
    return (
      <JoinShell>
        <JoinCard title="This link can't be used">
          <div className="flex gap-3 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground leading-relaxed">
            <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p>{linkError}</p>
          </div>
        </JoinCard>
      </JoinShell>
    );
  }

  if (phase === "declined") {
    return (
      <JoinShell>
        <JoinCard title="You've declined this interview">
          <p className="text-sm text-muted-foreground leading-relaxed">No monitoring or recording has started, and this link no longer works. You can close this window.</p>
        </JoinCard>
      </JoinShell>
    );
  }

  if (phase === "intro" && summary) {
    return (
      <JoinShell>
        <JoinCard title={summary.sessionTitle ?? "Your interview"} description={`${summary.orgName} has invited you to an interview.`}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>{summary.interviewerNames.length > 0 ? `With ${summary.interviewerNames.join(", ")}` : "Interviewer to be confirmed"}</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>{summary.scheduledAt ? new Date(summary.scheduledAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }) : "Time to be confirmed"}</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{summary.durationMinutes} minutes</span>
            </div>
          </dl>

          {summary.status === "NOT_YET_OPEN" ? (
            <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
              This interview isn&apos;t open yet.{" "}
              {summary.opensAt ? `You can start the setup checks from ${new Date(summary.opensAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Keep this page open and it will continue automatically.` : "Please come back to this link closer to the start time."}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Next we&apos;ll check your camera, microphone, screen sharing and connection, then show you exactly what is recorded and monitored. You&apos;ll choose whether to proceed.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setPhase("preflight")}>Begin</Button>
              </div>
            </>
          )}
        </JoinCard>
      </JoinShell>
    );
  }

  if (phase === "preflight") {
    return (
      <JoinShell>
        <PreflightStep
          token={token}
          onPassed={(id) => {
            setPreflightId(id);
            setPhase("policy");
          }}
        />
      </JoinShell>
    );
  }

  if (phase === "policy" && preflightId) {
    return (
      <JoinShell wide>
        <PolicyStep
          token={token}
          preflightId={preflightId}
          onNeedPreflight={() => {
            setPreflightId(null);
            setPhase("preflight");
          }}
          onDeclined={() => {
            stopAllMedia();
            setPhase("declined");
          }}
          onAccepted={(candidateJwt, recording) => {
            saveCandidateSession(token, { candidateToken: candidateJwt, recording });
            setCandidateToken(candidateJwt);
            setPhase("room");
          }}
        />
      </JoinShell>
    );
  }

  if (phase === "room" && candidateToken) {
    return (
      <CandidateRoom
        candidateToken={candidateToken}
        onInvalid={() => {
          // The stored candidate token is no longer accepted; start over from the link.
          clearCandidateSession(token);
          setCandidateToken(null);
          loadSummary();
        }}
        onFinished={() => clearCandidateSession(token)}
      />
    );
  }

  return null;
}
