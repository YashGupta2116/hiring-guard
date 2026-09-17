"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Interview } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  interviews: Interview[];
}

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
          <h3 className="text-sm font-semibold text-foreground">{currentMonth}</h3>
          <span className="text-xs text-muted-foreground">
            {interviews.length} scheduled sessions
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
            Today
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
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
          <div key={`offset-${i}`} className="min-h-[105px] bg-secondary/15 p-2 opacity-30" />
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
                "min-h-[105px] p-2 transition-colors flex flex-col justify-between group",
                isToday ? "bg-secondary/40 ring-1 ring-inset ring-border" : "hover:bg-secondary/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                    isToday
                      ? "bg-foreground text-background"
                      : "text-foreground"
                  )}
                >
                  {day}
                </span>
                {dayInterviews.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {dayInterviews.length}
                  </span>
                )}
              </div>

              {/* Event Pills */}
              <div className="mt-1 space-y-1 overflow-y-auto max-h-[75px]">
                {dayInterviews.map((item) => (
                  <Link
                    key={item.id}
                    href={`/app/interviews/${item.id}`}
                    className={cn(
                      "block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors border",
                      item.status === "Live"
                        ? "bg-terra-500/10 text-terra-700 dark:text-terra-400 border-terra-500/30 font-semibold"
                        : item.status === "Scheduled"
                        ? "bg-secondary text-foreground border-border/80 hover:bg-secondary/80"
                        : "bg-secondary/50 text-muted-foreground border-border/40 hover:bg-secondary/70"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {item.status === "Live" ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-terra-500 animate-pulse shrink-0" />
                      ) : (
                        <Clock className="h-2.5 w-2.5 opacity-60 shrink-0" />
                      )}
                      <span className="font-semibold">{item.time}</span>
                      <span className="truncate">{item.candidateName.split(" ")[0]}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {/* Trailing blanks to complete row */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`trail-${i}`} className="min-h-[105px] bg-secondary/15 p-2 opacity-30" />
        ))}
      </div>
    </div>
  );
}
