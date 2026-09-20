"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SessionPill } from "@/components/ui/session-pill";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileText, Trash2, Video, User, Code2, Layers, MoreVertical, Eye, PlayCircle } from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import {
  cancelSession,
  formatClock,
  interviewTypeLabel,
  localDateKey,
  primaryInterviewerName,
  sessionCandidateName,
  sessionRole,
  sessionStart,
  type ApiSession,
  type InterviewTypeCode,
} from "@/lib/api/sessions";
import { cn } from "@/lib/utils";

interface TableViewProps {
  interviews: ApiSession[];
  /** Called after a row action changed something (e.g. cancelled), so the list can refetch. */
  onChanged: () => void;
}

const TYPE_STYLE: Record<InterviewTypeCode | "NONE", { icon: React.ElementType; classes: string }> = {
  TECHNICAL: { icon: Video, classes: "bg-slate-100/70 dark:bg-slate-950/40 border-slate-500/20 text-slate-700 dark:text-slate-300" },
  BEHAVIORAL: { icon: User, classes: "bg-clay-100/70 dark:bg-clay-950/40 border-clay-500/20 text-clay-700 dark:text-clay-300" },
  CODING: { icon: Code2, classes: "bg-sage-100/70 dark:bg-sage-950/40 border-sage-500/20 text-sage-700 dark:text-sage-300" },
  SYSTEM_DESIGN: { icon: Layers, classes: "bg-clay-100/70 dark:bg-clay-950/40 border-clay-500/20 text-clay-700 dark:text-clay-300" },
  MIXED: { icon: Layers, classes: "bg-amber-100/70 dark:bg-amber-950/40 border-amber-500/20 text-amber-700 dark:text-amber-300" },
  NONE: { icon: Layers, classes: "bg-secondary border-border text-muted-foreground" },
};

const CANCELLABLE = new Set(["DRAFT", "CONFIGURED", "ARMED", "ADMITTED"]);

function RowActionsMenu({ interview, onChanged }: { interview: ApiSession; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { canDeleteInterview } = usePermissions();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleCancel = async () => {
    try {
      await cancelSession(interview.id);
      toast({ title: "Interview cancelled", description: `Session with ${sessionCandidateName(interview)} was cancelled.`, type: "info" });
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't cancel the interview", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    }
  };

  const canCancel = canDeleteInterview && CANCELLABLE.has(interview.status);

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
          {interview.status === "LIVE" && (
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

          {interview.reportId && (
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
                onClick={() => {
                  setOpen(false);
                  setConfirmOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-terra-600 dark:text-terra-400 hover:bg-terra-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancel Interview
              </button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancel Interview Session?"
        description={`Cancel the interview for ${sessionCandidateName(interview)}? This revokes candidate access and cannot be undone.`}
        confirmText="Cancel Interview"
        variant="destructive"
        onConfirm={handleCancel}
      />
    </div>
  );
}

export function TableView({ interviews, onChanged }: TableViewProps) {
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
            const typeStyle = TYPE_STYLE[interview.config.interviewType ?? "NONE"];
            const TypeIcon = typeStyle.icon;
            const start = sessionStart(interview);
            const name = sessionCandidateName(interview);
            const lead = primaryInterviewerName(interview);

            return (
              <tr key={interview.id} className="hover:bg-secondary/40 transition-colors">
                <td className="px-3.5 py-2">
                  <div className="flex items-center gap-2.5">
                    <CandidateAvatar src={interview.candidate ? candidateAvatarUrl(interview.candidate) : undefined} name={name} size="md" />
                    <div>
                      <Link href={`/app/interviews/${interview.id}`} className="font-semibold text-foreground text-xs hover:underline">
                        {name}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">{interview.candidate?.email ?? "—"}</div>
                    </div>
                  </div>
                </td>

                <td className="px-3.5 py-2 font-medium text-foreground text-xs">{sessionRole(interview)}</td>

                <td className="px-3.5 py-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", typeStyle.classes)}>
                    <TypeIcon className="h-3 w-3 shrink-0" />
                    {interviewTypeLabel(interview.config.interviewType)}
                  </span>
                </td>

                <td className="px-3.5 py-2 text-foreground whitespace-nowrap">
                  {start ? (
                    <>
                      <span className="font-medium">{localDateKey(start)}</span>
                      <span className="text-muted-foreground ml-1.5 text-[11px]">{formatClock(start)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not scheduled</span>
                  )}
                </td>

                <td className="px-3.5 py-2 text-muted-foreground text-[11px]">{interview.durationMinutes}m</td>

                <td className="px-3.5 py-2">
                  <SessionPill status={interview.status} size="sm" />
                </td>

                <td className="px-3.5 py-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <CandidateAvatar src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(lead)}`} name={lead} size="sm" />
                    <span className="truncate">{lead.split(" ")[0]}</span>
                  </div>
                </td>

                <td className="px-3.5 py-2 text-right">
                  <div className="flex items-center justify-end">
                    <RowActionsMenu interview={interview} onChanged={onChanged} />
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
