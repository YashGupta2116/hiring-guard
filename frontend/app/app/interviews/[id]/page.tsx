"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
  MoreVertical,
  Edit2,
  Lock,
  Copy,
  ExternalLink,
  Plus,
  GitCommit,
  BarChart2,
  Mail,
  Phone,
  MapPin,
  ArrowUpRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { cn } from "@/lib/utils";

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getInterviewById, cancelInterview, candidates, updateInterview } = useStore();
  const { canConductInterview, canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  const [copied, setCopied] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const interview = getInterviewById(id);

  if (!interview) {
    return (
      <EmptyState
        icon={Calendar}
        title="Interview Session Not Found"
        description="The requested interview ID could not be located in your current workspace."
        actionLabel="Return to Interviews"
        onAction={() => router.push("/app/interviews")}
      />
    );
  }

  const candidate = candidates.find((c) => c.id === interview.candidateId);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(interview.candidateLink);
    setCopied(true);
    toast({
      title: "Interview link copied",
      description: "Candidate invitation link copied to clipboard.",
      type: "success",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    window.open(`/interview/${interview.token}`, "_blank");
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    const existing = interview.notes ? interview.notes + "\n\n" : "";
    updateInterview(interview.id, { notes: existing + noteText.trim() });
    setNoteText("");
    setIsAddingNote(false);
    toast({
      title: "Note Added",
      description: "Interviewer note saved successfully.",
      type: "success",
    });
  };

  const handleCancelConfirm = () => {
    if (!canDeleteInterview) {
      toast({
        title: "Permission Denied",
        description: "Only Admins can cancel interviews.",
        type: "error",
      });
      return;
    }
    cancelInterview(interview.id);
    toast({
      title: "Interview Cancelled",
      description: "Status changed to Cancelled.",
      type: "info",
    });
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto animate-fade-in-up pb-12">
      {/* 1. Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Link
            href="/app/interviews"
            className="hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Interviews
          </Link>
          <span className="text-neutral-300 dark:text-neutral-700">/</span>
          <span className="font-mono text-neutral-900 dark:text-white font-semibold">
            #{interview.token}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {interview.status === "Live" ? (
            <Link
              href={`/app/interviews/${interview.id}/live`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Join Live Room
              </Button>
            </Link>
          ) : (
            <Link
              href={`/app/interviews/${interview.id}/live`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                disabled={!canConductInterview}
                className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 h-9 shadow-xs"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                Start Live Room
              </Button>
            </Link>
          )}

          <button
            onClick={() => setConfirmCancelOpen(true)}
            className="h-9 w-9 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Candidate Profile Card */}
      <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Avatar & Candidate Details */}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <img
                src={interview.candidateAvatar}
                alt={interview.candidateName}
                className="h-16 w-16 rounded-full object-cover ring-1 ring-border"
              />
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
                  {interview.candidateName}
                </h1>
                {interview.status === "Live" ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                ) : interview.status === "Scheduled" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fef9ee] text-[#b45309] border border-[#fde68a] dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                    Scheduled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
                    {interview.status}
                  </span>
                )}

                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">
                  {interview.interviewType}
                </span>
              </div>

              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 pt-0.5">
                {interview.jobRole}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-neutral-400" />
                  {interview.candidateEmail}
                </span>
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

          {/* Right Action: View Full Profile */}
          <div className="shrink-0">
            <Link href={`/app/candidates/${candidate?.id || "cand-9"}`}>
              <Button
                variant="outline"
                className="border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 h-9 transition-colors"
              >
                View Full Profile <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Candidate Interview Access Link Box */}
      <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-800">
              <ExternalLink className="h-4 w-4" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">
                  Candidate Interview Access Link
                </h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Ready
                </span>
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-2">
                <span>
                  Token:{" "}
                  <strong className="text-emerald-700 dark:text-emerald-400 font-mono font-semibold">
                    {interview.token}
                  </strong>
                </span>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-neutral-400" />
                  Expires in 24 hours
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 h-8.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>

            <Button
              onClick={handleOpenLink}
              className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 h-8.5 shadow-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Link
            </Button>
          </div>
        </div>

        {/* Encrypted URL Box */}
        <div className="mt-3.5 flex items-center justify-between rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/40 px-3.5 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-300 select-all overflow-hidden">
          <span className="truncate">{interview.candidateLink}</span>
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800 rounded px-2 py-0.5 text-[10px] font-bold tracking-wider shrink-0 ml-2">
            <Lock className="h-2.5 w-2.5" />
            ENCRYPTED
          </span>
        </div>
      </div>

      {/* 4. Bottom Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: Schedule & Monitoring */}
        <div className="space-y-5">
          {/* Card: Schedule & Interviewer Assignment */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
                    Schedule & Interviewer Assignment
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Allocated duration and lead interviewer details
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="border border-neutral-200 dark:border-neutral-800 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 h-8 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <Edit2 className="h-3 w-3" />
                Edit Schedule
              </Button>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Date & Time</div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-white leading-tight">
                  {interview.date} at {interview.time}
                </div>
                <div className="text-[11px] text-neutral-400">(Tuesday)</div>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Duration</div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-white leading-tight">
                  {interview.durationMinutes} Minutes
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-1">
                <div className="h-7 w-7 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
                  <Video className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-neutral-500">Session Recording</div>
                <div className="font-semibold text-xs text-emerald-700 dark:text-emerald-400 leading-tight">
                  {interview.recordingEnabled ? "Active (Encrypted)" : "Disabled"}
                </div>
              </div>
            </div>

            {/* Interviewers Row */}
            <div className="border-t border-neutral-100 dark:border-neutral-800/80 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Assigned Lead Interviewer */}
              <div className="space-y-1.5 min-w-0">
                <div className="text-[11px] text-neutral-500">Assigned Lead Interviewer</div>
                <div className="flex items-center gap-2.5">
                  <img
                    src={interview.interviewerAvatar}
                    alt={interview.interviewerName}
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-neutral-900 dark:text-white">
                        {interview.interviewerName}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                        You
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400">Lead Interviewer</p>
                  </div>
                </div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-neutral-200 dark:bg-neutral-800" />

              {/* Additional Interviewers */}
              <div className="space-y-1.5 min-w-0">
                <div className="text-[11px] text-neutral-500">Additional Interviewers</div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <img
                      src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
                      alt="Dr. Elena Vance"
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-neutral-900"
                    />
                    <img
                      src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80"
                      alt="Sarah Lin"
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-neutral-900"
                    />
                    <img
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                      alt="Alexei Petrov"
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-neutral-900"
                    />
                  </div>
                  <div className="h-7 w-7 rounded-full border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800">
                    <Plus className="h-3 w-3" />
                  </div>
                  <span className="text-xs text-neutral-500 ml-1">2 others invited</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Behavioral Monitoring & Sandbox */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                <BarChart2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
                  Behavioral Monitoring & Sandbox
                </h3>
                <p className="text-xs text-neutral-500">
                  Calibrated telemetry channels and coding environment
                </p>
              </div>
            </div>

            {/* 4 Status Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-2">
                <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
                  <Video className="h-3.5 w-3.5" />
                </div>
                <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">
                  Video & Audio
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  Enabled
                </span>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-2">
                <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
                  <Monitor className="h-3.5 w-3.5" />
                </div>
                <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">
                  Screen Monitoring
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  Enabled
                </span>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-2">
                <div className="h-7 w-7 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
                  <Eye className="h-3.5 w-3.5" />
                </div>
                <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">
                  Eye Tracking
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  Enabled
                </span>
              </div>

              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 space-y-2">
                <div className="h-7 w-7 rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 flex items-center justify-center">
                  <Code2 className="h-3.5 w-3.5" />
                </div>
                <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">
                  Code Environment
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  Enabled
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Timeline & Notes */}
        <div className="space-y-5">
          {/* Card: Interview Timeline & Stages */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <GitCommit className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
                    Interview Timeline & Stages
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Historical milestone audit trail
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="border border-neutral-200 dark:border-neutral-800 text-xs px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 h-8"
              >
                View All
              </Button>
            </div>

            {/* Vertical Timeline */}
            <div className="relative pl-6 space-y-6 pt-2 pb-1 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
              {/* Stage 1: Created */}
              <div className="relative text-xs">
                <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-900 text-white ring-4 ring-white dark:ring-neutral-900">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900 dark:text-white">Created</span>
                    <span className="text-[11px] text-neutral-400 font-mono">2026-09-13 14:20</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Interview created by Sarah Lin</p>
                </div>
              </div>

              {/* Stage 2: Scheduled */}
              <div className="relative text-xs">
                <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-white dark:ring-neutral-900">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900 dark:text-white">Scheduled</span>
                    <span className="text-[11px] text-neutral-400 font-mono">2026-09-13 14:22</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Candidate token active</p>
                </div>
              </div>

              {/* Stage 3: Reminder Sent */}
              <div className="relative text-xs">
                <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-400 text-white ring-4 ring-white dark:ring-neutral-900">
                  <Clock className="h-3 w-3" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900 dark:text-white">Reminder Sent</span>
                    <span className="text-[11px] text-neutral-400 font-mono">2026-09-14 10:00</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Calendar invite sent to candidate</p>
                </div>
              </div>

              {/* Stage 4: Upcoming */}
              <div className="relative text-xs">
                <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-neutral-300 bg-white dark:bg-neutral-900 ring-4 ring-white dark:ring-neutral-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900 dark:text-white">Upcoming</span>
                    <span className="text-[11px] text-neutral-400 font-mono">2026-09-15 15:00</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Interview starts in 2 hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Notes */}
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Notes</h3>
                  <p className="text-xs text-neutral-500">
                    Private notes about this candidate
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setIsAddingNote(!isAddingNote)}
                className="border border-neutral-200 dark:border-neutral-800 text-xs px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 h-8 flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Note
              </Button>
            </div>

            {/* Note creation / display */}
            {isAddingNote && (
              <div className="space-y-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type your interview or evaluation notes here..."
                  className="w-full text-xs p-2.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:border-neutral-400"
                  rows={3}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsAddingNote(false)}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    className="bg-neutral-900 text-white text-xs h-7"
                  >
                    Save Note
                  </Button>
                </div>
              </div>
            )}

            {interview.notes ? (
              <div className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3.5 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed italic">
                "{interview.notes}"
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic pt-1">
                No notes added for this interview yet. Click "+ Add Note" to create one.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancel Interview Session?"
        description={`Are you sure you want to cancel the interview for ${interview.candidateName}? This will revoke candidate room access.`}
        confirmText="Cancel Interview"
        variant="destructive"
        onConfirm={handleCancelConfirm}
      />
    </div>
  );
}
