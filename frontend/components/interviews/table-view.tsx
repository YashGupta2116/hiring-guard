"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { SessionPill } from "@/components/ui/session-pill";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import {
  FileText,
  Trash2,
  Video,
  User,
  Code2,
  Layers,
  MoreVertical,
  Eye,
  PlayCircle,
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

function RowActionsMenu({ interview }: { interview: Interview }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { cancelInterview } = useStore();
  const { canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleCancel = () => {
    if (!canDeleteInterview) {
      toast({
        title: "Action Restricted",
        description: "Only Admins can cancel interviews.",
        type: "error",
      });
      setOpen(false);
      return;
    }
    cancelInterview(interview.id);
    toast({
      title: "Interview Cancelled",
      description: `Session with ${interview.candidateName} marked as cancelled.`,
      type: "info",
    });
    setOpen(false);
  };

  const canCancel = interview.status !== "Completed" && interview.status !== "Cancelled" && canDeleteInterview;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="More actions"
        aria-label="More actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-border bg-card shadow-lg py-1 text-xs">
          {interview.status === "Live" && (
            <Link
              href={`/app/interviews/${interview.id}/live`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-secondary transition-colors"
              onClick={() => setOpen(false)}
            >
              <PlayCircle className="h-3.5 w-3.5" /> Join Session
            </Link>
          )}

          <Link
            href={`/app/interviews/${interview.id}`}
            className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-secondary transition-colors"
            onClick={() => setOpen(false)}
          >
            <Eye className="h-3.5 w-3.5" /> View Details
          </Link>

          {interview.status === "Completed" && interview.reportId && (
            <Link
              href={`/app/reports/${interview.reportId}`}
              className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-secondary transition-colors"
              onClick={() => setOpen(false)}
            >
              <FileText className="h-3.5 w-3.5" /> View Report
            </Link>
          )}

          {canCancel && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleCancel}
                className="w-full flex items-center gap-2 px-3 py-2 text-terra-600 dark:text-terra-400 hover:bg-terra-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancel Interview
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TableView({ interviews }: TableViewProps) {
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
                <td className="px-3.5 py-2 text-right">
                  <div className="flex items-center justify-end">
                    <RowActionsMenu interview={interview} />
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