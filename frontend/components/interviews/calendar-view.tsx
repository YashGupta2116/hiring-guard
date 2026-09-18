"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, Radio, History, CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  interviews: Interview[];
}

// Per-status visual language, pixel-matched to the product's card design
const STATUS_STYLE: Record<
  string,
  {
    icon: React.ReactNode;
    cardBg: string;
    timeText: string;
    pillBg: string;
    pillText: string;
    dot: string;
  }
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
    pillBg: "bg-sky-100/70 dark:bg-sky-950/40 border-sky-500/30",
    pillText: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
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

export function CalendarView({ interviews }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState("September 2026");

  // September 2026 begins on a Tuesday (day index 2) and has 30 days
  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);
  const leadingOffset = 2; // Tuesday start

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-foreground">{currentMonth}</h3>
          <span className="text-xs text-muted-foreground">
            {interviews.length} scheduled sessions
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted-foreground bg-secondary/20 py-2">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
        {/* Leading blanks */}
        {Array.from({ length: leadingOffset }).map((_, i) => (
          <div key={`offset-${i}`} className="min-h-[215px] bg-secondary/15 p-2 opacity-30" />
        ))}

        {/* Days of September */}
        {daysInMonth.map((day) => {
          const dateStr = `2026-09-${day.toString().padStart(2, "0")}`;
          const dayInterviews = interviews.filter((i) => i.date === dateStr);
          const isToday = day === 15; // 2026-09-15 is today

          return (
            <div
              key={day}
              className={cn(
                "min-h-[215px] p-2 transition-colors flex flex-col group",
                isToday ? "bg-secondary/40 ring-1 ring-inset ring-border" : "hover:bg-secondary/20"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-foreground text-background" : "text-foreground"
                  )}
                >
                  {day}
                </span>
                {dayInterviews.length === 0 ? (
                  <button
                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-muted-foreground transition-opacity"
                    title="Add interview"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    className="h-4 w-4 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-opacity"
                    title="Add interview"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Event Cards */}
              <div className="space-y-1.5 overflow-y-auto flex-1">
                {dayInterviews.map((item) => {
                  const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.Scheduled;
                  return (
                    <Link
                      key={item.id}
                      href={`/app/interviews/${item.id}`}
                      className={cn(
                        "block rounded-lg border px-2 py-2 transition-colors shadow-2xs",
                        s.cardBg
                      )}
                    >
                      <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold", s.timeText)}>
                        {s.icon}
                        <span>{item.time}</span>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5">
                        <CandidateAvatar
                          src={item.candidateAvatar}
                          name={item.candidateName}
                          className="h-7 w-7 text-[10px]"
                        />
                        <span className="font-semibold text-foreground text-xs leading-tight truncate">
                          {item.candidateName}
                        </span>
                      </div>

                      <div className="text-[11px] text-muted-foreground leading-tight mt-1 line-clamp-2">
                        {item.jobRole}
                      </div>

                      <div
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1.5",
                          s.pillBg,
                          s.pillText
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.dot)} />
                        <span>{item.status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Trailing blanks to complete row */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`trail-${i}`} className="min-h-[215px] bg-secondary/15 p-2 opacity-30 flex items-center justify-center">
            <span className="text-muted-foreground/40">
              <Plus className="h-4 w-4" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}