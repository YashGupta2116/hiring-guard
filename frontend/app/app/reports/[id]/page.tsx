"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { EvidenceTimeline } from "@/components/reports/evidence-timeline";
import {
  ArrowLeft,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  User,
  Calendar,
  Code,
  MessageSquare,
  HelpCircle,
  Clock,
  Printer,
  Share2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getReportById } = useStore();
  const { toast } = useToast();

  const report = getReportById(id);

  if (!report) {
    return (
      <EmptyState
        icon={FileText}
        title="Report Not Found"
        description="The requested decision intelligence report could not be found."
        actionLabel="Return to Reports"
        onAction={() => router.push("/app/reports")}
      />
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Report link copied",
      description: "Direct URL to this evaluation has been copied to your clipboard.",
      type: "success",
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up pb-12">
      {/* Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/app/reports" className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Reports
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Report #{report.id}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleShare} className="h-7.5 gap-1.5 text-xs">
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="h-7.5 gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Candidate Profile Banner */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <CandidateAvatar
              src={report.candidateAvatar}
              name={report.candidateName}
              size="xl"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">
                  {report.candidateName}
                </h1>
                <StatusBadge status={report.recommendation} size="sm" />
                <StatusBadge status={report.integrityBand} size="sm" />
              </div>
              <p className="text-xs font-medium text-foreground">{report.appliedRole}</p>
              <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3 pt-0.5">
                <span>Evaluated: {report.interviewDate}</span>
                <span>•</span>
                <span>Interviewer: {report.interviewerName}</span>
              </p>
            </div>
          </div>

          <Link href={`/app/candidates/${report.candidateId}`}>
            <Button size="sm" variant="outline" className="text-xs h-7.5 gap-1.5">
              <User className="h-3.5 w-3.5" /> Candidate Profile
            </Button>
          </Link>
        </div>
      </div>

      {/* Score Summary Metrics (De-carded Unified Block) */}
      <div className="grid grid-cols-2 md:grid-cols-4 rounded-lg border border-border bg-card divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
        {/* Overall Score */}
        <div className="p-4 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground block uppercase tracking-wider">
            Overall Score
          </span>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {report.overallScore}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Composite evaluation
          </span>
        </div>

        {/* Technical Score */}
        <div className="p-4 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground block uppercase tracking-wider">
            Technical Skill
          </span>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {report.technicalScore}%
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Algorithmic reasoning
          </span>
        </div>

        {/* Communication Score */}
        <div className="p-4 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground block uppercase tracking-wider">
            Communication
          </span>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {report.communicationScore}%
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Clarity & structure
          </span>
        </div>

        {/* Integrity Confidence Score */}
        <div className="p-4 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground block uppercase tracking-wider">
            Integrity Confidence
          </span>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {report.integrityConfidenceScore}%
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {report.integrityBand}
          </span>
        </div>
      </div>

      {/* 15 & 16. Multimodal Behavioral Integrity & Telemetry Analysis */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeader
          title="Multimodal Behavioral Integrity & Telemetry Analysis"
          description="Correlated observations across gaze telemetry, typing cadence, clipboard events, and baseline response latencies."
        >
          <StatusBadge status={report.integrityBand} size="sm" />
        </SectionHeader>

        {/* Professional Ethical Framework Notice */}
        <div className="rounded-md border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>Ethical Telemetry & Evidence Policy</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            The Integrity Confidence Score reflects baseline behavioral consistency and does not assert definitive intent. VeriTrust identifies correlated anomalies to inform, never replace, human judgment. Final hiring decisions remain strictly with the review panel.
          </p>
        </div>

        {/* Findings Synthesis */}
        <div className="space-y-1 pt-1">
          <h4 className="text-xs font-semibold text-foreground">
            Telemetry Synthesis & Observations
          </h4>
          <p className="text-xs text-foreground leading-relaxed bg-secondary/20 p-3 rounded-md border border-border/60">
            {report.integrityExplanation}
          </p>
        </div>

        {/* Signature Evidence Timeline */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Time-Coded Anomaly & Telemetry Evidence
            </h4>
            <span className="text-[10px] text-muted-foreground font-mono">
              {report.integrityEvidence.length} Events Logged
            </span>
          </div>

          <EvidenceTimeline events={report.integrityEvidence} />
        </div>
      </div>

      {/* Executive Summary, Strengths & Growth Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Executive Summary */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3 text-xs">
          <SectionHeader
            title="Executive Evaluation Summary"
            description="Interviewer synthesis and recommendation rationale"
          />

          <p className="text-muted-foreground leading-relaxed">
            {report.aiSummary}
          </p>

          <div className="pt-2 border-t border-border/60">
            <span className="font-semibold text-foreground block mb-1">
              Recommendation Rationale:
            </span>
            <p className="text-muted-foreground leading-relaxed italic bg-secondary/25 p-2 rounded border border-border/60">
              "{report.recommendationReasoning}"
            </p>
          </div>

          {report.interviewerNotes && (
            <div className="pt-2 border-t border-border/60">
              <span className="font-semibold text-foreground block mb-1">
                Interviewer Confidential Notes:
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {report.interviewerNotes}
              </p>
            </div>
          )}
        </div>

        {/* Demonstrated Competencies */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3 text-xs">
          <SectionHeader
            title="Demonstrated Competencies"
            description="Evaluated strengths and areas for future development"
          />

          <div className="space-y-1.5">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 block">
              Key Strengths:
            </span>
            <ul className="space-y-1.5 pl-1">
              {report.keyStrengths.map((str, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-border/60">
            <span className="font-semibold text-amber-700 dark:text-amber-400 block">
              Areas for Improvement:
            </span>
            <ul className="space-y-1.5 pl-1">
              {report.areasForImprovement.map((area, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Question-by-Question Rubric Breakdown */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeader
          title="Question-by-Question Technical Evaluation"
          description="In-depth problem-solving analysis and rubric comparisons"
        >
          <span className="text-xs text-muted-foreground font-mono">
            {report.questionEvaluations.length} Questions
          </span>
        </SectionHeader>

        <div className="space-y-4">
          {report.questionEvaluations.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-md border border-border/80 bg-secondary/15 p-4 space-y-3 text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-secondary text-foreground font-bold text-xs border border-border">
                    {idx + 1}
                  </span>
                  <h3 className="font-semibold text-foreground text-xs">
                    {q.questionTitle}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    Code Quality: {q.codeQualityRating}
                  </Badge>
                  <span className="font-semibold text-foreground text-xs">
                    {q.score} / 100
                  </span>
                </div>
              </div>

              {/* Candidate Approach */}
              <div>
                <span className="font-medium text-foreground block mb-0.5">
                  Candidate Approach & Reasoning:
                </span>
                <p className="text-muted-foreground leading-relaxed bg-card p-2.5 rounded border border-border/60">
                  {q.candidateAnswerSummary}
                </p>
              </div>

              {/* Expected Reasoning */}
              <div>
                <span className="font-medium text-foreground block mb-0.5">
                  Target Technical Benchmark:
                </span>
                <p className="text-muted-foreground leading-relaxed italic">
                  {q.expectedReasoning}
                </p>
              </div>

              {/* Rubric Evaluation */}
              <div className="rounded border border-border bg-card p-2.5 space-y-0.5">
                <span className="font-semibold text-foreground text-[11px] block">
                  Evaluation Rubric Assessment:
                </span>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  {q.aiEvaluation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
