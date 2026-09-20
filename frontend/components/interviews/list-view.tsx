"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import {
  interviewTypeLabel,
  localDateKey,
  formatClock,
  primaryInterviewerName,
  sessionCandidateName,
  sessionRole,
  sessionStart,
  sessionUiStatus,
  type ApiSession,
} from "@/lib/api/sessions";
import { Clock, Calendar, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListViewProps {
  interviews: ApiSession[];
}

const DAY_MS = 24 * 3600 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

type GroupKey = "today" | "tomorrow" | "week" | "later" | "earlier" | "unscheduled";

const GROUP_TITLES: Record<GroupKey, string> = {
  today: "Today's Sessions",
  tomorrow: "Tomorrow",
  week: "This Week",
  later: "Later",
  earlier: "Earlier",
  unscheduled: "Unscheduled",
};

const GROUP_ORDER: GroupKey[] = ["today", "tomorrow", "week", "later", "earlier", "unscheduled"];

function groupFor(s: ApiSession, todayStart: number): GroupKey {
  if (s.status === "LIVE") return "today";
  const start = sessionStart(s);
  if (!start) return "unscheduled";
  const diffDays = Math.round((startOfDay(start) - todayStart) / DAY_MS);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays > 1 && diffDays <= 7) return "week";
  return diffDays > 7 ? "later" : "earlier";
}

function StatusChip({ status }: { status: ReturnType<typeof sessionUiStatus> }) {
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sage-50 text-sage-700 border border-sage-200 dark:bg-sage-950/40 dark:text-sage-400 dark:border-sage-800">
        <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
        Live
      </span>
    );
  }
  if (status === "Scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fef9ee] text-[#b45309] border border-[#fde68a] dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60">
        <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
      {status}
    </span>
  );
}

export function ListView({ interviews }: ListViewProps) {
  const groups = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const byGroup = new Map<GroupKey, ApiSession[]>();
    for (const s of interviews) {
      const key = groupFor(s, todayStart);
      byGroup.set(key, [...(byGroup.get(key) ?? []), s]);
    }
    byGroup.forEach((list) => list.sort((a, b) => (sessionStart(a)?.getTime() ?? 0) - (sessionStart(b)?.getTime() ?? 0)));
    return GROUP_ORDER.filter((k) => byGroup.has(k)).map((k) => ({ key: k, list: byGroup.get(k)! }));
  }, [interviews]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {groups.map(({ key, list }) => (
        <div key={key} className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">{GROUP_TITLES[key]}</h3>
            <span className="text-xs text-neutral-500 font-normal">({list.length})</span>
          </div>

          <div className="space-y-2.5">
            {list.map((item) => {
              const status = sessionUiStatus(item);
              const start = sessionStart(item);
              const name = sessionCandidateName(item);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200/90 dark:border-neutral-800 transition-all hover:shadow-2xs gap-4",
                    status === "Live" && "border-l-[3px] border-l-sage-500",
                  )}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <CandidateAvatar
                      src={item.candidate ? candidateAvatarUrl(item.candidate) : undefined}
                      name={name}
                      size="md"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-neutral-900 dark:text-white text-sm truncate">{name}</span>
                        <StatusChip status={status} />
                      </div>

                      <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {sessionRole(item)} • {interviewTypeLabel(item.config.interviewType)}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">Lead: {primaryInterviewerName(item)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 text-xs text-neutral-500 dark:text-neutral-400 shrink-0 pt-2 sm:pt-0">
                    <div className="flex items-center gap-4">
                      {start ? (
                        <>
                          <span className="flex items-center gap-1.5 text-xs">
                            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                            {localDateKey(start)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs">
                            <Clock className="h-3.5 w-3.5 text-neutral-400" />
                            {formatClock(start)} ({item.durationMinutes}m)
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 text-neutral-400" />
                          Not scheduled ({item.durationMinutes}m)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {status === "Live" ? (
                        <Link href={`/app/interviews/${item.id}/live`} target="_blank" rel="noopener noreferrer">
                          <Button className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 h-8.5 shadow-xs">
                            <Video className="h-3.5 w-3.5" />
                            Join Room
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/app/interviews/${item.id}`}>
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
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
