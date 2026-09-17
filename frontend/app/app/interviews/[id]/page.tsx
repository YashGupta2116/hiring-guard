"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { InterviewLinkCard } from "@/components/interviews/interview-link-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Calendar,
  Clock,
  User,
  Shield,
  Code,
  Video,
  FileText,
  Zap,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  ChevronRight,
  Edit,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getInterviewById, cancelInterview, candidates } = useStore();
  const { canConductInterview, canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

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
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up pb-12">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/app/interviews" className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Interviews
          </Link>
          <span>/</span>
          <span className="font-mono text-foreground font-semibold">#{interview.token}</span>
        </div>

        <div className="flex items-center gap-2">
          {interview.status === "Live" ? (
            <Link href={`/app/interviews/${interview.id}/live`}>
              <Button size="sm" className="h-8 gap-1.5 bg-rose-600 hover:bg-rose-500 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Join Live Room
              </Button>
            </Link>
          ) : interview.status === "Completed" && interview.reportId ? (
            <Link href={`/app/reports/${interview.reportId}`}>
              <Button size="sm" className="h-8 gap-1.5">
                <FileText className="h-3.5 w-3.5" /> View Decision Report
              </Button>
            </Link>
          ) : (
            <Link href={`/app/interviews/${interview.id}/live`}>
              <Button
                size="sm"
                disabled={!canConductInterview}
                className="h-8 gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" /> Start Live Room
              </Button>
            </Link>
          )}

          {interview.status !== "Completed" && interview.status !== "Cancelled" && canDeleteInterview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmCancelOpen(true)}
              className="h-8 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* 13. Candidate Header (De-carded, Clean Reference Layout) */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <CandidateAvatar
              src={interview.candidateAvatar}
              name={interview.candidateName}
              size="xl"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">
                  {interview.candidateName}
                </h1>
                <StatusBadge status={interview.status} size="sm" />
                <Badge variant="outline" size="sm" className="text-[10px]">
                  {interview.interviewType}
                </Badge>
              </div>
              <p className="text-xs font-medium text-foreground">{interview.jobRole}</p>
              <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2.5 pt-0.5">
                <span>{interview.candidateEmail}</span>
                {candidate?.phone && <span>• {candidate.phone}</span>}
                {candidate?.location && <span>• {candidate.location}</span>}
              </p>
            </div>
          </div>

          {candidate && (
            <div className="shrink-0">
              <Link href={`/app/candidates/${candidate.id}`}>
                <Button size="sm" variant="outline" className="text-xs h-7.5 gap-1.5">
                  Full Candidate Profile <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Candidate Interview Link */}
      <InterviewLinkCard
        token={interview.token}
        candidateLink={interview.candidateLink}
        isActive={interview.status !== "Completed" && interview.status !== "Cancelled"}
      />

      {/* Grid: Details & Stages Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Session Configuration & Monitoring */}
        <div className="lg:col-span-7 space-y-5">
          {/* Schedule & Assignment */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <SectionHeader
              title="Schedule & Interviewer Assignment"
              description="Allocated duration and lead interviewer details"
            />

            <div className="grid grid-cols-2 gap-3 py-2 border-t border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Date & Time</span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {interview.date} at {interview.time}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Allocated Duration</span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {interview.durationMinutes} Minutes
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 py-2 border-t border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Assigned Lead Interviewer</span>
                <div className="flex items-center gap-2 mt-1">
                  <CandidateAvatar
                    src={interview.interviewerAvatar}
                    name={interview.interviewerName}
                    size="sm"
                  />
                  <span className="font-semibold text-foreground">{interview.interviewerName}</span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Session Recording</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {interview.recordingEnabled ? "Active (Encrypted)" : "Disabled"}
                </span>
              </div>
            </div>

            {interview.notes && (
              <div className="pt-2 border-t border-border/60 text-xs">
                <span className="text-muted-foreground block text-[11px]">Interviewer Notes</span>
                <p className="mt-1 text-foreground leading-relaxed italic bg-secondary/30 p-2.5 rounded-md border border-border/60">
                  "{interview.notes}"
                </p>
              </div>
            )}
          </div>

          {/* Behavioral Monitoring & Sandbox */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <SectionHeader
              title="Behavioral Monitoring & Sandbox"
              description="Calibrated telemetry channels and coding environment"
            />

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/60">
              <div className="flex items-center gap-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Webcam Telemetry: <strong className="text-foreground">Active</strong></span>
              </div>
              <div className="flex items-center gap-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Gaze Baseline: <strong className="text-foreground">Calibrated</strong></span>
              </div>
              <div className="flex items-center gap-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Clipboard Tracking: <strong className="text-foreground">Active</strong></span>
              </div>
              <div className="flex items-center gap-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Screen Feed: <strong className="text-foreground">Required</strong></span>
              </div>
            </div>

            {interview.codingRoundConfig && (
              <div className="rounded-md border border-border/80 bg-secondary/30 p-3 space-y-1 mt-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Code className="h-3.5 w-3.5" /> Coding Environment
                  </span>
                  <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                    {interview.codingRoundConfig.language.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Candidate will code inside an isolated Monaco editor sandbox with simulated test runner.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Columns: Lifecycle Stages Timeline */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <SectionHeader
              title="Interview Timeline & Stages"
              description="Historical milestone audit trail"
            />

            <div className="relative pl-6 space-y-5 pt-2 before:absolute before:left-2.5 before:top-3 before:bottom-2 before:w-px before:bg-border">
              {interview.timeline.map((stage, idx) => (
                <div key={idx} className="relative text-xs">
                  <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background ring-4 ring-card">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {stage.stage}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {stage.timestamp}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {stage.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
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
