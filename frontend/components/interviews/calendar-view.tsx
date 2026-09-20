"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { Button } from "@/components/ui/button";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import {
  formatClock,
  localDateKey,
  sessionCandidateName,
  sessionRole,
  sessionStart,
  sessionUiStatus,
  type ApiSession,
} from "@/lib/api/sessions";
import { ChevronLeft, ChevronRight, Clock, Radio, History, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  interviews: ApiSession[];
}

// Per-status visual language, pixel-matched to the product's card design
const STATUS_STYLE: Record<
  string,
  { icon: React.ReactNode; cardBg: string; timeText: string; pillBg: string; pillText: string; dot: string }
> = {
  Scheduled: {
    icon: <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />,
    cardBg: "bg-card border-border/70 hover:border-border",
    timeText: "text-foreground",
    pillBg: "bg-sage-100/70 dark:bg-sage-950/40 border-sage-500/30",
    pillText: "text-sage-700 dark:text-sage-300",
    dot: "bg-sage-500",
  },
  Live: {
    icon: <Radio className="h-3 w-3 shrink-0 text-terra-600 dark:text-terra-400" />,
    cardBg: "bg-terra-50/60 dark:bg-terra-950/20 border-terra-500/40 hover:border-terra-500/60",
    timeText: "text-terra-700 dark:text-terra-400 font-bold",
    pillBg: "bg-terra-100/70 dark:bg-terra-950/40 border-terra-500/30",
    pillText: "text-terra-700 dark:text-terra-300",
    dot: "bg-terra-500 animate-pulse",
  },
  Draft: {
    icon: <History className="h-3 w-3 shrink-0 text-muted-foreground" />,
    cardBg: "bg-card border-border/70 hover:border-border",
    timeText: "text-foreground",
    pillBg: "bg-secondary border-border",
    pillText: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  Completed: {
    icon: <CheckCircle2 className="h-3 w-3 shrink-0 text-muted-foreground" />,
    cardBg: "bg-card border-border/70 hover:border-border",
    timeText: "text-foreground",
    pillBg: "bg-slate-100/70 dark:bg-slate-950/40 border-slate-500/30",
    pillText: "text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  Cancelled: {
    icon: <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />,
    cardBg: "bg-card border-border/70 opacity-60",
    timeText: "text-muted-foreground line-through",
    pillBg: "bg-secondary border-border",
    pillText: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarView({ interviews }: CalendarViewProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingOffset = cursor.getDay(); // 0 = Sunday
  const trailing = (7 - ((leadingOffset + daysInMonth) % 7)) % 7;
  const todayKey = localDateKey(new Date());

  const { byDay, unscheduled, inMonth } = (() => {
    const map = new Map<string, ApiSession[]>();
    let unscheduledCount = 0;
    let monthCount = 0;
    for (const s of interviews) {
      const start = sessionStart(s);
      if (!start) {
        unscheduledCount += 1;
        continue;
      }
      const key = localDateKey(start);
      map.set(key, [...(map.get(key) ?? []), s]);
      if (start.getFullYear() === year && start.getMonth() === month) monthCount += 1;
    }
    const sorted = new Map<string, ApiSession[]>();
    map.forEach((list, key) => sorted.set(key, [...list].sort((a, b) => sessionStart(a)!.getTime() - sessionStart(b)!.getTime())));
    return { byDay: sorted, unscheduled: unscheduledCount, inMonth: monthCount };
  })();

  const shiftMonth = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {MONTH_NAMES[month]} {year}
          </h3>
          <span className="text-xs text-muted-foreground">
            {inMonth} {inMonth === 1 ? "session" : "sessions"}
            {unscheduled > 0 ? ` • ${unscheduled} unscheduled (not shown)` : ""}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          onClick={() => {
            const now = new Date();
            setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          Today
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted-foreground bg-secondary/20 py-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
        {Array.from({ length: leadingOffset }).map((_, i) => (
          <div key={`offset-${i}`} className="min-h-[215px] bg-secondary/15 p-2 opacity-30" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = localDateKey(new Date(year, month, day));
          const dayInterviews = byDay.get(key) ?? [];
          const isToday = key === todayKey;

          return (
            <div
              key={day}
              className={cn("min-h-[215px] p-2 transition-colors flex flex-col", isToday ? "bg-secondary/40 ring-1 ring-inset ring-border" : "hover:bg-secondary/20")}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-foreground text-background" : "text-foreground",
                  )}
                >
                  {day}
                </span>
              </div>

              <div className="space-y-1.5 overflow-y-auto flex-1">
                {dayInterviews.map((item) => {
                  const status = sessionUiStatus(item);
                  const s = STATUS_STYLE[status] ?? STATUS_STYLE.Scheduled;
                  const name = sessionCandidateName(item);
                  return (
                    <Link
                      key={item.id}
                      href={`/app/interviews/${item.id}`}
                      className={cn("block rounded-lg border px-2 py-2 transition-colors shadow-2xs", s.cardBg)}
                    >
                      <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold", s.timeText)}>
                        {s.icon}
                        <span>{formatClock(sessionStart(item)!)}</span>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5">
                        <CandidateAvatar
                          src={item.candidate ? candidateAvatarUrl(item.candidate) : undefined}
                          name={name}
                          className="h-7 w-7 text-[10px]"
                        />
                        <span className="font-semibold text-foreground text-xs leading-tight truncate">{name}</span>
                      </div>

                      <div className="text-[11px] text-muted-foreground leading-tight mt-1 line-clamp-2">{sessionRole(item)}</div>

                      <div className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1.5", s.pillBg, s.pillText)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.dot)} />
                        <span>{status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Array.from({ length: trailing }).map((_, i) => (
          <div key={`trail-${i}`} className="min-h-[215px] bg-secondary/15 p-2 opacity-30" />
        ))}
      </div>
    </div>
  );
}
