"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Loader2,
  FileText,
  ArrowRight,
  Shield,
} from "lucide-react";

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getInterviewById, reports } = useStore();

  const interview = getInterviewById(id);
  const report =
    reports.find((r) => r.interviewId === id) ||
    reports.find((r) => r.candidateId === interview?.candidateId) ||
    reports[2];

  const steps = [
    { title: "Processing audio transcript and speech cadence...", delay: 600 },
    { title: "Evaluating code AST, complexity & test assertions...", delay: 1400 },
    { title: "Correlating behavioral signals & gaze telemetry...", delay: 2200 },
    { title: "Generating interview summary & rubric scoring...", delay: 3000 },
    { title: "Synthesizing Integrity Confidence Score & Anomaly Timeline...", delay: 3800 },
  ];

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    steps.forEach((step, idx) => {
      const t = setTimeout(() => {
        setCurrentStepIndex(idx + 1);
        if (idx === steps.length - 1) {
          setIsCompleted(true);
        }
      }, step.delay);
      timeouts.push(t);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center py-12 px-4 max-w-lg mx-auto text-center animate-fade-in-up">
      {/* Top Icon */}
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card text-foreground">
        <Shield className="h-7 w-7" />
      </div>

      <div className="mb-2">
        <Badge variant="outline" size="sm" className="text-[10px]">
          {isCompleted ? "Synthesis Complete" : "Pipeline Processing"}
        </Badge>
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground">
        {isCompleted
          ? "Decision Intelligence Report Ready"
          : "Analyzing Technical Session..."}
      </h1>

      <p className="mt-1 text-xs text-muted-foreground max-w-sm leading-relaxed">
        {isCompleted
          ? `Multimodal synthesis complete for ${interview?.candidateName || "the candidate"}.`
          : "Correlating video observations, speech pacing, code insertions, and baseline telemetry."}
      </p>

      {/* Progress Pipeline Steps Box */}
      <div className="mt-6 w-full rounded-lg border border-border bg-card p-4 text-left space-y-3">
        {steps.map((step, idx) => {
          const isDone = currentStepIndex > idx;
          const isCurrent = currentStepIndex === idx;

          return (
            <div
              key={idx}
              className={`flex items-center gap-2.5 text-xs transition-colors ${
                isDone
                  ? "text-foreground font-medium"
                  : isCurrent
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground/50"
              }`}
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <span className="truncate text-[11px]">{step.title}</span>
            </div>
          );
        })}
      </div>

      {/* Action Button once ready */}
      {isCompleted && (
        <div className="mt-6 flex items-center gap-2.5 animate-fade-in-up">
          <Button
            size="sm"
            onClick={() => router.push(`/app/reports/${report.id}`)}
            className="gap-1.5 text-xs h-8"
          >
            <FileText className="h-3.5 w-3.5" /> View Decision Report <ArrowRight className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/app/interviews")}
            className="text-xs h-8"
          >
            Back to Interviews
          </Button>
        </div>
      )}
    </div>
  );
}
