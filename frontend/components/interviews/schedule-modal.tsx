"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { InterviewLinkCard } from "./interview-link-card";
import { useToast } from "../ui/toast";
import { useCurrentUser } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { candidateAvatarUrl, candidateDisplayName, listCandidates, type DirectoryCandidate } from "@/lib/api/candidates";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { CodingTaskModal } from "@/components/questions/coding-task-modal";
import { difficultyLabel, listCodingTasks, type CodingTaskSummary } from "@/lib/api/coding-tasks";
import { listMembers, memberAvatarUrl, type OrgMember } from "@/lib/api/org";
import {
  INTERVIEW_TYPES,
  addSessionInterviewer,
  addSessionNote,
  channelsFor,
  createSession,
  createSessionLink,
  formatClock,
  localDateKey,
  patchSessionConfig,
  sessionRef,
  toIsoFromLocal,
  type ApiSession,
  type CreatedLink,
  type InterviewTypeCode,
  type MonitoringKey,
} from "@/lib/api/sessions";
import {
  Calendar,
  Clock,
  Code,
  Shield,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Camera,
  MonitorSmartphone,
  ClipboardList,
  Eye,
  CloudCog,
  FileText,
  Hourglass,
  Layers,
  User,
  Briefcase,
} from "lucide-react";

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCandidateId?: string;
  /** Preselects a coding task (the Question Bank's "Use" button). */
  defaultTaskId?: string;
  /** Called once the interview and its candidate link exist, so a list behind the modal can refresh. */
  onCreated?: (session: ApiSession) => void;
}

/** Small pill-style on/off switch used throughout the monitoring section. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked ? "bg-foreground" : "bg-input"
      }`}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(1.125rem)" : "translateX(0.25rem)" }}
      />
    </button>
  );
}

/** Row with an icon, title, description and a trailing toggle switch. */
function MonitoringToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">{description}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Initials avatar fallback, used when a person has no profile image. */
function Avatar({ name, src }: { name: string; src?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover shrink-0" />;
  }

  return (
    <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
      {initials}
    </div>
  );
}

/**
 * Fully custom "person card" combobox: avatar, name and subtitle on the button face, and a matching
 * styled listbox on open (a plain button + div rather than a native <select>, so option rows can carry
 * avatars and two-line subtitles).
 */
function PersonSelect<T extends { id: string; name: string; avatar?: string }>({
  value,
  onChange,
  options,
  subtitle,
}: {
  value: string;
  onChange: (id: string) => void;
  options: T[];
  subtitle: (option: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-left focus:outline-none focus:border-foreground/40"
      >
        {selected && selected.id !== "" && <Avatar name={selected.name} src={selected.avatar} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{selected?.name ?? "Select…"}</p>
          {selected && <p className="text-xs text-muted-foreground truncate">{subtitle(selected)}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="listbox" className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-1">
          {options.map((o) => {
            const isSelected = o.id === value;
            return (
              <button
                key={o.id || "none"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${isSelected ? "bg-muted" : "hover:bg-muted/60"}`}
              >
                {o.id !== "" && <Avatar name={o.name} src={o.avatar} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{o.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{subtitle(o)}</p>
                </div>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-foreground shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Progress = { session: ApiSession | null; configured: boolean; link: CreatedLink | null; extrasDone: boolean };

const EMPTY_PROGRESS: Progress = { session: null, configured: false, link: null, extrasDone: false };

/** The next full hour, as a date/time pair derived together so they can't disagree across midnight. */
function defaultSlot(): { date: string; time: string } {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return { date: localDateKey(d), time: formatClock(d) };
}

/** Interview types that involve a coding test and therefore offer the coding round picker. */
const CODING_TYPES: InterviewTypeCode[] = ["TECHNICAL", "CODING", "MIXED"];

export function ScheduleModal({ open, onOpenChange, defaultCandidateId, defaultTaskId, onCreated }: ScheduleModalProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { toast } = useToast();

  const [candidates, setCandidates] = useState<DirectoryCandidate[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [tasks, setTasks] = useState<CodingTaskSummary[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [candidateId, setCandidateId] = useState(defaultCandidateId ?? "");
  // null until the user types their own; until then the role follows the selected candidate.
  const [roleOverride, setRoleOverride] = useState<string | null>(null);
  const [extraInterviewerId, setExtraInterviewerId] = useState("");
  const [date, setDate] = useState(() => defaultSlot().date);
  const [time, setTime] = useState(() => defaultSlot().time);
  const [duration, setDuration] = useState<number>(60);
  const [interviewType, setInterviewType] = useState<InterviewTypeCode>("TECHNICAL");
  const [taskId, setTaskId] = useState(defaultTaskId ?? "");
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [monitoring, setMonitoring] = useState<Record<MonitoringKey, boolean>>({
    webcam: true,
    screen: true,
    clipboard: true,
    gaze: true,
  });
  const [sendInvite, setSendInvite] = useState(true);
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);

  // Load the pickers each time the modal opens so newly added candidates, tasks and members appear.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([listCandidates({ limit: 100 }), listMembers(), listCodingTasks()])
      .then(([cands, mems, tks]) => {
        if (cancelled) return;
        setCandidates(cands.items);
        setMembers(mems);
        setTasks(tks);
        setOptionsError(null);
        setCandidateId((current) => (current && cands.items.some((c) => c.id === current) ? current : (cands.items[0]?.id ?? "")));
      })
      .catch((err) => {
        if (!cancelled) setOptionsError(err instanceof ApiError ? err.message : "Could not load candidates and team members.");
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const showCodingRound = CODING_TYPES.includes(interviewType);

  // Picking a coding-related type preselects the first task so the round isn't silently skipped;
  // a type without a coding test clears any pick.
  useEffect(() => {
    if (!showCodingRound) {
      setTaskId("");
      return;
    }
    if (tasks.length === 0) return;
    setTaskId((current) => (current && tasks.some((t) => t.id === current) ? current : (tasks[0]?.id ?? "")));
  }, [showCodingRound, tasks]);

  const jobRole = roleOverride ?? candidates.find((c) => c.id === candidateId)?.appliedRole ?? "";

  const candidateOptions = useMemo(
    () => candidates.map((c) => ({ id: c.id, name: candidateDisplayName(c), avatar: candidateAvatarUrl(c), role: c.appliedRole ?? c.email })),
    [candidates],
  );
  const interviewerOptions = useMemo(
    () => [
      { id: "", name: "None", avatar: undefined as string | undefined, role: "Only you" },
      ...members
        .filter((m) => m.userId !== currentUser.id && m.role !== "REVIEWER")
        .map((m) => ({ id: m.userId, name: m.name, avatar: memberAvatarUrl(m.name), role: m.role.toLowerCase() })),
    ],
    [members, currentUser.id],
  );

  const resetForm = () => {
    setRoleOverride(null);
    setProgress(EMPTY_PROGRESS);
    setError(null);
    setNotes("");
    setTaskId(defaultTaskId ?? "");
    setExtraInterviewerId("");
    const slot = defaultSlot();
    setDate(slot.date);
    setTime(slot.time);
    setCandidateId(defaultCandidateId ?? "");
  };

  const handleClose = () => {
    if (isSaving) return;
    resetForm();
    onOpenChange(false);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) {
      setError("Choose a candidate. Add one on the Candidates page if the list is empty.");
      return;
    }
    const scheduledAt = toIsoFromLocal(date, time);
    if (!progress.session && new Date(scheduledAt).getTime() < Date.now() - 60_000) {
      setError("The interview time is in the past. Pick a future date and time.");
      return;
    }

    setIsSaving(true);
    let current = progress;
    try {
      // Each step is recorded as it succeeds, so a retry after a failure resumes instead of duplicating.
      if (!current.session) {
        const session = await createSession({
          mode: "SCHEDULED",
          title: jobRole.trim() || undefined,
          candidateEmail: candidate.email,
          candidateName: candidate.name ?? undefined,
          scheduledAt,
          durationMinutes: duration,
        });
        current = { ...current, session };
        setProgress(current);
      }
      const session = current.session!;

      if (!current.configured) {
        await patchSessionConfig(session.id, {
          interviewType,
          recordVideo: recordingEnabled,
          recordAudio: recordingEnabled,
          recordScreen: recordingEnabled,
          channels: channelsFor(monitoring),
          taskIds: showCodingRound && taskId ? [taskId] : [],
        });
        current = { ...current, configured: true };
        setProgress(current);
      }

      if (!current.link) {
        const validUntil = new Date(Math.max(Date.now(), new Date(scheduledAt).getTime()) + 24 * 3600 * 1000).toISOString();
        const link = await createSessionLink(session.id, { kind: "ONE_TIME", expiresAt: validUntil, sendInvite });
        current = { ...current, link };
        setProgress(current);
      }

      if (!current.extrasDone) {
        // Non-critical: the interview and its link already exist, so failures here only warn.
        const warnings: string[] = [];
        if (extraInterviewerId) {
          await addSessionInterviewer(session.id, extraInterviewerId).catch(() => warnings.push("the additional interviewer"));
        }
        if (notes.trim()) {
          await addSessionNote(session.id, notes.trim()).catch(() => warnings.push("the interviewer note"));
        }
        current = { ...current, extrasDone: true };
        setProgress(current);
        if (warnings.length > 0) {
          toast({
            title: "Scheduled, with a warning",
            description: `Could not save ${warnings.join(" and ")}. You can add it from the interview page.`,
            type: "info",
          });
        }
      }

      toast({ title: "Interview scheduled", description: `Link generated for ${candidateDisplayName(candidate)}`, type: "success" });
      onCreated?.(session);
    } catch (err) {
      const message =
        err instanceof ApiError && err.fields.length > 0
          ? err.fields.map((f) => `${f.path}: ${f.message}`).join(" · ")
          : err instanceof ApiError
            ? err.message
            : "Something went wrong while scheduling.";
      setError(current.session ? `${message} The interview was saved as a draft; press the button again to finish setting it up.` : message);
    } finally {
      setIsSaving(false);
    }
  };

  const created = progress.link && progress.session && progress.extrasDone ? progress : null;
  const createdCandidate = candidates.find((c) => c.id === candidateId);

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <div className="flex flex-col max-h-[80vh]">
        <div className="shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>{created ? "Interview Scheduled!" : "Schedule Technical Interview"}</DialogTitle>
                <DialogDescription>
                  {created
                    ? "Candidate access link is ready. Share it with the candidate or open the interview."
                    : "Configure role details, coding sandbox, and multimodal telemetry monitoring."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {created ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 animate-fade-in-up px-0.5 -mx-0.5">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-sage-500/30 bg-sage-500/10 text-sage-900 dark:text-sage-200 text-xs">
                <CheckCircle2 className="h-5 w-5 text-sage-600 dark:text-sage-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">
                    Interview for {createdCandidate ? candidateDisplayName(createdCandidate) : "the candidate"} is confirmed
                  </p>
                  <p className="opacity-90">
                    {date} at {time} ({duration} mins){sendInvite ? " • Invitation emailed" : ""}
                  </p>
                </div>
              </div>

              <InterviewLinkCard reference={sessionRef(created.session!.id)} url={created.link!.url} expiresAt={created.link!.expiresAt} isActive />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-border shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = created.session!.id;
                  resetForm();
                  onOpenChange(false);
                  router.push(`/app/interviews/${id}`);
                }}
                className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity"
              >
                View Interview Details
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSchedule} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 px-0.5 -mx-0.5 pb-1">
              {optionsError && (
                <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
                  {optionsError}
                </div>
              )}

              {!loadingOptions && !optionsError && candidates.length === 0 && (
                <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                  You have no candidates yet.{" "}
                  <button type="button" onClick={() => setAddCandidateOpen(true)} className="font-semibold text-foreground underline">
                    Add a candidate
                  </button>{" "}
                  before scheduling an interview.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <User className="h-3.5 w-3.5" /> Candidate
                  </label>
                  <PersonSelect value={candidateId} onChange={setCandidateId} options={candidateOptions} subtitle={(c) => c.role} />
                  {!progress.session && (
                    <button type="button" onClick={() => setAddCandidateOpen(true)} className="text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      + New candidate
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Briefcase className="h-3.5 w-3.5" /> Job Role
                  </label>
                  <input
                    type="text"
                    value={jobRole}
                    onChange={(e) => setRoleOverride(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="e.g. Senior Backend Engineer"
                    className="w-full h-[52px] rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <User className="h-3.5 w-3.5" /> Additional Interviewer
                  </label>
                  <PersonSelect value={extraInterviewerId} onChange={setExtraInterviewerId} options={interviewerOptions} subtitle={(u) => u.role} />
                  <p className="text-[11px] text-muted-foreground">You are the lead interviewer.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Layers className="h-3.5 w-3.5" /> Interview Type
                  </label>
                  <div className="relative">
                    <select
                      value={interviewType}
                      onChange={(e) => setInterviewType(e.target.value as InterviewTypeCode)}
                      className="w-full h-[52px] appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                    >
                      {INTERVIEW_TYPES.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full h-[52px] rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Clock className="h-3.5 w-3.5" /> Time
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                      className="w-full h-[52px] rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Hourglass className="h-3.5 w-3.5" /> Duration
                    </label>
                    <div className="relative">
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full h-[52px] appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                      >
                        <option value={30}>30 mins</option>
                        <option value={45}>45 mins</option>
                        <option value={60}>60 mins</option>
                        <option value={90}>90 mins</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Coding round: only for interview types that involve a coding test */}
              {showCodingRound && (
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3 animate-fade-in-up">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Code className="h-4 w-4" /> Coding Round
                  </span>
                  <div className="relative">
                    <select
                      aria-label="Coding task"
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-9 py-2.5 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                    >
                      <option value="">No coding round</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          [{difficultyLabel(t.difficulty)}] {t.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  {tasks.length === 0 && !loadingOptions && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">You haven&apos;t created any coding tasks yet, so there is nothing to choose from.</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">The candidate picks a language in the room from those the task supports. You can also assign a task during the live interview.</p>
                    <button type="button" onClick={() => setCreateTaskOpen(true)} className="text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0">
                      + New coding task
                    </button>
                  </div>
                </div>
              )}

              {/* Monitoring & Integrity Safeguards */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Shield className="h-4 w-4" /> Behavioral Intelligence & Recording
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enable monitoring signals for integrity and fair evaluation. The candidate sees exactly what is collected before consenting.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <MonitoringToggleRow
                    icon={<Camera className="h-4 w-4" />}
                    title="Webcam Telemetry"
                    description="Face presence, scene"
                    checked={monitoring.webcam}
                    onChange={(v) => setMonitoring((m) => ({ ...m, webcam: v }))}
                  />
                  <MonitoringToggleRow
                    icon={<MonitorSmartphone className="h-4 w-4" />}
                    title="Screen Tracking"
                    description="Focus, pointer, environment"
                    checked={monitoring.screen}
                    onChange={(v) => setMonitoring((m) => ({ ...m, screen: v }))}
                  />
                  <MonitoringToggleRow
                    icon={<ClipboardList className="h-4 w-4" />}
                    title="Clipboard Dynamics"
                    description="Paste events, typing rhythm"
                    checked={monitoring.clipboard}
                    onChange={(v) => setMonitoring((m) => ({ ...m, clipboard: v }))}
                  />
                  <MonitoringToggleRow
                    icon={<Eye className="h-4 w-4" />}
                    title="Gaze Deviation"
                    description="Detect attention anomalies"
                    checked={monitoring.gaze}
                    onChange={(v) => setMonitoring((m) => ({ ...m, gaze: v }))}
                  />
                  <MonitoringToggleRow
                    icon={<CloudCog className="h-4 w-4" />}
                    title="Session Recording"
                    description="Needs a media provider that can record"
                    checked={recordingEnabled}
                    onChange={setRecordingEnabled}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <FileText className="h-3.5 w-3.5" /> Interviewer Notes
                </label>
                <div className="relative">
                  <textarea
                    placeholder="Candidate background context, areas to focus on..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 pb-6 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                  <span className="absolute bottom-2 right-3 text-[11px] text-muted-foreground">{notes.length}/500</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-3.5 w-3.5" />
                Email the invitation link to the candidate
              </label>
            </div>

            {error && (
              <div role="alert" className="mt-2 rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-border shrink-0">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || loadingOptions || candidates.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isSaving ? "Scheduling…" : progress.session ? "Finish Setup" : "Generate Link & Schedule"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
    <CodingTaskModal
      open={createTaskOpen}
      onOpenChange={setCreateTaskOpen}
      task={null}
      onSaved={() => {
        // The modal doesn't return the new task, so reload and preselect the newest one.
        listCodingTasks()
          .then((tks) => {
            const known = new Set(tasks.map((t) => t.id));
            const fresh = tks.find((t) => !known.has(t.id));
            setTasks(tks);
            if (fresh) setTaskId(fresh.id);
          })
          .catch(() => undefined);
      }}
    />
    <AddCandidateModal
      open={addCandidateOpen}
      onOpenChange={setAddCandidateOpen}
      onCreated={(created) => {
        // Show the new person in the picker and select them, so scheduling carries on without a detour.
        setCandidates((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setCandidateId(created.id);
      }}
    />
    </>
  );
}
