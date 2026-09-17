"use client";

import React from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import {
  ExternalLink,
  MoreVertical,
  FileText,
  Clock,
  Trash2,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useStore } from "@/lib/store/interview-store";
import { useToast } from "@/components/ui/toast";

interface TableViewProps {
  interviews: Interview[];
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
            <th className="px-3.5 py-2.5">Candidate</th>
            <th className="px-3.5 py-2.5">Role</th>
            <th className="px-3.5 py-2.5">Type</th>
            <th className="px-3.5 py-2.5">Date & Time</th>
            <th className="px-3.5 py-2.5">Duration</th>
            <th className="px-3.5 py-2.5">Status</th>
            <th className="px-3.5 py-2.5">Interviewer</th>
            <th className="px-3.5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {interviews.map((interview) => (
            <tr
              key={interview.id}
              className="hover:bg-secondary/40 transition-colors"
            >
              {/* Candidate */}
              <td className="px-3.5 py-2.5">
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
              <td className="px-3.5 py-2.5 font-medium text-foreground text-xs">
                {interview.jobRole}
              </td>

              {/* Type */}
              <td className="px-3.5 py-2.5">
                <span className="text-muted-foreground text-[11px]">
                  {interview.interviewType}
                </span>
              </td>

              {/* Date & Time */}
              <td className="px-3.5 py-2.5 text-foreground whitespace-nowrap">
                <span className="font-medium">{interview.date}</span>
                <span className="text-muted-foreground ml-1.5 text-[11px]">{interview.time}</span>
              </td>

              {/* Duration */}
              <td className="px-3.5 py-2.5 text-muted-foreground text-[11px]">
                {interview.durationMinutes}m
              </td>

              {/* Status */}
              <td className="px-3.5 py-2.5">
                <StatusBadge status={interview.status} size="sm" />
              </td>

              {/* Interviewer */}
              <td className="px-3.5 py-2.5">
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
              <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
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
                      className="p-1 rounded text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Cancel Interview"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
