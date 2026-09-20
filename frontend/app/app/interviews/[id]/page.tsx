"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InterviewLinkCard } from "@/components/interviews/interview-link-card";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/auth/role-guard";
import { useCurrentUser } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { candidateAvatarUrl, candidateDisplayName, getCandidate, listCandidates, type CandidateDetail, type DirectoryCandidate } from "@/lib/api/candidates";
import { memberAvatarUrl } from "@/lib/api/org";
import {
  addSessionNote,
  cancelSession,
  createSessionLink,
  formatClock,
  getSession,
  interviewTypeLabel,
  listSessionLinks,
  listSessionNotes,
  localDateKey,
  monitoringEnabled,
  revokeSessionLink,
  sessionCandidateName,
  sessionRef,
  sessionRole,
  sessionUiStatus,
  toIsoFromLocal,
  updateSession,
  type ApiSession,
  type SessionLink,
  type SessionNote,
} from "@/lib/api/sessions";
import {
  Calendar,
  Clock,
  Video,
  Eye,
  Monitor,
  Code2,
  FileText,
  Zap,
  ArrowLeft,
  Check,
  Edit2,
  GitCommit,
  BarChart2,
  Mail,
  Phone,
  MapPin,
  ArrowUpRight,
  Plus,
  X,
  Ban,
  Link2Off,
  Link2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CANCELLABLE = new Set(["DRAFT", "CONFIGURED", "ARMED", "ADMITTED"]);
const EDITABLE = new Set(["DRAFT", "CONFIGURED", "ARMED"]);

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function StatusChip({ status }: { status: string }) {
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-sage-50 text-sage-700 border border-sage-200 dark:bg-sage-950/40 dark:text-sage-400 dark:border-sage-800">
        <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
        Live
      </span>
    );
  }
  if (status === "Scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fef9ee] text-[#b45309] border border-[#fde68a] dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60">
        <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
      {status}
    </span>
  );
}

function EnabledPill({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-sage-50 text-sage-700 border border-sage-200 dark:bg-sage-950/40 dark:text-sage-400 dark:border-sage-800">
      Enabled
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-500 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700">
      Off
    </span>
  );
}

type TimelineItem = { label: string; at: string | null; description: string; tone: "done" | "pending" | "stopped" };

function buildTimeline(s: ApiSession, creatorName: string): TimelineItem[] {
  const items: TimelineItem[] = [
    { label: "Created", at: s.createdAt, description: `Interview created by ${creatorName}`, tone: "done" },
    {
      label: "Link created",
      at: s.armedAt,
      description: s.armedAt ? "Candidate link is active" : "Waiting for a candidate link",
      tone: s.armedAt ? "done" : "pending",
    },
    {
      label: "Candidate joined",
      at: s.admittedAt,
      description: s.admittedAt ? "Consent recorded and candidate admitted" : "Candidate has not joined yet",
      tone: s.admittedAt ? "done" : "pending",
    },
    {
      label: "Interview started",
      at: s.startedAt,
      description: s.startedAt ? "Live session began" : "Not started",
      tone: s.startedAt ? "done" : "pending",
    },
    {
      label: "Interview ended",
      at: s.status === "ABORTED" ? null : s.endedAt,
      description: s.endedAt && s.status !== "ABORTED" ? "Session closed and evidence sealed" : "Not finished",
      tone: s.endedAt && s.status !== "ABORTED" ? "done" : "pending",
    },
  ];
  if (s.status === "ABORTED") {
    items.push({ label: "Cancelled", at: s.endedAt, description: "Interview was cancelled", tone: "stopped" });
  }
  if (s.status === "EXPIRED") {
    items.push({ label: "Link expired", at: null, description: "The candidate link expired before the candidate joined", tone: "stopped" });
  }
  if (s.reportId) {
    items.push({ label: "Report ready", at: s.sealedAt, description: "Decision intelligence report generated", tone: "done" });
  }
  return items;
}

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const currentUser = useCurrentUser();
  const { canConductInterview, canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  const [session, setSession] = useState<ApiSession | null>(null);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [links, setLinks] = useState<SessionLink[] | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [notes, setNotes] = useState<SessionNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSession(id)
      .then((res) => {
        if (cancelled) return;
        setSession(res);
        setError(null);
        setNotFound(false);
        // Secondary data: a failure here degrades one card, not the whole page.
        listSessionLinks(id)
          .then((l) => !cancelled && (setLinks(l), setLinksError(null)))
          .catch((e) => !cancelled && setLinksError(e instanceof ApiError ? e.message : "Couldn't load the candidate link."));
        listSessionNotes(id)
          .then((n) => !cancelled && (setNotes(n), setNotesError(null)))
          .catch((e) => !cancelled && setNotesError(e instanceof ApiError ? e.message : "Couldn't load notes."));
        if (res.candidate) {
          getCandidate(res.candidate.id)
            .then((c) => !cancelled && setCandidate(c))
            .catch(() => undefined); // Phone/location are optional decoration.
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Something went wrong while loading this interview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const activeLink = useMemo(() => links?.find((l) => l.active) ?? null, [links]);
  const latestLink = links?.[0] ?? null;

  /** Links stay valid for a day past the start, like the ones the scheduler creates. */
  const handleGenerateLink = async () => {
    if (!session) return;
    setGeneratingLink(true);
    try {
      const base = Math.max(Date.now(), session.scheduledAt ? new Date(session.scheduledAt).getTime() : 0);
      await createSessionLink(id, { kind: "ONE_TIME", expiresAt: new Date(base + 24 * 3600 * 1000).toISOString(), sendInvite: false });
      toast({ title: "New link created", description: "Copy it from this page and send it to the candidate. No email was sent.", type: "success" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't create a link", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCancelConfirm = async () => {
    try {
      await cancelSession(id);
      toast({ title: "Interview cancelled", description: "The candidate link no longer works.", type: "info" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't cancel the interview", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  const handleRevoke = async () => {
    if (!confirmRevokeId) return;
    try {
      await revokeSessionLink(id, confirmRevokeId);
      toast({ title: "Link revoked", description: "The candidate can no longer join with it.", type: "info" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't revoke the link", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await addSessionNote(id, noteText.trim());
      setNotes((prev) => [...(prev ?? []), note]);
      setNoteText("");
      setIsAddingNote(false);
      toast({ title: "Note added", description: "Interviewer note saved.", type: "success" });
    } catch (err) {
      toast({ title: "Couldn't save the note", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <LoadingState variant="detail" />;

  if (notFound) {
    return (
      <EmptyState
        icon={Calendar}
        title="Interview Session Not Found"
        description="The requested interview could not be found, or you don't have access to it."
        actionLabel="Return to Interviews"
        onAction={() => router.push("/app/interviews")}
      />
    );
  }

  if (error || !session) {
    return <ErrorState title="Couldn't load this interview" description={error ?? undefined} onRetry={reload} />;
  }

  const uiStatus = sessionUiStatus(session);
  const name = sessionCandidateName(session);
  const start = session.scheduledAt ? new Date(session.scheduledAt) : null;
  const primary = session.interviewers.find((i) => i.isPrimary) ?? session.interviewers[0];
  const additional = session.interviewers.filter((i) => i !== primary);
  const authorName = (authorId: string) => session.interviewers.find((i) => i.userId === authorId)?.name ?? "Team member";
  const timeline = buildTimeline(session, primary?.name ?? "the team");
  const recording = session.config.recordVideo || session.config.recordAudio || session.config.recordScreen;
  const canCancel = canDeleteInterview && CANCELLABLE.has(session.status);
  const canEdit = canConductInterview && EDITABLE.has(session.status);

  return (
    <div className="space-y-5 max-w-6xl mx-auto animate-fade-in-up pb-12">
      {/* 1. Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/app/interviews" className="hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Interviews
          </Link>
          <span className="text-neutral-300 dark:text-neutral-700">/</span>
          <span className="font-mono text-neutral-900 dark:text-white font-semibold">#{sessionRef(session.id)}</span>
        </div>

        <div className="flex items-center gap-2">
          {session.status === "LIVE" ? (
            <Link href={`/app/interviews/${session.id}/live`} target="_blank" rel="noopener noreferrer">
              <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-sage-500 animate-pulse" />
                Join Live Room
              </Button>
            </Link>
          ) : ["CONFIGURED", "ARMED", "ADMITTED"].includes(session.status) ? (
            <Link href={`/app/interviews/${session.id}/live`} target="_blank" rel="noopener noreferrer">
              <Button
                disabled={!canConductInterview}
                className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                Start Live Room
              </Button>
            </Link>
          ) : session.status === "SEALING" || (session.status === "PROCESSING" && !session.reportId) ? (
            <Link href={`/app/interviews/${session.id}/processing`}>
              <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs">
                <FileText className="h-3.5 w-3.5" />
                View Processing
              </Button>
            </Link>
          ) : session.reportId ? (
            <Link href={`/app/reports/${session.reportId}`}>
              <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs">
                <FileText className="h-3.5 w-3.5" />
                View Report
              </Button>
            </Link>
          ) : (
            <Button
              disabled
              title="Finish scheduling the interview to open the live room."
              className="bg-neutral-900 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              Start Live Room
            </Button>
          )}

          {canCancel && (
            <button
              onClick={() => setConfirmCancelOpen(true)}
              className="h-9 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center gap-1.5 text-xs font-medium text-terra-600 dark:text-terra-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title="Cancel this interview"
            >
              <Ban className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* 2. Candidate Profile Card */}
      <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {session.candidate ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidateAvatarUrl(session.candidate)} alt={name} className="h-16 w-16 rounded-full object-cover ring-1 ring-border shrink-0" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
            )}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">{name}</h1>
                <StatusChip status={uiStatus} />
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">
                  {interviewTypeLabel(session.config.interviewType)}
                </span>
              </div>

              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 pt-0.5">{sessionRole(session)}</p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                {session.candidate && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-neutral-400" />
                    {session.candidate.email}
                  </span>
                )}
                {candidate?.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-neutral-400" />
                    {candidate.phone}
                  </span>
                )}
                {candidate?.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                    {candidate.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => setCandidateDialogOpen(true)}
                className="text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 h-9"
              >
                <UserPlus className="h-3.5 w-3.5" /> {session.candidate ? "Change candidate" : "Add candidate"}
              </Button>
            )}
            {session.candidate && (
              <Link href={`/app/candidates/${session.candidate.id}`}>
                <Button
                  variant="outline"
                  className="border border-sage-200/80 dark:border-sage-800 bg-sage-50/50 dark:bg-sage-950/20 hover:bg-sage-50 dark:hover:bg-sage-950/40 text-sage-800 dark:text-sage-300 text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 h-9 transition-colors"
                >
                  View Full Profile <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 3. Candidate Interview Access Link */}
      {linksError ? (
        <ErrorState title="Couldn't load the candidate link" description={linksError} onRetry={reload} className="min-h-[120px]" />
      ) : links === null ? (
        <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 text-xs text-neutral-500">Loading candidate link…</div>
      ) : latestLink ? (
        <div className="space-y-2">
          <InterviewLinkCard
            reference={sessionRef(session.id)}
            url={activeLink?.url ?? null}
            expiresAt={(activeLink ?? latestLink).expiresAt}
            isActive={!!activeLink}
            inactiveLabel={
              activeLink
                ? "Hidden for your role. Ask the interviewer or an admin for the link."
                : latestLink.revokedAt
                  ? "This link was revoked."
                  : latestLink.usedAt
                    ? "This link has been used."
                    : "This link has expired."
            }
          />
          {!activeLink && canEdit && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleGenerateLink} disabled={generatingLink || !session.candidate} title={session.candidate ? undefined : "Add a candidate first"} className="text-xs h-8 gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> {generatingLink ? "Creating…" : "Generate new link"}
              </Button>
            </div>
          )}
          {activeLink && canConductInterview && (
            <div className="flex justify-end">
              <button
                onClick={() => setConfirmRevokeId(activeLink.linkId)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-terra-600 dark:text-terra-400 hover:underline"
              >
                <Link2Off className="h-3.5 w-3.5" /> Revoke link
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-5 text-xs text-neutral-500 flex items-center justify-between gap-3">
          <span>No candidate link has been generated for this interview yet.</span>
          {canEdit && (
            <Button size="sm" onClick={handleGenerateLink} disabled={generatingLink || !session.candidate} title={session.candidate ? undefined : "Add a candidate first"} className="text-xs h-8 gap-1.5 shrink-0">
              <Link2 className="h-3.5 w-3.5" /> {generatingLink ? "Creating…" : "Generate link"}
            </Button>
          )}
        </div>
      )}

      {/* 4. Bottom Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          {/* Schedule & Interviewer Assignment */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Schedule & Interviewer Assignment</h3>
                  <p className="text-xs text-neutral-500">Allocated duration and lead interviewer details</p>
                </div>
              </div>

              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                  className="border border-neutral-200 dark:border-neutral-800 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 h-8 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <Edit2 className="h-3 w-3" />
                  Edit Schedule
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-slate-50 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Date & Time</div>
                {start ? (
                  <>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-white leading-tight">
                      {localDateKey(start)} at {formatClock(start)}
                    </div>
                    <div className="text-[11px] text-neutral-400">({start.toLocaleDateString("en-US", { weekday: "long" })})</div>
                  </>
                ) : (
                  <div className="font-semibold text-xs text-neutral-900 dark:text-white leading-tight">Not scheduled</div>
                )}
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-terra-50 text-terra-600 dark:bg-terra-950/50 dark:text-terra-400 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Duration</div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-white leading-tight">{session.durationMinutes} Minutes</div>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-sage-50 text-sage-600 dark:bg-sage-950/50 dark:text-sage-400 flex items-center justify-center">
                  <Video className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Session Recording</div>
                <div className={cn("font-semibold text-xs leading-tight", recording ? "text-sage-700 dark:text-sage-400" : "text-neutral-500")}>
                  {recording ? "Enabled" : "Disabled"}
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-100 dark:border-neutral-800/80 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="text-[11px] text-neutral-500">Assigned Lead Interviewer</div>
                {primary ? (
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={memberAvatarUrl(primary.name)} alt={primary.name} className="h-8 w-8 rounded-full object-cover ring-1 ring-border" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-neutral-900 dark:text-white">{primary.name}</span>
                        {primary.userId === currentUser.id && (
                          <span className="inline-flex items-center px-1.5 rounded-full text-[10px] font-medium bg-sage-50 text-sage-700 border border-sage-200 dark:bg-sage-950/40 dark:text-sage-400 dark:border-sage-800">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400">Lead Interviewer</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">Unassigned</p>
                )}
              </div>

              <div className="hidden sm:block h-10 w-px bg-neutral-200 dark:bg-neutral-800" />

              <div className="space-y-1.5 min-w-0">
                <div className="text-[11px] text-neutral-500">Additional Interviewers</div>
                {additional.length === 0 ? (
                  <p className="text-xs text-neutral-400">None</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {additional.map((i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i.userId}
                          src={memberAvatarUrl(i.name)}
                          alt={i.name}
                          title={i.name}
                          className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-neutral-900"
                        />
                      ))}
                    </div>
                    <span className="text-xs text-neutral-500 ml-1">{additional.map((i) => i.name.split(" ")[0]).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Behavioral Monitoring & Sandbox */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                <BarChart2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Behavioral Monitoring & Sandbox</h3>
                <p className="text-xs text-neutral-500">Calibrated telemetry channels and coding environment</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { title: "Video & Audio", icon: Video, tone: "bg-slate-50 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400", on: monitoringEnabled(session.config.channels, "webcam") || session.config.recordVideo || session.config.recordAudio },
                { title: "Screen Monitoring", icon: Monitor, tone: "bg-slate-50 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400", on: monitoringEnabled(session.config.channels, "screen") || session.config.recordScreen },
                { title: "Eye Tracking", icon: Eye, tone: "bg-sage-50 text-sage-600 dark:bg-sage-950/50 dark:text-sage-400", on: monitoringEnabled(session.config.channels, "gaze") },
                { title: "Code Environment", icon: Code2, tone: "bg-clay-50 text-clay-600 dark:bg-clay-950/50 dark:text-clay-400", on: session.tasks.length > 0 },
              ].map(({ title, icon: Icon, tone, on }) => (
                <div key={title} className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-2">
                  <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">{title}</div>
                  <EnabledPill on={on} />
                </div>
              ))}
            </div>

            {session.tasks.length > 0 && (
              <p className="text-xs text-neutral-500">
                Coding task{session.tasks.length > 1 ? "s" : ""}: <span className="font-medium text-neutral-800 dark:text-neutral-200">{session.tasks.map((t) => t.title).join(", ")}</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Interview Timeline */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                <GitCommit className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Interview Timeline & Stages</h3>
                <p className="text-xs text-neutral-500">Milestones recorded for this session</p>
              </div>
            </div>

            <div className="relative pl-6 space-y-6 pt-2 pb-1 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
              {timeline.map((item) => (
                <div key={item.label} className="relative text-xs">
                  <div
                    className={cn(
                      "absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-neutral-900",
                      item.tone === "done" && "bg-sage-600",
                      item.tone === "stopped" && "bg-terra-500",
                      item.tone === "pending" && "border-2 border-neutral-300 bg-white dark:bg-neutral-900",
                    )}
                  >
                    {item.tone === "done" && <Check className="h-3 w-3 stroke-[3]" />}
                    {item.tone === "stopped" && <X className="h-3 w-3 stroke-[3]" />}
                    {item.tone === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={cn("font-semibold", item.tone === "pending" ? "text-neutral-400" : "text-neutral-900 dark:text-white")}>{item.label}</span>
                      {item.at && <span className="text-[11px] text-neutral-400 font-mono">{formatStamp(item.at)}</span>}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Notes</h3>
                  <p className="text-xs text-neutral-500">Private notes about this interview</p>
                </div>
              </div>

              {canConductInterview && (
                <Button
                  variant="outline"
                  onClick={() => setIsAddingNote(!isAddingNote)}
                  className="border border-neutral-200 dark:border-neutral-800 text-xs px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 h-8 flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Note
                </Button>
              )}
            </div>

            {isAddingNote && (
              <div className="space-y-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
                <textarea
                  aria-label="New note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  maxLength={4000}
                  placeholder="Type your interview or evaluation notes here..."
                  className="w-full text-xs p-2.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:border-neutral-400"
                  rows={3}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsAddingNote(false)} className="text-xs h-7">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || savingNote} isLoading={savingNote} className="bg-neutral-900 text-white text-xs h-7">
                    Save Note
                  </Button>
                </div>
              </div>
            )}

            {notesError ? (
              <p className="text-xs text-terra-600 dark:text-terra-400">{notesError}</p>
            ) : notes === null ? (
              <p className="text-xs text-neutral-400">Loading notes…</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-neutral-400 italic pt-1">No notes added for this interview yet.</p>
            ) : (
              <div className="space-y-2.5">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3.5 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1.5 text-[11px] text-neutral-400">
                      {authorName(n.authorId)} • {formatStamp(n.ts)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancel Interview Session?"
        description={`Are you sure you want to cancel the interview for ${name}? This revokes candidate access and cannot be undone.`}
        confirmText="Cancel Interview"
        variant="destructive"
        onConfirm={handleCancelConfirm}
      />

      <ConfirmDialog
        open={confirmRevokeId !== null}
        onOpenChange={(open) => !open && setConfirmRevokeId(null)}
        title="Revoke candidate link?"
        description="The candidate will no longer be able to join with this link. You can generate a new link afterwards."
        confirmText="Revoke link"
        variant="destructive"
        onConfirm={handleRevoke}
      />

      {candidateDialogOpen && (
        <CandidateDialog
          session={session}
          onOpenChange={setCandidateDialogOpen}
          onSaved={() => {
            setCandidateDialogOpen(false);
            reload();
          }}
        />
      )}

      {editOpen && (
        <EditScheduleDialog
          onOpenChange={setEditOpen}
          session={session}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CandidateDialog({ session, onOpenChange, onSaved }: { session: ApiSession; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<DirectoryCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedId, setSelectedId] = useState("");
  const [email, setEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCandidates({ limit: 100 })
      .then((res) => {
        if (!cancelled) setCandidates(res.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Couldn't load candidates.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = candidates?.find((c) => c.id === selectedId);
  const canSave = mode === "existing" ? !!chosen && chosen.id !== session.candidate?.id : email.trim().length > 0;
  const hadCandidate = !!session.candidate;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const target = mode === "existing" && chosen ? { email: chosen.email, name: chosen.name } : { email: email.trim(), name: newName.trim() || null };
      await updateSession(session.id, { candidateEmail: target.email, candidateName: target.name });
      toast({
        title: hadCandidate ? "Candidate changed" : "Candidate added",
        description: hadCandidate ? "Links for the previous candidate were revoked. Generate a new link for the new one." : target.email,
        type: "success",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update the candidate.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none";
  const tab = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{hadCandidate ? "Change candidate" : "Add candidate"}</DialogTitle>
        <DialogDescription>
          {hadCandidate
            ? "Pick someone else for this interview. Any link already issued stops working, and you can generate a new one."
            : "Choose who is being interviewed. You can then generate their link."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <button type="button" className={tab(mode === "existing")} onClick={() => setMode("existing")}>
            Existing candidate
          </button>
          <button type="button" className={tab(mode === "new")} onClick={() => setMode("new")}>
            New candidate
          </button>
        </div>

        {mode === "existing" ? (
          loadError ? (
            <p role="alert" className="text-xs text-terra-600 dark:text-terra-400">{loadError}</p>
          ) : !candidates ? (
            <p className="text-xs text-muted-foreground">Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No candidates yet. Use &quot;New candidate&quot; to add one.</p>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="candidate-pick" className="text-xs font-semibold text-foreground">Candidate</label>
              <select id="candidate-pick" className={field} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select a candidate…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === session.candidate?.id}>
                    {candidateDisplayName(c)} ({c.email}){c.id === session.candidate?.id ? " · current" : ""}
                  </option>
                ))}
              </select>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="candidate-email" className="text-xs font-semibold text-foreground">Email</label>
              <input id="candidate-email" type="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="candidate@example.com" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="candidate-name" className="text-xs font-semibold text-foreground">Name (optional)</label>
              <input id="candidate-name" className={field} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !canSave} className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving ? "Saving…" : hadCandidate ? "Change candidate" : "Add candidate"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EditScheduleDialog({
  onOpenChange,
  session,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  session: ApiSession;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const start = session.scheduledAt ? new Date(session.scheduledAt) : new Date();
  const [title, setTitle] = useState(session.title ?? "");
  const [date, setDate] = useState(localDateKey(start));
  const [time, setTime] = useState(formatClock(start));
  const [duration, setDuration] = useState(session.durationMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSession(session.id, { title: title.trim() || null, scheduledAt: toIsoFromLocal(date, time), durationMinutes: duration });
      toast({ title: "Schedule updated", type: "success" });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update the schedule.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Schedule</DialogTitle>
        <DialogDescription>Change the role title, date, time or duration. The candidate link stays the same.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Job Role</label>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-semibold text-foreground">Date</label>
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Time</label>
            <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Duration</label>
            <select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} mins
                </option>
              ))}
              {![30, 45, 60, 90].includes(duration) && <option value={duration}>{duration} mins</option>}
            </select>
          </div>
        </div>
        {error && (
          <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
