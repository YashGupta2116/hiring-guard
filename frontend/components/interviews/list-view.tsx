"use client";

import React from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { Clock, Calendar, Video } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const other = interviews.filter(
    (i) =>
      !today.some((t) => t.id === i.id) &&
      !tomorrow.some((t) => t.id === i.id) &&
      !thisWeek.some((t) => t.id === i.id)
  );

  const renderGroup = (title: string, list: Interview[]) => {
    if (list.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
            {title}
          </h3>
          <span className="text-xs text-neutral-500 font-normal">
            ({list.length})
          </span>
        </div>

        <div className="space-y-2.5">
          {list.map((item) => (
            <div
              key={item.id}
              className={cn(
                "group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200/90 dark:border-neutral-800 transition-all hover:shadow-2xs gap-4",
                item.status === "Live" && "border-l-[3px] border-l-emerald-500"
              )}
            >
              {/* Left Column: Avatar & Candidate Information */}
              <div className="flex items-center gap-3.5 min-w-0">
                <CandidateAvatar
                  src={item.candidateAvatar}
                  name={item.candidateName}
                  size="md"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-neutral-900 dark:text-white text-sm truncate">
                      {item.candidateName}
                    </span>
                    {item.status === "Live" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    ) : item.status === "Scheduled" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fef9ee] text-[#b45309] border border-[#fde68a] dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                        Scheduled
                      </span>
                    ) : item.status === "Completed" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400">
                        Draft
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {item.jobRole} • {item.interviewType}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                    Lead: {item.interviewerName}
                  </p>
                </div>
              </div>

              {/* Right Column: Time Info & Action Buttons */}
              <div className="flex items-center justify-between sm:justify-end gap-5 text-xs text-neutral-500 dark:text-neutral-400 shrink-0 pt-2 sm:pt-0">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                    {item.date}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-neutral-400" />
                    {item.time} ({item.durationMinutes}m)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {item.status === "Live" ? (
                    <Link href={`/app/interviews/${item.id}/live`}>
                      <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 h-8.5 shadow-xs">
                        <Video className="h-3.5 w-3.5" />
                        Join Room
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/app/interviews/${item.token || item.id}`}>
                      <Button
                        variant="outline"
                        className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-medium px-4 py-2 rounded-lg h-8.5"
                      >
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
      {renderGroup("Other Sessions", other)}
    </div>
  );
}
