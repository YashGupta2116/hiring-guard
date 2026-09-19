"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { IntegrityGauge } from "@/components/ui/integrity-gauge";
import { FlagTimeline } from "@/components/reports/flag-timeline";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/auth/role-guard";
import { ApiError } from "@/lib/api/client";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import { getSession, listSessionNotes, type ApiSession, type SessionNote } from "@/lib/api/sessions";
import {
  compositeReasons,
  fetchReportHtml,
  fetchReportPdf,
  getReport,
  integrityBand,
  recomputeReport,
  reportStatus,
  verifyEvidence,
  type EvidenceVerification,
  type ReportDetail,
} from "@/lib/api/reports";
import { getSessionCode, type SessionCodeTask } from "@/lib/live/api";
import { ArrowLeft, AlertTriangle, CheckCircle2, Code, Download, ExternalLink, FileText, MessageSquare, RefreshCw, Share2, Shield, ShieldCheck, Trophy, User, XCircle } from "lucide-react";

type TabKey = "overview" | "answers" | "flags" | "evidence" | "notes";

const GRADE_LABEL: Record<string, string> = {
  correctness: "Correctness",
  depth: "Depth",
  specificity: "Specificity",
  structure: "Structure",
  handsOn: "Hands-on",
};

const scoreText = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

function ScoreCard({ icon, tone, label, value, note, bar }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string; bar: number | null }) {
  return (
    <div className="p-4 space-y-2">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${tone}`}>{icon}</div>
      <span className="text-[10px] font-mono font-medium text-muted-foreground block uppercase tracking-widest">{label}</span>
      <div className="font-serif text-3xl sm:text-4xl text-foreground font-normal tracking-tight">{value}</div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">{bar !== null && <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(Math.max(bar, 0), 100)}%` }} />}</div>
      <span className="text-[10px] text-muted-foreground block">{note}</span>
    </div>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const { canConductInterview } = usePermissions();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [code, setCode] = useState<SessionCodeTask[] | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notes, setNotes] = useState<SessionNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [verification, setVerification] = useState<EvidenceVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReport(id)
      .then((res) => {
        if (cancelled) return;
        setReport(res);
        setError(null);
        setNotFound(false);
        getSession(res.sessionId)
          .then((s) => !cancelled && setSession(s))
          .catch(() => undefined); // Only used for interviewer names on notes.
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Something went wrong while loading this report.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Secondary data loads when its tab is first opened.
  const sessionId = report?.sessionId ?? null;
  useEffect(() => {
    if (!sessionId) return;
    if (activeTab === "answers" && code === null && !codeError) {
      getSessionCode(sessionId)
        .then(setCode)
        .catch((err) => setCodeError(err instanceof ApiError ? err.message : "Couldn't load the candidate's code."));
    }
    if (activeTab === "notes" && notes === null && !notesError) {
      listSessionNotes(sessionId)
        .then(setNotes)
        .catch((err) => setNotesError(err instanceof ApiError ? err.message : "Couldn't load notes."));
    }
  }, [activeTab, sessionId, code, codeError, notes, notesError]);

  if (loading) return <LoadingState variant="detail" />;

  if (notFound) {
    return (
      <EmptyState
        icon={FileText}
        title="Report Not Found"
        description="This report doesn't exist, or you don't have access to it."
        actionLabel="Return to Reports"
        onAction={() => router.push("/app/reports")}
      />
    );
  }

  if (error || !report) return <ErrorState title="Couldn't load this report" description={error ?? undefined} onRetry={reload} />;

  const { scores, session: sess } = report;
  const cand = sess.candidate;
  const name = cand?.name?.trim() || cand?.email || "No candidate";
  const band = integrityBand(scores.integrity);
  const status = reportStatus(scores, report.degraded);
  const reasons = compositeReasons(scores);
  const flags = report.model.flags;
  const counted = flags.filter((f) => f.status !== "DISMISSED" && f.status !== "SUPERSEDED" && !f.supersededByReview);
  const pointsLost = counted.reduce((sum, f) => sum + f.scoreDelta, 0);
  const authorName = (authorId: string) => session?.interviewers.find((i) => i.userId === authorId)?.name ?? "Team member";

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Report link copied", description: "Only people with access to this workspace can open it.", type: "success" });
    } catch {
      toast({ title: "Couldn't copy the link", type: "error" });
    }
  };

  const handleOpenHtml = async () => {
    const win = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await fetchReportHtml(report.id));
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      toast({ title: "Couldn't open the report", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  const handlePdf = async () => {
    try {
      const url = URL.createObjectURL(await fetchReportPdf(report.id));
      const a = document.createElement("a");
      a.href = url;
      a.download = `veritrust-report-${report.id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast({ title: "Couldn't download the PDF", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      setVerification(await verifyEvidence(report.sessionId));
    } catch (err) {
      toast({ title: "Couldn't verify the evidence", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setVerifying(false);
    }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    const before = report.updatedAt;
    try {
      await recomputeReport(report.sessionId);
      toast({ title: "Rebuilding the report", description: "This uses the latest flag decisions. It takes a few seconds.", type: "info" });
      for (let i = 0; i < 40 && mounted.current; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await getReport(id);
        if (fresh.updatedAt !== before) {
          if (mounted.current) {
            setReport(fresh);
            setVerification(null);
            toast({ title: "Report updated", type: "success" });
          }
          return;
        }
      }
      toast({ title: "Still rebuilding", description: "It hasn't finished yet. Check that the background worker is running.", type: "info" });
    } catch (err) {
      toast({ title: "Couldn't rebuild the report", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      if (mounted.current) setRecomputing(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Score Overview" },
    { key: "answers", label: `Answers & Code (${report.model.qaPairs.length})` },
    { key: "flags", label: `Flags (${flags.length})` },
    { key: "evidence", label: "Evidence & Method" },
    { key: "notes", label: "Interview Notes" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in-up pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/app/reports" className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Reports
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold font-mono">#{report.id.slice(-8)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleShare} className="h-7.5 gap-1.5 text-xs">
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          {report.htmlAvailable && (
            <Button size="sm" variant="outline" onClick={handleOpenHtml} className="h-7.5 gap-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> Full report
            </Button>
          )}
          {report.pdfAvailable && (
            <Button size="sm" variant="outline" onClick={handlePdf} className="h-7.5 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
          )}
          {canConductInterview && (
            <Button size="sm" variant="outline" onClick={handleRecompute} isLoading={recomputing} className="h-7.5 gap-1.5 text-xs" title="Rebuild the report from the stored evidence and the current flag decisions">
              <RefreshCw className="h-3.5 w-3.5" /> Rebuild
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <CandidateAvatar src={cand ? candidateAvatarUrl(cand) : undefined} name={name} size="xl" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-3xl font-normal text-foreground">{name}</h1>
                {band && <StatusBadge status={band} size="sm" />}
                <span
                  className={
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                    (status === "Ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400")
                  }
                >
                  {status}
                </span>
              </div>
              <p className="text-xs font-medium text-foreground">{sess.title ?? "Untitled interview"}</p>
              <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3 font-mono">
                <span>Evaluated: {new Date(sess.startedAt ?? report.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                {sess.interviewerName && (
                  <>
                    <span>•</span>
                    <span>Interviewer: {sess.interviewerName}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {cand && (
            <Link href={`/app/candidates/${cand.id}`}>
              <Button size="sm" variant="outline" className="text-xs h-7.5 gap-1.5">
                <User className="h-3.5 w-3.5" /> Candidate Profile
              </Button>
            </Link>
          )}
        </div>
      </div>

      {report.degraded && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            This report is partial: {report.lostSteps.map((s) => s.toLowerCase().replace(/_/g, " ")).join(", ")} did not complete. Use Rebuild to try again.
          </p>
        </div>
      )}

      <div className="flex items-center gap-6 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap pb-3 text-sm transition-colors border-b-2 -mb-px ${activeTab === tab.key ? "border-foreground text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 rounded-lg border border-border bg-card divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
            <ScoreCard
              icon={<Trophy className="h-4 w-4" />}
              tone="bg-amber-100/60 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400"
              label="Overall Score"
              value={scores.composite === null ? "—" : `${Math.round(scores.composite)}`}
              note={scores.composite === null ? "Not available for this interview" : "Composite of the three scores"}
              bar={scores.composite}
            />
            <ScoreCard icon={<Code className="h-4 w-4" />} tone="bg-blue-100/60 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400" label="Technical" value={scoreText(scores.technical)} note={scores.technical === null ? "Nothing technical was scored" : "Answers and hidden tests"} bar={scores.technical} />
            <ScoreCard icon={<MessageSquare className="h-4 w-4" />} tone="bg-purple-100/60 text-purple-700 dark:bg-purple-900/25 dark:text-purple-400" label="Communication" value={scoreText(scores.communication)} note={scores.communication === null ? "No graded answers" : "Structure and specificity"} bar={scores.communication} />
            <div className="p-3 flex flex-col items-center justify-center text-center">
              <IntegrityGauge score={scores.integrity === null ? null : Math.round(scores.integrity)} status={scores.integrity === null ? "down" : "score"} size="sm" />
            </div>
          </div>

          {scores.composite === null && (
            <div className="rounded-lg border border-border bg-card p-4 text-xs space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> No overall score, so a person should review this report
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {reasons.length > 0 ? `An overall score needs all three inputs, but ${reasons.join("; ")}.` : "An overall score could not be produced."} HiringGuard never guesses a number when an input is missing.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <SectionHeader title="Integrity summary" description="Recomputed from the stored evidence after the interview ended.">
              {band && <StatusBadge status={band} size="sm" />}
            </SectionHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { label: "Flags raised", value: flags.length },
                { label: "High severity", value: report.model.scores.flagCounts.HIGH },
                { label: "Medium severity", value: report.model.scores.flagCounts.MEDIUM },
                { label: "Points lost", value: `−${(Math.round(pointsLost * 10) / 10).toFixed(1)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border bg-secondary/20 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-xl font-serif text-foreground">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>How to read this score</span>
              </div>
              <p className="text-[11px] leading-relaxed">The integrity score reflects how consistent the candidate&apos;s observed behaviour was with a normal interview. It does not establish intent. Flags are prompts for a person to look, and any flag you dismissed is excluded from this score.</p>
            </div>

            <button type="button" onClick={() => setActiveTab("flags")} className="text-xs font-medium text-foreground underline">
              See every flag with its timing →
            </button>
          </div>
        </>
      )}

      {activeTab === "answers" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <SectionHeader title="Coding round" description="Hidden-test results and how the code was written." />
            {report.model.codeEvaluations.length === 0 ? (
              <p className="text-xs text-muted-foreground">This interview had no coding task.</p>
            ) : (
              <div className="grid gap-2">
                {report.model.codeEvaluations.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border border-border/80 bg-secondary/15 p-3 text-xs">
                    <span className="text-foreground font-medium">Task {i + 1}</span>
                    <span className="text-muted-foreground">{c.hiddenTotal > 0 ? `Hidden tests: ${c.hiddenPassed}/${c.hiddenTotal} passed` : "No hidden tests ran"}</span>
                    <span className="text-muted-foreground">Typed ratio: {c.typedRatio === null ? "—" : `${Math.round(c.typedRatio * 100)}%`}</span>
                    <span className="text-muted-foreground">Burst rate: {c.burstRate === null ? "—" : c.burstRate.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {codeError && <p className="text-xs text-red-600 dark:text-red-400">{codeError}</p>}
            {code?.map((task) => {
              const last = task.snapshots[task.snapshots.length - 1];
              return (
                <div key={task.taskId} className="space-y-1.5">
                  {task.runner === "mock" && (
                    <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                      The demo runner was used, so it did not execute this code. Its test results are not a real evaluation.
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{task.title}</span>
                    <span className="text-muted-foreground">{task.frozen ? "Submitted" : "Not submitted"}</span>
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-[#18181b] p-3 text-[12px] leading-relaxed text-zinc-100 font-mono whitespace-pre-wrap">{last ? last.content : "No code was captured."}</pre>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <SectionHeader title="Question-by-question evaluation" description="Each answer graded on five dimensions.">
              <span className="text-xs text-muted-foreground font-mono">{report.model.qaPairs.length} answers</span>
            </SectionHeader>
            {report.model.qaPairs.length === 0 ? (
              <p className="text-xs text-muted-foreground leading-relaxed">No answers were graded. Grading works from the interview transcript, and no speech-to-text service was connected for this interview.</p>
            ) : (
              report.model.qaPairs.map((q, idx) => (
                <div key={idx} className="rounded-md border border-border/80 bg-secondary/15 p-4 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                    <h3 className="font-semibold text-foreground">
                      {idx + 1}. {q.question}
                    </h3>
                    {q.topic && (
                      <Badge variant="outline" size="sm" className="text-[10px] shrink-0">
                        {q.topic}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground leading-relaxed bg-card p-2.5 rounded border border-border/60">{q.answer}</p>
                  {q.grade ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {(["correctness", "depth", "specificity", "structure", "handsOn"] as const).map((k) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="w-20 text-muted-foreground">{GRADE_LABEL[k]}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(q.grade![k], 100)}%` }} />
                            </div>
                            <span className="w-8 text-right font-mono text-[11px] text-foreground">{Math.round(q.grade![k])}</span>
                          </div>
                        ))}
                      </div>
                      {q.grade.strengths.length > 0 && (
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Strengths: </span>
                          {q.grade.strengths.join("; ")}
                        </p>
                      )}
                      {q.grade.concerns.length > 0 && (
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Concerns: </span>
                          {q.grade.concerns.join("; ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground italic">This answer was not graded.</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "flags" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <SectionHeader title="Flags and evidence timeline" description="Every flag raised during the interview, in order, with what it cost the integrity score.">
            <span className="text-[10px] text-muted-foreground font-mono">{flags.length} logged</span>
          </SectionHeader>
          <FlagTimeline flags={flags} startedAt={sess.startedAt} />
        </div>
      )}

      {activeTab === "evidence" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <SectionHeader title="Evidence integrity" description="The interview's evidence is chained and signed when it ends. Verifying re-checks both against what is stored." />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleVerify} isLoading={verifying} className="gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" /> Verify evidence now
              </Button>
              {verification && <span className="text-[11px] text-muted-foreground">Checked {new Date(verification.verifiedAt).toLocaleTimeString("en-US")}</span>}
            </div>
            {verification && (
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                {[
                  { label: "Hash chain", ok: verification.chainValid, detail: `${verification.lastSeq} events, gapless and unmodified` },
                  { label: "Signed manifest", ok: verification.signatureValid, detail: "Signature matches the stored manifest" },
                ].map((c) => (
                  <div key={c.label} className={`flex items-start gap-2 rounded-md border p-3 ${c.ok ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20"}`}>
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                    <div>
                      <p className="font-medium text-foreground">
                        {c.label}: {c.ok ? "valid" : "FAILED"}
                      </p>
                      <p className="text-muted-foreground">{c.ok ? c.detail : verification.firstBrokenSeq !== null ? `First broken at event ${verification.firstBrokenSeq}` : "Does not match what was sealed"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(verification?.chainHead ?? report.methodology.chainHead) && (
              <p className="text-[11px] text-muted-foreground break-all">
                Chain head: <span className="font-mono">{verification?.chainHead ?? report.methodology.chainHead}</span>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-3 text-xs">
            <SectionHeader title="Method" description="What produced these numbers." />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Detector version</dt>
                <dd className="font-mono text-foreground">{report.methodology.detectorVersion}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Scoring weights version</dt>
                <dd className="font-mono text-foreground">{report.methodology.weightsVersion}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Report generated</dt>
                <dd className="text-foreground">{new Date(report.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Evidence events</dt>
                <dd className="font-mono text-foreground">{report.methodology.lastSeq ?? "—"}</dd>
              </div>
            </dl>

            <div className="pt-2 border-t border-border/60 space-y-1">
              <h4 className="font-semibold text-foreground">Windows that were not scored</h4>
              {report.methodology.unscoredWindows.length === 0 ? (
                <p className="text-muted-foreground">Every channel was scored for the whole interview.</p>
              ) : (
                <ul className="space-y-1">
                  {report.methodology.unscoredWindows.map((w, i) => (
                    <li key={i} className="text-muted-foreground">
                      {w.channel.toLowerCase()} — {w.reason.toLowerCase().replace(/_/g, " ")} ({new Date(w.startTs).toLocaleTimeString("en-US")}
                      {w.endTs ? ` to ${new Date(w.endTs).toLocaleTimeString("en-US")}` : ""})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {report.methodology.supersededFlags.length > 0 && (
              <p className="text-muted-foreground pt-2 border-t border-border/60">{report.methodology.supersededFlags.length} flag(s) were superseded by a later review and excluded from scoring.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "notes" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3 text-xs">
          <SectionHeader title="Interviewer notes" description="Private notes taken during the interview." />
          {notesError ? (
            <p className="text-red-600 dark:text-red-400">{notesError}</p>
          ) : notes === null ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-muted-foreground italic">No notes were taken.</p>
          ) : (
            <div className="space-y-2.5">
              {notes.map((n) => (
                <div key={n.id} className="rounded-md border border-border/70 bg-secondary/20 p-3 leading-relaxed">
                  <p className="whitespace-pre-wrap text-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {authorName(n.authorId)} • {new Date(n.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
