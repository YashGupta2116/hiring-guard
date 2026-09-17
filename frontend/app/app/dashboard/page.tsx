"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock,
  FileText,
  Plus,
  ArrowRight,
  TrendingUp,
  UserPlus,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat, StatGroup } from "@/components/ui/stat";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { GenerateQuestionModal } from "@/components/questions/generate-question-modal";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

export default function DashboardPage() {
  const router = useRouter();
  const { interviews, candidates, reports, currentUser } = useStore();

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const totalInterviews = interviews.length;
  const upcomingInterviews = interviews.filter((i) => i.status === "Scheduled");
  const completedInterviews = interviews.filter((i) => i.status === "Completed");
  const liveInterviews = interviews.filter((i) => i.status === "Live");
  const pendingReports = reports.filter((r) => r.status === "Pending Review");

  const weeklyVolumeData = [
    { day: "Mon", count: 3 },
    { day: "Tue", count: 5 },
    { day: "Wed", count: 4 },
    { day: "Thu", count: 6 },
    { day: "Fri", count: 5 },
    { day: "Sat", count: 2 },
    { day: "Sun", count: 1 },
  ];

  const scoreDistributionData = [
    { range: "< 60", candidates: 1 },
    { range: "60-69", candidates: 2 },
    { range: "70-79", candidates: 3 },
    { range: "80-89", candidates: 5 },
    { range: "90-100", candidates: 4 },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 8. Page Header */}
      <PageHeader
        title="Dashboard"
        description="Daily operational overview of candidate pipelines, live telemetry, and review queues."
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCandidateModalOpen(true)}
          className="text-xs gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Candidate</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setQuestionModalOpen(true)}
          className="text-xs gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Question Bank</span>
        </Button>

        <Button
          size="sm"
          onClick={() => setScheduleModalOpen(true)}
          disabled={currentUser.role === "Viewer"}
          className="text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Schedule Interview
        </Button>
      </PageHeader>

      {/* Active Live Session Alert Bar (Restrained, Analytical) */}
      {liveInterviews.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-border bg-card text-xs">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-foreground">
                Active Technical Round: {liveInterviews[0].candidateName}
              </span>
              <span className="text-muted-foreground ml-2">
                {liveInterviews[0].jobRole} • Room #{liveInterviews[0].token}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/interview/${liveInterviews[0].token}`} target="_blank">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1">
                <ExternalLink className="h-3 w-3" /> Candidate Link
              </Button>
            </Link>
            <Link href={`/app/interviews/${liveInterviews[0].id}/live`}>
              <Button size="sm" className="h-7 text-xs px-2.5">
                Join Room
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 9. Metrics Row: Clean unified metric bar with dividing lines (de-carded) */}
      <StatGroup>
        <Stat
          label="Total Interviews"
          value={totalInterviews}
          change="+14% this month"
          trend="up"
        />
        <Stat
          label="Upcoming Sessions"
          value={upcomingInterviews.length}
          change="Next: Today 15:00"
          trend="neutral"
        />
        <Stat
          label="Completed Rounds"
          value={completedInterviews.length}
          change="87% completion rate"
          trend="up"
        />
        <Stat
          label="Pending Review"
          value={pendingReports.length}
          change={pendingReports.length > 0 ? "Human review recommended" : "All cleared"}
          trend={pendingReports.length > 0 ? "warning" : "up"}
        />
      </StatGroup>

      {/* Section Divider */}
      <div className="border-t border-border/60" />

      {/* Main Content: Upcoming Technical Sessions & Recent Decision Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Upcoming Technical Sessions */}
        <div className="lg:col-span-7 space-y-3">
          <SectionHeader
            title="Upcoming Technical Sessions"
            description="Scheduled sessions, allocated times, and room links"
          >
            <Link
              href="/app/interviews"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              All interviews <ChevronRight className="h-3 w-3" />
            </Link>
          </SectionHeader>

          <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
            {interviews.slice(0, 5).map((interview) => (
              <div
                key={interview.id}
                className="flex items-center justify-between p-3 hover:bg-secondary/40 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CandidateAvatar
                    src={interview.candidateAvatar}
                    name={interview.candidateName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {interview.candidateName}
                      </span>
                      <StatusBadge status={interview.status} size="sm" />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {interview.jobRole} • {interview.date} at {interview.time} ({interview.durationMinutes}m)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {interview.status === "Live" ? (
                    <Link href={`/app/interviews/${interview.id}/live`}>
                      <Button size="sm" className="h-7 text-xs px-2.5">
                        Join
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/app/interviews/${interview.id}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                        Details
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 Columns: Recent Decision Intelligence Reports */}
        <div className="lg:col-span-5 space-y-3">
          <SectionHeader
            title="Recent Decision Intelligence"
            description="Evaluation scores and integrity confidence ratings"
          >
            <Link
              href="/app/reports"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              All reports <ChevronRight className="h-3 w-3" />
            </Link>
          </SectionHeader>

          <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
            {reports.slice(0, 4).map((report) => (
              <Link
                key={report.id}
                href={`/app/reports/${report.id}`}
                className="flex items-center justify-between p-3 hover:bg-secondary/40 transition-colors gap-3 block"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CandidateAvatar
                    src={report.candidateAvatar}
                    name={report.candidateName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {report.candidateName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{report.appliedRole}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-medium text-foreground">
                        Score: {report.overallScore}/100
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-[11px] text-muted-foreground">
                        {report.integrityConfidenceScore}% Integrity
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <StatusBadge status={report.integrityBand} size="sm" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Section Divider */}
      <div className="border-t border-border/60" />

      {/* Analytics Snapshot: Clean charts styled with neutral palette */}
      <div className="space-y-3">
        <SectionHeader
          title="Recruiting & Pipeline Velocity"
          description="Aggregated throughput and historical candidate score performance"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground">Weekly Interview Throughput</span>
              <span className="text-[11px] text-muted-foreground">Last 7 days</span>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyVolumeData}>
                  <XAxis
                    dataKey="day"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
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
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Interviews"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.5}
                    fillOpacity={0.08}
                    fill="hsl(var(--foreground))"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground">Score Distribution</span>
              <span className="text-[11px] text-muted-foreground">Benchmark average: 86%</span>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistributionData}>
                  <XAxis
                    dataKey="range"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
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
                  <Bar
                    dataKey="candidates"
                    name="Candidates"
                    fill="hsl(var(--muted-foreground))"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} />
      <AddCandidateModal open={candidateModalOpen} onOpenChange={setCandidateModalOpen} />
      <GenerateQuestionModal open={questionModalOpen} onOpenChange={setQuestionModalOpen} />
    </div>
  );
}
