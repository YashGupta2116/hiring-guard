"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { JoinCard } from "./join-shell";
import { ApiError } from "@/lib/api/client";
import { getPolicy, submitConsent, type Policy } from "@/lib/candidate/api";

interface PolicyStepProps {
  token: string;
  preflightId: string;
  onAccepted: (candidateToken: string, recording: Policy["recording"]) => void;
  onDeclined: () => void;
  /** The system check is stale or was never passed; send the candidate back to it. */
  onNeedPreflight: () => void;
}

export function PolicyStep({ token, preflightId, onAccepted, onDeclined, onNeedPreflight }: PolicyStepProps) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoadError(null);
    getPolicy(token)
      .then((p) => {
        setPolicy(p);
        setScrolledToEnd(false);
        setAgreed(false);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load the interview policy."));
  }, [token]);

  useEffect(load, [load]);

  const checkScroll = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
  }, []);

  // A short policy that fits without scrolling counts as fully read.
  useEffect(() => {
    if (policy) checkScroll();
  }, [policy, checkScroll]);

  const respond = async (accepted: boolean) => {
    if (!policy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitConsent(token, { preflightId, policyHash: policy.policyHash, accepted });
      if ("ended" in result) {
        onDeclined();
      } else {
        onAccepted(result.candidateToken, policy.recording);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "POLICY_CHANGED") {
        setError("The interview's monitoring policy was updated. Please read it again before continuing.");
        load();
      } else if (err instanceof ApiError && err.code === "PREFLIGHT_REQUIRED") {
        onNeedPreflight();
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorState title="Couldn't load the policy" description={loadError} onRetry={load} />;
  if (!policy) return <p className="text-sm text-muted-foreground text-center">Loading…</p>;

  return (
    <JoinCard title="Before you begin" description="Please read exactly what will be recorded and monitored during this interview.">
      <div
        ref={boxRef}
        onScroll={checkScroll}
        tabIndex={0}
        aria-label="Interview monitoring policy"
        className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-4 space-y-3 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4" /> What we collect
        </div>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
          {policy.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground pt-1">
          <Shield className="h-4 w-4" /> Who can see it
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{policy.viewers}.</p>
      </div>

      {!scrolledToEnd && <p className="text-xs text-muted-foreground">Scroll to the end to continue.</p>}

      <label className={`flex items-start gap-2.5 text-sm ${scrolledToEnd ? "text-foreground cursor-pointer" : "text-muted-foreground/60"}`}>
        <input type="checkbox" className="mt-1 h-4 w-4" checked={agreed} disabled={!scrolledToEnd} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I have read this and consent to the recording and monitoring described above.</span>
      </label>

      {error && (
        <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" onClick={() => setConfirmDecline(true)} disabled={busy} className="text-muted-foreground">
          Decline
        </Button>
        <Button onClick={() => respond(true)} disabled={!agreed || !scrolledToEnd} isLoading={busy}>
          I consent — join interview
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={setConfirmDecline}
        title="Decline and leave?"
        description="If you decline, this interview will be cancelled and this link will stop working."
        confirmText="Decline"
        variant="destructive"
        onConfirm={() => respond(false)}
      />
    </JoinCard>
  );
}
