"use client";

import React from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { Clock, Calendar, ArrowRight, Radio } from "lucide-react";

interface ListViewProps {
  interviews: Interview[];
}

export function ListView({ interviews }: ListViewProps) {
  // Groupings based on our September 2026 mock timeline
  const today = interviews.filter((i) => i.date === "2026-09-15" || i.status === "Live");
  const tomorrow = interviews.filter((i) => i.date === "2026-09-16" && i.status !== "Live");
  const thisWeek = interviews.filter(
    (i) => (i.date === "2026-09-17" || i.date === "2026-09-18") && i.status !== "Live"
  );
  const later = interviews.filter(
    (i) => i.date > "2026-09-18" || (i.status === "Completed" && !today.includes(i))
  );

  const renderGroup = (title: string, list: Interview[]) => {
    if (list.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground tracking-tight">
            {title}
          </h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            ({list.length})
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
          {list.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-secondary/40 transition-colors gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CandidateAvatar
                  src={item.candidateAvatar}
                  name={item.candidateName}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-xs truncate">
                      {item.candidateName}
                    </span>
                    <StatusBadge status={item.status} size="sm" />
                    <span className="hidden sm:inline text-muted-foreground text-[11px]">
                      • {item.interviewType}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {item.jobRole} • Lead: {item.interviewerName}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted-foreground shrink-0 pt-1 sm:pt-0">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Calendar className="h-3 w-3" /> {item.date}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <Clock className="h-3 w-3" /> {item.time} ({item.durationMinutes}m)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.status === "Live" ? (
                    <Link href={`/app/interviews/${item.id}/live`}>
                      <Button size="sm" className="h-7 text-xs px-2.5">
                        Join Room
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/app/interviews/${item.id}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                        Details
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {renderGroup("Today's Sessions", today)}
      {renderGroup("Tomorrow", tomorrow)}
      {renderGroup("This Week", thisWeek)}
      {renderGroup("Later / Completed", later)}
    </div>
  );
}
