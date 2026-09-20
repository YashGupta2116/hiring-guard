"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/auth/role-guard";
import { ApiError } from "@/lib/api/client";
import { getSession, sessionCandidateName, type ApiSession } from "@/lib/api/sessions";
import { getPipelineStatus, recomputeReport, type PipelineStatus, type PipelineStepName } from "@/lib/api/reports";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, FileText, Loader2, MinusCircle, Radio, Shield, XCircle } from "lucide-react";

const POLL_MS = 2500;
/** After this long with no pipeline activity, remind the user that a background worker does this work. */
const WORKER_HINT_AFTER_MS = 20_000;

/** In the order the report is built. */
const STEPS: { step: PipelineStepName; label: string }[] = [
  { step: "SEAL_VERIFY", label: "Verifying the evidence chain and its signature" },
  { step: "TRANSCRIPT_FINALIZE", label: "Finalizing the transcript" },
  { step: "INTEGRITY_RESCORE", label: "Recomputing the integrity score from stored evidence" },
  { step: "CODE_EVALUATE", label: "Evaluating the coding round" },
  { step: "MEDIA_INDEX", label: "Linking evidence to the recording timeline, if there is a recording" },
  { step: "ANSWER_GRADING", label: "Grading answers" },
  { step: "COMPOSITE_SCORE", label: "Combining the scores" },
  { step: "RENDER_REPORT", label: "Rendering the report" },
];

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const { canConductInterview } = usePermissions();

  const [session, setSession] = useState<ApiSession | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [waitedMs, setWaitedMs] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setWaitedMs(0);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const sess = await getSession(id);
        if (cancelled) return;
        setSession(sess);
        setError(null);
        setNotFound(false);

        let run: PipelineStatus | null = null;
        try {
          run = await getPipelineStatus(id);
        } catch (err) {
          // 404 just means the run hasn't been created yet; anything else is a real error.
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
        if (cancelled) return;
        setPipeline(run);
        setWaitedMs(Date.now() - startedAt);

        const finished = run !== null && run.status !== "RUNNING" && sess.reportId !== null;
        const stillLive = sess.status === "LIVE" || ["DRAFT", "CONFIGURED", "ARMED", "ADMITTED", "ABORTED", "EXPIRED"].includes(sess.status);
        if (!finished && !stillLive) timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Couldn't load the processing status.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, reloadKey]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await recomputeReport(id);
      toast({ title: "Report rebuild started", type: "info" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't restart processing", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setRetrying(false);
    }
  };

  if (loading) return <LoadingState variant="detail" />;

  if (notFound) {
    return (
      <EmptyState
        icon={Radio}
        title="Interview Not Found"
        description="This interview doesn't exist or you aren't assigned to it."
        actionLabel="Back to Interviews"
        onAction={() => router.push("/app/interviews")}
      />
    );
  }

  if (error || !session) return <ErrorState title="Couldn't load processing status" description={error ?? undefined} onRetry={reload} />;

  const name = sessionCandidateName(session);

  // A session that isn't in the post-interview phase has nothing to process.
  if (["DRAFT", "CONFIGURED", "ARMED", "ADMITTED", "LIVE", "ABORTED", "EXPIRED"].includes(session.status)) {
    const live = session.status === "LIVE";
    return (
      <EmptyState
        icon={Radio}
        title={live ? "This interview is still live" : "There is nothing to process"}
        description={live ? "Processing starts once the interview has ended." : "This interview never reached the point where a report is produced."}
        actionLabel={live ? "Open the live room" : "Back to the interview"}
        onAction={() => router.push(live ? `/app/interviews/${id}/live` : `/app/interviews/${id}`)}
      />
    );
  }

  const stepState = new Map(pipeline?.steps.map((s) => [s.step, s]) ?? []);
  const runStatus = pipeline?.status ?? null;
  const done = runStatus !== null && runStatus !== "RUNNING" && session.reportId !== null;
  const failed = runStatus === "FAILED";
  const degraded = runStatus === "DEGRADED";
  const failedSteps = STEPS.filter((s) => stepState.get(s.step)?.status === "FAILED");
  const showWorkerHint = !done && !failed && waitedMs > WORKER_HINT_AFTER_MS && (pipeline === null || pipeline.steps.every((s) => s.status === "PENDING"));

  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center py-12 px-4 max-w-lg mx-auto text-center animate-fade-in-up">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card text-foreground">
        <Shield className="h-7 w-7" />
      </div>

      <div className="mb-2">
        <Badge variant="outline" size="sm" className="text-[10px]">
          {done ? (degraded ? "Report ready (partial)" : "Report ready") : failed ? "Processing failed" : "Processing"}
        </Badge>
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground">{done ? "Your report is ready" : failed ? "The report couldn't be completed" : "Preparing the report"}</h1>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm leading-relaxed">
        {done ? `The evidence for ${name} has been verified and scored.` : `Verifying and scoring the collected evidence for ${name}. This page updates by itself.`}
      </p>

      <div className="mt-6 w-full rounded-lg border border-border bg-card p-4 text-left space-y-3" aria-label="Pipeline steps">
        {STEPS.map(({ step, label }) => {
          const s = stepState.get(step);
          const status = s?.status ?? "PENDING";
          return (
            <div key={step} className={`flex items-start gap-2.5 text-xs ${status === "PENDING" ? "text-muted-foreground/60" : "text-foreground"}`}>
              <div className="flex h-4 w-4 shrink-0 items-center justify-center mt-0.5">
                {status === "SUCCEEDED" && <CheckCircle2 className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" />}
                {status === "RUNNING" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {status === "FAILED" && <XCircle className="h-3.5 w-3.5 text-terra-500" />}
                {status === "SKIPPED" && <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                {status === "PENDING" && <Circle className="h-2.5 w-2.5 text-muted-foreground/40" />}
              </div>
              <div className="min-w-0">
                <span className={status === "RUNNING" ? "font-semibold" : ""}>{label}</span>
                {s && s.attempts > 1 && <span className="ml-1.5 text-[10px] text-muted-foreground">(attempt {s.attempts})</span>}
                {status === "FAILED" && s?.error && <p className="mt-0.5 text-[11px] text-terra-600 dark:text-terra-400 break-words">{s.error}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {showWorkerHint && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Nothing has started yet. Reports are built by the background worker, so if this doesn&apos;t move, check that it is running (<code className="font-mono">npm run worker</code> in the backend).</p>
        </div>
      )}

      {degraded && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          The report was delivered, but {failedSteps.length > 0 ? failedSteps.map((s) => s.label.toLowerCase()).join("; ") : "some steps"} did not complete, so parts of it are missing.
        </div>
      )}

      <div className="mt-6 flex items-center gap-2.5">
        {done && session.reportId && (
          <Button size="sm" onClick={() => router.push(`/app/reports/${session.reportId}`)} className="gap-1.5 text-xs h-8">
            <FileText className="h-3.5 w-3.5" /> View Report <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {(failed || degraded) && canConductInterview && (
          <Button size="sm" variant="outline" onClick={handleRetry} isLoading={retrying} className="text-xs h-8">
            Rebuild report
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => router.push(`/app/interviews/${id}`)} className="text-xs h-8">
          Interview details
        </Button>
      </div>
    </div>
  );
}
