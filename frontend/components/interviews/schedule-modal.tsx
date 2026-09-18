"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useStore } from "@/lib/store/interview-store";
import { Interview, InterviewType } from "@/lib/types";
import { InterviewLinkCard } from "./interview-link-card";
import { useToast } from "../ui/toast";
import {
  Calendar,
  Clock,
  Code,
  Shield,
  Video,
  CheckCircle2,
  Sparkles,
  HelpCircle,
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
}

/** Small pill-style on/off switch used throughout the monitoring section. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
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
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform duration-200 ${
          checked ? "translate-x-4.5" : "translate-x-1"
        }`}
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
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {description}
          </p>
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
 * Fully custom "person card" combobox — avatar, name and subtitle on the
 * button face, and a matching styled listbox on open. Built from a plain
 * button + div (not a native <select>) so option rows can carry avatars and
 * two-line subtitles instead of the browser's plain-text native dropdown.
 */
function PersonSelect<T extends { id: string; name: string; avatar?: string }>({
  value,
  onChange,
  options,
  subtitle,
  required,
}: {
  value: string;
  onChange: (id: string) => void;
  options: T[];
  subtitle: (option: T) => string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        {selected && <Avatar name={selected.name} src={selected.avatar} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {selected?.name ?? "Select…"}
          </p>
          {selected && (
            <p className="text-xs text-muted-foreground truncate">{subtitle(selected)}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-1"
        >
          {options.map((o) => {
            const isSelected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                  isSelected ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <Avatar name={o.name} src={o.avatar} />
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

export function ScheduleModal({
  open,
  onOpenChange,
  defaultCandidateId,
}: ScheduleModalProps) {
  const { candidates, users, questions, addInterview } = useStore();
  const { toast } = useToast();

  const [candidateId, setCandidateId] = useState(
    defaultCandidateId || candidates[0]?.id || ""
  );
  const [jobRole, setJobRole] = useState(
    candidates[0]?.appliedRole || "Senior Distributed Systems Engineer"
  );
  const [interviewerId, setInterviewerId] = useState(
    users[1]?.id || users[0]?.id || ""
  );
  const [date, setDate] = useState("2026-09-17");
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState<number>(60);
  const [interviewType, setInterviewType] = useState<InterviewType>(
    "Distributed Systems"
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    questions[0]?.id || "q-1"
  );
  const [language, setLanguage] = useState("typescript");
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [webcamRequired, setWebcamRequired] = useState(true);
  const [screenShareRequired, setScreenShareRequired] = useState(true);
  const [clipboardTracking, setClipboardTracking] = useState(true);
  const [gazeTelemetry, setGazeTelemetry] = useState(true);
  const [notes, setNotes] = useState("");

  const [createdInterview, setCreatedInterview] = useState<Interview | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleCandidateChange = (id: string) => {
    setCandidateId(id);
    const cand = candidates.find((c) => c.id === id);
    if (cand) {
      setJobRole(cand.appliedRole);
    }
  };

  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let token = "";
    for (let i = 0; i < 6; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  };

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const token = generateToken();
    const candidate = candidates.find((c) => c.id === candidateId) || candidates[0];
    const interviewer = users.find((u) => u.id === interviewerId) || users[0];
    const chosenQuestion = questions.find((q) => q.id === selectedQuestionId);

    const newInterview: Interview = {
      id: `int-${Date.now()}`,
      candidateId: candidate.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidateAvatar: candidate.avatar,
      jobRole,
      interviewType,
      date,
      time,
      durationMinutes: duration,
      status: "Scheduled",
      interviewerId: interviewer.id,
      interviewerName: interviewer.name,
      interviewerAvatar: interviewer.avatar,
      token,
      tokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      candidateLink: `https://app.veritrust.ai/interview/${token}`,
      codingRoundConfig: {
        language,
        starterCode: chosenQuestion?.starterCode?.[language] || `// ${chosenQuestion?.title || "Technical Interview Coding Round"}\nfunction solution() {\n  // Your code here\n}`,
        questionId: selectedQuestionId,
        allowedLanguages: ["typescript", "javascript", "python", "java", "cpp"],
      },
      monitoringConfig: {
        webcamRequired,
        screenShareRequired,
        clipboardTracking,
        gazeTelemetry,
        audioAnalysis: true,
      },
      recordingEnabled,
      notes: notes || "Technical round focusing on system design & algorithmic depth.",
      timeline: [
        {
          stage: "Created",
          timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
          description: `Interview scheduled by ${interviewer.name}`,
        },
        {
          stage: "Scheduled",
          timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
          description: "Invitation link generated and active",
        },
      ],
    };

    setTimeout(() => {
      addInterview(newInterview);
      setCreatedInterview(newInterview);
      setIsLoading(false);
      toast({
        title: "Interview Scheduled Successfully",
        description: `Link generated for ${candidate.name}`,
        type: "success",
      });
    }, 400);
  };

  const handleClose = () => {
    setCreatedInterview(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <div className="flex flex-col max-h-[80vh]">
        <div className="shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>
                  {createdInterview ? "Interview Scheduled!" : "Schedule Technical Interview"}
                </DialogTitle>
                <DialogDescription>
                  {createdInterview
                    ? "Candidate access link is ready. Share with candidate or join live room."
                    : "Configure role details, coding sandbox, and multimodal telemetry monitoring."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {createdInterview ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 animate-fade-in-up px-0.5 -mx-0.5">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-sage-500/30 bg-sage-500/10 text-sage-900 dark:text-sage-200 text-xs">
                <CheckCircle2 className="h-5 w-5 text-sage-600 dark:text-sage-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">
                    Interview for {createdInterview.candidateName} is confirmed
                  </p>
                  <p className="opacity-90">
                    {createdInterview.date} at {createdInterview.time} ({createdInterview.durationMinutes} mins) • Assigned to {createdInterview.interviewerName}
                  </p>
                </div>
              </div>

              <InterviewLinkCard
                token={createdInterview.token}
                candidateLink={createdInterview.candidateLink}
                isActive={true}
              />
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
                  window.location.href = `/app/interviews/${createdInterview.id}`;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Candidate Selector */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <User className="h-3.5 w-3.5" /> Candidate
              </label>
              <PersonSelect
                value={candidateId}
                onChange={handleCandidateChange}
                options={candidates}
                subtitle={(c) => c.appliedRole}
                required
              />
            </div>

            {/* Target Role */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Job Role
              </label>
              <input
                type="text"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                required
                className="w-full h-[52px] rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
              />
            </div>

            {/* Interviewer */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <User className="h-3.5 w-3.5" /> Interviewer
              </label>
              <PersonSelect
                value={interviewerId}
                onChange={setInterviewerId}
                options={users}
                subtitle={(u) => u.role}
                required
              />
            </div>

            {/* Interview Type */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Layers className="h-3.5 w-3.5" /> Interview Type
              </label>
              <div className="relative">
                <select
                  value={interviewType}
                  onChange={(e) => setInterviewType(e.target.value as InterviewType)}
                  className="w-full h-[52px] appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                >
                  <option value="Distributed Systems">Distributed Systems</option>
                  <option value="Frontend Architecture">Frontend Architecture</option>
                  <option value="Full Stack Coding">Full Stack Coding</option>
                  <option value="Algorithms & Data Structures">Algorithms & Data Structures</option>
                  <option value="Backend Engineering">Backend Engineering</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Date */}
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

            {/* Time & Duration */}
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

          {/* Coding & Question Config */}
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Code className="h-4 w-4" /> Coding Sandbox & Question
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Environment</span>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="appearance-none rounded-lg border border-input bg-background pl-3 pr-8 py-1.5 text-xs text-foreground font-mono focus:outline-none"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
            <div className="relative">
              <select
                value={selectedQuestionId}
                onChange={(e) => setSelectedQuestionId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-9 py-2.5 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
              >
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{q.difficulty}] {q.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Monitoring & Integrity Safeguards */}
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4" /> Behavioral Intelligence & Recording
                <HelpCircle
                  className="h-3.5 w-3.5 text-muted-foreground cursor-help"
                  aria-label="What is behavioral intelligence?"
                >
                  <title>
                    Signals collected during the interview to support fair, evidence-based
                    evaluation.
                  </title>
                </HelpCircle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enable monitoring signals for integrity and fair evaluation.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <MonitoringToggleRow
                icon={<Camera className="h-4 w-4" />}
                title="Webcam Telemetry"
                description="Monitor presence & attention"
                checked={webcamRequired}
                onChange={setWebcamRequired}
              />
              <MonitoringToggleRow
                icon={<MonitorSmartphone className="h-4 w-4" />}
                title="Screen Tracking"
                description="Detect window/context switches"
                checked={screenShareRequired}
                onChange={setScreenShareRequired}
              />
              <MonitoringToggleRow
                icon={<ClipboardList className="h-4 w-4" />}
                title="Clipboard Dynamics"
                description="Track clipboard events"
                checked={clipboardTracking}
                onChange={setClipboardTracking}
              />
              <MonitoringToggleRow
                icon={<Eye className="h-4 w-4" />}
                title="Gaze Deviation"
                description="Detect attention anomalies"
                checked={gazeTelemetry}
                onChange={setGazeTelemetry}
              />
              <MonitoringToggleRow
                icon={<CloudCog className="h-4 w-4" />}
                title="Cloud Recording"
                description="Secure encrypted recording"
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
              <span className="absolute bottom-2 right-3 text-[11px] text-muted-foreground">
                {notes.length}/500
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-border shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isLoading ? "Scheduling…" : "Generate Link & Schedule"}
          </button>
        </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}