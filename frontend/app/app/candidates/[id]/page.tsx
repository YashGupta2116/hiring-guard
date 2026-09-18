"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { usePermissions } from "@/components/auth/role-guard";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { useToast } from "@/components/ui/toast";
import {
  CANDIDATE_STATUSES,
  candidateAvatarUrl,
  candidateDisplayName,
  candidateStatusLabel,
  getCandidate,
  updateCandidate,
  type CandidateDetail,
  type CandidateStatusCode,
} from "@/lib/api/candidates";
import { ApiError } from "@/lib/api/client";
import { sessionStatusLabel } from "@/lib/api/session-status";
import {
  Users,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "history" | "reports" | "competencies" | "notes";

const COMPETENCY_LABEL: Record<string, string> = {
  correctness: "Correctness",
  depth: "Depth of reasoning",
  specificity: "Specificity",
  structure: "Answer structure",
  handsOn: "Hands-on experience",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function scoreText(composite: number | null, reviewRequired: boolean): string {
  if (composite !== null) return `${Math.round(composite)}/100`;
  return reviewRequired ? "Review required" : "Pending";
}

export default function CandidateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { canManageCandidates } = usePermissions();
  const { toast } = useToast();

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCandidate(id)
      .then((res) => {
        if (cancelled) return;
        setCandidate(res);
        setNotesDraft(res.notes ?? "");
        setError(null);
        setNotFound(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Something went wrong while loading this candidate.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const handleStatusChange = async (status: CandidateStatusCode) => {
    if (!candidate || status === candidate.status) return;
    setSavingStatus(true);
    try {
      const saved = await updateCandidate(candidate.id, { status });
      setCandidate({ ...candidate, status: saved.status });
      toast({ title: "Stage updated", description: `Moved to ${candidateStatusLabel(saved.status)}.`, type: "success" });
    } catch (err) {
      toast({ title: "Couldn't update stage", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!candidate) return;
    setSavingNotes(true);
    try {
      const saved = await updateCandidate(candidate.id, { notes: notesDraft.trim() === "" ? null : notesDraft });
      setCandidate({ ...candidate, notes: saved.notes });
      setNotesDraft(saved.notes ?? "");
      toast({ title: "Notes saved", type: "success" });
    } catch (err) {
      toast({ title: "Couldn't save notes", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) return <LoadingState variant="detail" />;

  if (notFound) {
    return (
      <EmptyState
        icon={Users}
        title="Candidate Profile Not Found"
        description="The requested candidate does not exist in your workspace."
        actionLabel="Back to Candidates"
        onAction={() => router.push("/app/candidates")}
      />
    );
  }

  if (error || !candidate) {
    return <ErrorState title="Couldn't load this candidate" description={error ?? undefined} onRetry={reload} />;
  }

  const displayName = candidateDisplayName(candidate);
  const reportSessions = candidate.sessions.filter((s) => s.report !== null);
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Score Overview" },
    { key: "history", label: `Interview History (${candidate.sessions.length})` },
    { key: "reports", label: `Reports (${reportSessions.length})` },
    { key: "competencies", label: "Strengths & Weaknesses" },
    { key: "notes", label: "Evaluator Notes" },
  ];

  const notesChanged = notesDraft !== (candidate.notes ?? "");

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in-up pb-12">
      {/* 1. Top Navigation & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/app/candidates"
          className="inline-flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Candidates</span>
        </Link>

        {canManageCandidates && (
          <Button
            onClick={() => setScheduleOpen(true)}
            className="h-9 px-3.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Schedule interview</span>
          </Button>
        )}
      </div>

      {/* 2. Candidate Profile Header Card */}
      <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <CandidateAvatar src={candidateAvatarUrl(candidate)} name={displayName} size="xl" />

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{displayName}</h1>
                {canManageCandidates ? (
                  <select
                    aria-label="Candidate stage"
                    value={candidate.status}
                    disabled={savingStatus}
                    onChange={(e) => handleStatusChange(e.target.value as CandidateStatusCode)}
                    className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 cursor-pointer disabled:opacity-60"
                  >
                    {CANDIDATE_STATUSES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge status={candidateStatusLabel(candidate.status)} size="sm" />
                )}
              </div>

              <p className="text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-300">{candidate.appliedRole ?? "No role specified"}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-stone-400" />
                  <span>{candidate.email}</span>
                </span>
                {candidate.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-stone-400" />
                    <span>{candidate.phone}</span>
                  </span>
                )}
                {candidate.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    <span>{candidate.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 sm:gap-10 border-t lg:border-t-0 lg:border-l border-stone-200/80 dark:border-stone-800 pt-4 lg:pt-0 lg:pl-10 text-center shrink-0">
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">
                {candidate.averageScore !== null ? `${Math.round(candidate.averageScore)}%` : "—"}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">Avg Score</span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">{candidate.interviewsTaken}</span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">Rounds</span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">
                {candidate.experienceYears !== null ? `${candidate.experienceYears}y` : "—"}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">Experience</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Navigation Underline Tabs */}
      <div className="flex items-center gap-6 border-b border-stone-200 dark:border-stone-800 text-xs sm:text-sm font-medium overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
              activeTab === tab.key
                ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Score Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Candidate Background & Summary</h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              {candidate.bio || "No background summary has been added for this candidate."}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 mr-1">Skills:</span>
              {candidate.skills.length === 0 ? (
                <span className="text-xs text-stone-500 dark:text-stone-400">None listed</span>
              ) : (
                candidate.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 px-3 py-1 text-xs font-medium"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Answer Quality Comparison</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Graded interview answers vs. the average across your organisation
                </p>
              </div>

              <div className="flex items-center gap-5 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-stone-900 dark:bg-stone-100" />
                  <span>Candidate</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#B8AC94] dark:bg-stone-500" />
                  <span>Organisation average</span>
                </div>
              </div>
            </div>

            {candidate.competencies.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 italic text-center py-6">
                No graded answers yet. Scores appear here once an interview has been completed and processed.
              </p>
            ) : (
              <div className="space-y-4 pt-2">
                {candidate.competencies.map((item) => (
                  <div key={item.skill} className="flex items-center gap-3 sm:gap-4">
                    <div className="w-32 sm:w-44 text-right text-xs font-medium text-stone-700 dark:text-stone-300 shrink-0 leading-tight">
                      {COMPETENCY_LABEL[item.skill] ?? item.skill}
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 sm:h-3 rounded-full bg-stone-900 dark:bg-stone-100 transition-all duration-500 shrink-0"
                          style={{ width: `${(Math.min(item.score, 100) / 100) * 85}%` }}
                        />
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100 shrink-0">{Math.round(item.score)}%</span>
                      </div>

                      {item.benchmark !== null && (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 sm:h-3 rounded-full bg-[#B8AC94] dark:bg-stone-500 transition-all duration-500 shrink-0"
                            style={{ width: `${(Math.min(item.benchmark, 100) / 100) * 85}%` }}
                          />
                          <span className="text-[11px] text-stone-500 dark:text-stone-400 shrink-0">{Math.round(item.benchmark)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Interview History */}
      {activeTab === "history" && (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-2xs animate-fade-in-up">
          {candidate.sessions.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 italic p-6 text-center">No interview sessions recorded yet.</p>
          ) : (
            candidate.sessions.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">{item.title ?? "Untitled interview"}</span>
                    {item.interviewType && (
                      <Badge variant="outline" size="sm" className="text-[10px]">
                        {item.interviewType.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                    <StatusBadge status={sessionStatusLabel(item.status)} size="sm" />
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {formatWhen(item.startedAt ?? item.scheduledAt)} ({item.durationMinutes}m)
                    {item.interviewerName ? ` • Interviewer: ${item.interviewerName}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.report && (
                    <Link href={`/app/reports/${item.report.id}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1">
                        <FileText className="h-3 w-3" /> Report
                      </Button>
                    </Link>
                  )}
                  <Link href={`/app/interviews/${item.id}`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2.5">
                      Session Details
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Reports */}
      {activeTab === "reports" && (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-2xs animate-fade-in-up">
          {reportSessions.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 italic p-6 text-center">No reports generated yet.</p>
          ) : (
            reportSessions.map((s) => (
              <Link
                key={s.report!.id}
                href={`/app/reports/${s.report!.id}`}
                className="flex items-center justify-between p-4 hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">{s.title ?? "Interview"} report</span>
                    {s.report!.degraded && (
                      <Badge variant="outline" size="sm" className="text-[10px]">
                        Partial
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {formatWhen(s.startedAt ?? s.scheduledAt)}
                    {s.interviewerName ? ` • Interviewer: ${s.interviewerName}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {scoreText(s.report!.composite, s.report!.reviewRequired)}
                    </span>
                    <span className="text-[10px] text-stone-400 block">
                      {s.report!.integrity !== null ? `${Math.round(s.report!.integrity)}% Integrity` : "Integrity pending"}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-stone-400" />
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Strengths & Weaknesses (aggregated from graded answers) */}
      {activeTab === "competencies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-3 shadow-2xs">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block">Validated Strengths</span>
            {candidate.strengths.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 italic">Nothing recorded yet. Strengths come from graded interview answers.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {candidate.strengths.map((str) => (
                  <li key={str} className="flex items-start gap-2 text-stone-600 dark:text-stone-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-3 shadow-2xs">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 block">Identified Development Areas</span>
            {candidate.concerns.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 italic">Nothing recorded yet. Concerns come from graded interview answers.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {candidate.concerns.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-stone-600 dark:text-stone-300">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Evaluator Notes */}
      {activeTab === "notes" && (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-3 shadow-2xs text-xs animate-fade-in-up">
          <span className="font-semibold text-stone-900 dark:text-stone-100 block">Evaluator Notes</span>
          {canManageCandidates ? (
            <>
              <textarea
                aria-label="Evaluator notes"
                rows={6}
                maxLength={5000}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Write observations that should travel with this candidate..."
                className="w-full resize-y rounded-xl border border-stone-200/70 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-4 text-stone-700 dark:text-stone-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
              <div className="flex items-center justify-end gap-3">
                <span className="text-[11px] text-stone-400">{notesDraft.length}/5000</span>
                <Button size="sm" onClick={handleSaveNotes} disabled={!notesChanged || savingNotes} isLoading={savingNotes} className="text-xs">
                  Save notes
                </Button>
              </div>
            </>
          ) : (
            <p className="text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-4 rounded-xl border border-stone-200/70 dark:border-stone-700 whitespace-pre-wrap">
              {candidate.notes || "No notes recorded yet."}
            </p>
          )}
        </div>
      )}

      <ScheduleModal open={scheduleOpen} onOpenChange={setScheduleOpen} defaultCandidateId={candidate.id} onCreated={reload} />
    </div>
  );
}
