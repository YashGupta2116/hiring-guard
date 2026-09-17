"use client";

import React, { useState } from "react";
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
} from "lucide-react";

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCandidateId?: string;
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
      <DialogHeader>
        <div className="flex items-center gap-2 text-foreground">
          <Calendar className="h-4 w-4" />
          <DialogTitle>
            {createdInterview ? "Interview Scheduled!" : "Schedule Technical Interview"}
          </DialogTitle>
        </div>
        <DialogDescription>
          {createdInterview
            ? "Candidate access link is ready. Share with candidate or join live room."
            : "Configure role details, coding sandbox, and multimodal telemetry monitoring."}
        </DialogDescription>
      </DialogHeader>

      {createdInterview ? (
        <div className="space-y-5 animate-fade-in-up">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
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

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                window.location.href = `/app/interviews/${createdInterview.id}`;
              }}
            >
              View Interview Details
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={handleSchedule} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Candidate Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Candidate</label>
              <select
                value={candidateId}
                onChange={(e) => handleCandidateChange(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.appliedRole})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Role */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Job Role</label>
              <input
                type="text"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
              />
            </div>

            {/* Interviewer */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Interviewer</label>
              <select
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Interview Type */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Interview Type</label>
              <select
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value as InterviewType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
              >
                <option value="Distributed Systems">Distributed Systems</option>
                <option value="Frontend Architecture">Frontend Architecture</option>
                <option value="Full Stack Coding">Full Stack Coding</option>
                <option value="Algorithms & Data Structures">Algorithms & Data Structures</option>
                <option value="Backend Engineering">Backend Engineering</option>
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
              />
            </div>

            {/* Time & Duration */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
                >
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>60 mins</option>
                  <option value={90}>90 mins</option>
                </select>
              </div>
            </div>
          </div>

          {/* Coding & Question Config */}
          <div className="rounded-xl border border-border bg-card/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Code className="h-4 w-4" /> Coding Sandbox & Question
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded border border-input bg-background px-2 py-1 text-[11px] text-foreground font-mono"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </div>
            <select
              value={selectedQuestionId}
              onChange={(e) => setSelectedQuestionId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
            >
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.difficulty}] {q.title}
                </option>
              ))}
            </select>
          </div>

          {/* Monitoring & Integrity Safeguards */}
          <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
              <Shield className="h-4 w-4" /> Behavioral Intelligence & Recording
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={webcamRequired}
                  onChange={(e) => setWebcamRequired(e.target.checked)}
                  className="rounded border-input text-foreground focus:ring-ring"
                />
                <span>Webcam Telemetry</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={screenShareRequired}
                  onChange={(e) => setScreenShareRequired(e.target.checked)}
                  className="rounded border-input text-foreground focus:ring-ring"
                />
                <span>Screen Tracking</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clipboardTracking}
                  onChange={(e) => setClipboardTracking(e.target.checked)}
                  className="rounded border-input text-foreground focus:ring-ring"
                />
                <span>Clipboard Dynamics</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={gazeTelemetry}
                  onChange={(e) => setGazeTelemetry(e.target.checked)}
                  className="rounded border-input text-foreground focus:ring-ring"
                />
                <span>Gaze Deviation</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  onChange={(e) => setRecordingEnabled(e.target.checked)}
                  className="rounded border-input text-foreground focus:ring-ring"
                />
                <span>Cloud Recording</span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Interviewer Notes</label>
            <input
              type="text"
              placeholder="Candidate background context, areas to focus on..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" isLoading={isLoading}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Link & Schedule
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
