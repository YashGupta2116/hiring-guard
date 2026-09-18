"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
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

export default function CandidateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getCandidateById, interviews, reports } = useStore();

  const [activeTab, setActiveTab] = useState<
    "overview" | "history" | "reports" | "competencies" | "notes"
  >("overview");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const candidate = getCandidateById(id);

  if (!candidate) {
    return (
      <EmptyState
        icon={Users}
        title="Candidate Profile Not Found"
        description="The requested candidate ID does not exist in your workspace."
        actionLabel="Back to Candidates"
        onAction={() => router.push("/app/candidates")}
      />
    );
  }

  const candidateInterviews = interviews.filter((i) => i.candidateId === id);
  const candidateReports = reports.filter((r) => r.candidateId === id);

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

        <Button
          onClick={() => setScheduleModalOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Schedule interview</span>
        </Button>
      </div>

      {/* 2. Candidate Profile Header Card */}
      <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Avatar + Details */}
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <CandidateAvatar
              src={candidate.avatar}
              name={candidate.name}
              size="xl"
            />

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                  {candidate.name}
                </h1>
                <StatusBadge status={candidate.status} size="sm" />
              </div>

              <p className="text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-300">
                {candidate.appliedRole}
              </p>

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

          {/* Right: Key 3 Metrics */}
          <div className="flex items-center gap-8 sm:gap-10 border-t lg:border-t-0 lg:border-l border-stone-200/80 dark:border-stone-800 pt-4 lg:pt-0 lg:pl-10 text-center shrink-0">
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">
                {candidate.averageScore > 0 ? `${candidate.averageScore}%` : "—"}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">
                Avg Score
              </span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">
                {candidate.interviewsTaken}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">
                Rounds
              </span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 block">
                {candidate.experienceYears}y
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 block font-medium">
                Experience
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Navigation Underline Tabs */}
      <div className="flex items-center gap-6 border-b border-stone-200 dark:border-stone-800 text-xs sm:text-sm font-medium overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "overview"
              ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent"
          )}
        >
          Score Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "history"
              ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent"
          )}
        >
          Interview History ({candidateInterviews.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "reports"
              ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent"
          )}
        >
          Reports ({candidateReports.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("competencies")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "competencies"
              ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent"
          )}
        >
          Strengths & Weaknesses
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notes")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "notes"
              ? "text-stone-900 dark:text-stone-100 font-semibold border-stone-900 dark:border-stone-100 -mb-[1px]"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border-transparent"
          )}
        >
          Evaluator Notes
        </button>
      </div>

      {/* 4. Tab 1: Score Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Candidate Background & Summary Card */}
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Candidate Background & Summary
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              {candidate.bio}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 mr-1">
                Skills:
              </span>
              {candidate.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 px-3 py-1 text-xs font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Behavioral & Technical Skill Comparison Card */}
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-6 shadow-2xs space-y-6">
            {/* Header with Title and Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Behavioral & Technical Skill Comparison
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Candidate evaluation ratings vs. organizational peer benchmark
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-stone-900 dark:bg-stone-100" />
                  <span>Candidate</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#B8AC94] dark:bg-stone-500" />
                  <span>Peer Benchmark</span>
                </div>
              </div>
            </div>

            {/* Custom Paired Horizontal Comparison Bars */}
            <div className="space-y-4 pt-2">
              {candidate.radarScores.map((item) => (
                <div key={item.skill} className="flex items-center gap-3 sm:gap-4">
                  {/* Skill Label */}
                  <div className="w-32 sm:w-44 text-right text-xs font-medium text-stone-700 dark:text-stone-300 shrink-0 leading-tight">
                    {item.skill}
                  </div>

                  {/* Paired Horizontal Bars */}
                  <div className="flex-1 space-y-1.5">
                    {/* Candidate Score Bar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 sm:h-3 rounded-full bg-stone-900 dark:bg-stone-100 transition-all duration-500 shrink-0"
                        style={{ width: `${(item.score / 100) * 85}%` }}
                      />
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 shrink-0">
                        {item.score}%
                      </span>
                    </div>

                    {/* Peer Benchmark Bar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 sm:h-3 rounded-full bg-[#B8AC94] dark:bg-stone-500 transition-all duration-500 shrink-0"
                        style={{ width: `${(item.benchmark / 100) * 85}%` }}
                      />
                      <span className="text-[11px] text-stone-500 dark:text-stone-400 shrink-0">
                        {item.benchmark}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interview History */}
      {activeTab === "history" && (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-2xs animate-fade-in-up">
          {candidateInterviews.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 italic p-6 text-center">
              No interview sessions recorded yet. Click "Schedule interview" to create a session.
            </p>
          ) : (
            candidateInterviews.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">
                      {item.jobRole}
                    </span>
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {item.interviewType}
                    </Badge>
                    <StatusBadge status={item.status} size="sm" />
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {item.date} at {item.time} ({item.durationMinutes}m) • Interviewer: {item.interviewerName}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.reportId && (
                    <Link href={`/app/reports/${item.reportId}`}>
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
          {candidateReports.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 italic p-6 text-center">
              No decision intelligence reports generated yet.
            </p>
          ) : (
            candidateReports.map((rep) => (
              <Link
                key={rep.id}
                href={`/app/reports/${rep.id}`}
                className="flex items-center justify-between p-4 hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors gap-3 block"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">
                      {rep.appliedRole} Report
                    </span>
                    <StatusBadge status={rep.recommendation} size="sm" />
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Evaluated on {rep.interviewDate} by {rep.interviewerName}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {rep.overallScore}/100
                    </span>
                    <span className="text-[10px] text-stone-400 block">
                      {rep.integrityConfidenceScore}% Integrity
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-stone-400" />
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Strengths & Weaknesses */}
      {activeTab === "competencies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-3 shadow-2xs">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block">
              Validated Technical Strengths
            </span>
            <ul className="space-y-2 text-xs">
              {candidate.strengths.map((str, i) => (
                <li key={i} className="flex items-start gap-2 text-stone-600 dark:text-stone-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-3 shadow-2xs">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 block">
              Identified Development Areas
            </span>
            <ul className="space-y-2 text-xs">
              {candidate.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-stone-600 dark:text-stone-300">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Tab 5: Evaluator Notes */}
      {activeTab === "notes" && (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-5 space-y-2.5 shadow-2xs text-xs animate-fade-in-up">
          <span className="font-semibold text-stone-900 dark:text-stone-100 block">
            Cumulative Evaluator Scratchpad
          </span>
          <p className="text-stone-600 dark:text-stone-300 leading-relaxed italic bg-stone-50 dark:bg-stone-800/60 p-4 rounded-xl border border-stone-200/70 dark:border-stone-700">
            "{candidate.notes || "No notes recorded yet."}"
          </p>
        </div>
      )}

      {/* Schedule Interview Modal */}
      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        defaultCandidateId={candidate.id}
      />
    </div>
  );
}
