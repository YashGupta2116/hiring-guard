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
import { SectionHeader } from "@/components/ui/section-header";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import {
  Users,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Star,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Plus,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
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
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up pb-12">
      {/* Top Breadcrumb & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/app/candidates" className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Candidates
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{candidate.name}</span>
        </div>

        <Button
          size="sm"
          onClick={() => setScheduleModalOpen(true)}
          className="text-xs h-8 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Schedule interview
        </Button>
      </div>

      {/* Candidate Profile Header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <CandidateAvatar
              src={candidate.avatar}
              name={candidate.name}
              size="xl"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">
                  {candidate.name}
                </h1>
                <StatusBadge status={candidate.status} size="sm" />
              </div>
              <p className="text-xs font-medium text-foreground">{candidate.appliedRole}</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {candidate.email}
                </span>
                {candidate.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {candidate.phone}
                  </span>
                )}
                {candidate.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {candidate.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-6 text-center">
            <div>
              <span className="text-xl font-bold text-foreground block">
                {candidate.averageScore > 0 ? `${candidate.averageScore}%` : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">Avg Score</span>
            </div>
            <div>
              <span className="text-xl font-bold text-foreground block">
                {candidate.interviewsTaken}
              </span>
              <span className="text-[10px] text-muted-foreground">Rounds</span>
            </div>
            <div>
              <span className="text-xl font-bold text-foreground block">
                {candidate.experienceYears}y
              </span>
              <span className="text-[10px] text-muted-foreground">Experience</span>
            </div>
          </div>
        </div>
      </div>

      {/* 14. Candidate Profile Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-1 text-xs">
        <button
          onClick={() => setActiveTab("overview")}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "overview"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          Score Overview
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "history"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          Interview History ({candidateInterviews.length})
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "reports"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          Reports ({candidateReports.length})
        </button>

        <button
          onClick={() => setActiveTab("competencies")}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "competencies"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          Strengths & Weaknesses
        </button>

        <button
          onClick={() => setActiveTab("notes")}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "notes"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          Evaluator Notes
        </button>
      </div>

      {/* Tab 1: Overview & Score Radar */}
      {activeTab === "overview" && (
        <div className="space-y-5 animate-fade-in-up">
          {/* Bio & Skills */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-xs">
            <span className="font-semibold text-foreground text-xs block">
              Candidate Background & Summary
            </span>
            <p className="text-muted-foreground leading-relaxed">{candidate.bio}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-foreground mr-1">Skills:</span>
              {candidate.skills.map((s) => (
                <span
                  key={s}
                  className="bg-secondary text-foreground border border-border/60 px-2 py-0.5 rounded text-[11px] font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Skill Benchmark Chart */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <SectionHeader
              title="Behavioral & Technical Skill Comparison"
              description="Candidate evaluation ratings vs. organizational peer benchmark"
            />
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={candidate.radarScores} layout="vertical">
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                  />
                  <YAxis
                    dataKey="skill"
                    type="category"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    width={110}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      borderRadius: "0.375rem",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar
                    dataKey="score"
                    name="Candidate Score"
                    fill="hsl(var(--foreground))"
                    radius={[0, 2, 2, 0]}
                  />
                  <Bar
                    dataKey="benchmark"
                    name="Benchmark"
                    fill="hsl(var(--muted-foreground))"
                    radius={[0, 2, 2, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interview History */}
      {activeTab === "history" && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden animate-fade-in-up">
          {candidateInterviews.length === 0 ? (
            <p className="text-xs text-muted-foreground italic p-6 text-center">
              No interview sessions recorded yet. Click "Schedule interview" to create a session.
            </p>
          ) : (
            candidateInterviews.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-secondary/40 transition-colors gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-xs">
                      {item.jobRole}
                    </span>
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {item.interviewType}
                    </Badge>
                    <StatusBadge status={item.status} size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.date} at {item.time} ({item.durationMinutes}m) • Interviewer: {item.interviewerName}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
        <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden animate-fade-in-up">
          {candidateReports.length === 0 ? (
            <p className="text-xs text-muted-foreground italic p-6 text-center">
              No decision intelligence reports generated yet.
            </p>
          ) : (
            candidateReports.map((rep) => (
              <Link
                key={rep.id}
                href={`/app/reports/${rep.id}`}
                className="flex items-center justify-between p-3.5 hover:bg-secondary/40 transition-colors gap-3 block"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-xs">
                      {rep.appliedRole} Report
                    </span>
                    <StatusBadge status={rep.recommendation} size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Evaluated on {rep.interviewDate} by {rep.interviewerName}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-xs font-semibold text-foreground">
                      {rep.overallScore}/100
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {rep.integrityConfidenceScore}% Integrity
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Strengths & Weaknesses */}
      {activeTab === "competencies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block">
              Validated Technical Strengths
            </span>
            <ul className="space-y-1.5 text-xs">
              {candidate.strengths.map((str, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 block">
              Identified Development Areas
            </span>
            <ul className="space-y-1.5 text-xs">
              {candidate.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Tab 5: Evaluator Notes */}
      {activeTab === "notes" && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs animate-fade-in-up">
          <span className="font-semibold text-foreground block">
            Cumulative Evaluator Scratchpad
          </span>
          <p className="text-muted-foreground leading-relaxed italic bg-secondary/30 p-3 rounded-md border border-border/60">
            "{candidate.notes || "No notes recorded yet."}"
          </p>
        </div>
      )}

      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        defaultCandidateId={candidate.id}
      />
    </div>
  );
}
