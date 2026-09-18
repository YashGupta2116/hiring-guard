"use client";

import React from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { SessionPill } from "@/components/ui/session-pill";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import {
  FileText,
  Trash2,
  Video,
  User,
  Code2,
  Layers,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useStore } from "@/lib/store/interview-store";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface TableViewProps {
  interviews: Interview[];
}

type RoundCategory = "Technical" | "Behavioral" | "Coding" | "System Design";

const ROUND_STYLE: Record<
  RoundCategory,
  { icon: React.ElementType; classes: string }
> = {
  Technical: {
    icon: Video,
    classes: "bg-blue-100/70 dark:bg-blue-950/40 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },
  Behavioral: {
    icon: User,
    classes: "bg-violet-100/70 dark:bg-violet-950/40 border-violet-500/20 text-violet-700 dark:text-violet-300",
  },
  Coding: {
    icon: Code2,
    classes: "bg-green-100/70 dark:bg-green-950/40 border-green-500/20 text-green-700 dark:text-green-300",
  },
  "System Design": {
    icon: Layers,
    classes: "bg-violet-100/70 dark:bg-violet-950/40 border-violet-500/20 text-violet-700 dark:text-violet-300",
  },
};

// The data model tracks the interview's subject area (interviewType), not its
// round format. This derives a display category from that + whether a coding
// round is configured, so the Type column has a sensible badge to show.
function roundCategory(interview: Interview): RoundCategory {
  if (interview.codingRoundConfig) return "Coding";
  switch (interview.interviewType) {
    case "Algorithms & Data Structures":
      return "Coding";
    case "Distributed Systems":
      return "System Design";
    case "Frontend Architecture":
    case "Backend Engineering":
    default:
      return "Technical";
  }
}

export function TableView({ interviews }: TableViewProps) {
  const { cancelInterview } = useStore();
  const { canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  const handleCancel = (id: string, name: string) => {
    if (!canDeleteInterview) {
      toast({
        title: "Action Restricted",
        description: "Only Admins can cancel interviews.",
        type: "error",
      });
      return;
    }
    cancelInterview(id);
    toast({
      title: "Interview Cancelled",
      description: `Session with ${name} marked as cancelled.`,
      type: "info",
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="border-b border-border bg-secondary/35 text-muted-foreground font-medium text-[11px]">
          <tr>
            <th className="px-3.5 py-2">Candidate</th>
            <th className="px-3.5 py-2">Role</th>
            <th className="px-3.5 py-2">Type</th>
            <th className="px-3.5 py-2">Date & Time</th>
            <th className="px-3.5 py-2">Duration</th>
            <th className="px-3.5 py-2">Status</th>
            <th className="px-3.5 py-2">Interviewer</th>
            <th className="px-3.5 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {interviews.map((interview) => {
            const round = roundCategory(interview);
            const roundStyle = ROUND_STYLE[round];
            const RoundIcon = roundStyle.icon;

            return (
              <tr
                key={interview.id}
                className="hover:bg-secondary/40 transition-colors"
              >
                {/* Candidate */}
                <td className="px-3.5 py-2">
                  <div className="flex items-center gap-2.5">
                    <CandidateAvatar
                      src={interview.candidateAvatar}
                      name={interview.candidateName}
                      size="md"
                    />
                    <div>
                      <div className="font-semibold text-foreground text-xs">
                        {interview.candidateName}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {interview.candidateEmail}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-3.5 py-2 font-medium text-foreground text-xs">
                  {interview.jobRole}
                </td>

                {/* Type */}
                <td className="px-3.5 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      roundStyle.classes
                    )}
                  >
                    <RoundIcon className="h-3 w-3 shrink-0" />
                    {round}
                  </span>
                </td>

                {/* Date & Time */}
                <td className="px-3.5 py-2 text-foreground whitespace-nowrap">
                  <span className="font-medium">{interview.date}</span>
                  <span className="text-muted-foreground ml-1.5 text-[11px]">{interview.time}</span>
                </td>

                {/* Duration */}
                <td className="px-3.5 py-2 text-muted-foreground text-[11px]">
                  {interview.durationMinutes}m
                </td>

                {/* Status */}
                <td className="px-3.5 py-2">
                  <SessionPill status={interview.status} size="sm" />
                </td>

                {/* Interviewer */}
                <td className="px-3.5 py-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <CandidateAvatar
                      src={interview.interviewerAvatar}
                      name={interview.interviewerName}
                      size="sm"
                    />
                    <span className="truncate">{interview.interviewerName.split(" ")[0]}</span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-3.5 py-2 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {interview.status === "Live" && (
                      <Link href={`/app/interviews/${interview.id}/live`}>
                        <Button size="sm" className="h-6.5 text-[11px] px-2">
                          Join
                        </Button>
                      </Link>
                    )}

                    {interview.status === "Completed" && interview.reportId && (
                      <Link href={`/app/reports/${interview.reportId}`}>
                        <Button size="sm" variant="outline" className="h-6.5 text-[11px] px-2 gap-1">
                          <FileText className="h-3 w-3" /> Report
                        </Button>
                      </Link>
                    )}

                    <Link href={`/app/interviews/${interview.id}`}>
                      <Button size="sm" variant="ghost" className="h-6.5 text-[11px] px-2">
                        Details
                      </Button>
                    </Link>

                    {interview.status !== "Completed" && interview.status !== "Cancelled" && canDeleteInterview && (
                      <button
                        onClick={() => handleCancel(interview.id, interview.candidateName)}
                        className="p-1 rounded text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors"
                        title="Cancel Interview"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}