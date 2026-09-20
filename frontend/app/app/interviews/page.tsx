"use client";

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { TableView } from "@/components/interviews/table-view";
import { CalendarView } from "@/components/interviews/calendar-view";
import { ListView } from "@/components/interviews/list-view";
import { CalendarDays, Table as TableIcon, List as ListIcon, Plus, Search, Home } from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { ApiError } from "@/lib/api/client";
import {
  interviewTypeLabel,
  listAllSessions,
  primaryInterviewerName,
  sessionCandidateName,
  sessionRef,
  sessionRole,
  sessionUiStatus,
  type ApiSession,
} from "@/lib/api/sessions";
import { cn } from "@/lib/utils";

type Tab = "All" | "Upcoming" | "Live" | "Completed" | "Drafts" | "Cancelled";
type ViewMode = "table" | "calendar" | "list";

const TAB_STATUS: Record<Exclude<Tab, "All">, string> = {
  Upcoming: "Scheduled",
  Live: "Live",
  Completed: "Completed",
  Drafts: "Draft",
  Cancelled: "Cancelled",
};

const tabButton = (active: boolean) =>
  cn(
    "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
    active
      ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60",
  );

const VIEW_KEY = "veritrust_interview_view";
const VIEW_EVENT = "veritrust:interview-view";

/** The last-used view is a per-browser preference, read from localStorage without an effect (falls back to the list). */
function readView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "table" || saved === "calendar" || saved === "list") return saved;
  } catch {
    // Storage can be unavailable (private mode); the default view is fine.
  }
  return "list";
}

function subscribeView(onChange: () => void): () => void {
  window.addEventListener(VIEW_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(VIEW_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function InterviewsPage() {
  const { canCreateInterview } = usePermissions();

  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [activeTab, setActiveTab] = useState<Tab>("All");
  const viewMode = useSyncExternalStore(subscribeView, readView, () => "list" as ViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const handleViewChange = (mode: ViewMode) => {
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // ignore: the choice just won't be remembered
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
  };

  useEffect(() => {
    let cancelled = false;
    listAllSessions()
      .then((res) => {
        if (cancelled) return;
        setSessions(res.items);
        setTruncated(res.truncated);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Something went wrong while loading interviews.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const counts = useMemo(() => {
    const tally = { Scheduled: 0, Live: 0, Completed: 0, Draft: 0, Cancelled: 0 };
    for (const s of sessions) {
      const ui = sessionUiStatus(s);
      if (ui in tally) tally[ui as keyof typeof tally] += 1;
    }
    return tally;
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((item) => {
      if (activeTab !== "All" && sessionUiStatus(item) !== TAB_STATUS[activeTab]) return false;
      if (q === "") return true;
      return [
        sessionCandidateName(item),
        item.candidate?.email ?? "",
        sessionRole(item),
        interviewTypeLabel(item.config.interviewType),
        primaryInterviewerName(item),
        sessionRef(item.id),
      ].some((field) => field.toLowerCase().includes(q));
    });
  }, [sessions, activeTab, searchQuery]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link href="/app/dashboard" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Interviews</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Interviews</h1>
          <p className="text-xs text-neutral-500 mt-1">Manage scheduled and completed technical interviews across synchronized views.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs text-neutral-500 shadow-2xs">
            {(
              [
                { mode: "table", label: "Table", icon: TableIcon },
                { mode: "calendar", label: "Calendar", icon: CalendarDays },
                { mode: "list", label: "List", icon: ListIcon },
              ] as const
            ).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => handleViewChange(mode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                  viewMode === mode
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs"
                    : "hover:text-neutral-900 dark:hover:text-white",
                )}
                title={`${label} View`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {canCreateInterview && (
            <Button
              onClick={() => setScheduleModalOpen(true)}
              className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs h-9"
            >
              <Plus className="h-3.5 w-3.5" /> Schedule Interview
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setActiveTab("All")} className={tabButton(activeTab === "All")}>
            All ({sessions.length})
          </button>
          <button onClick={() => setActiveTab("Upcoming")} className={tabButton(activeTab === "Upcoming")}>
            Upcoming ({counts.Scheduled})
          </button>
          <button onClick={() => setActiveTab("Live")} className={cn(tabButton(activeTab === "Live"), "flex items-center gap-1.5")}>
            <span className="h-1.5 w-1.5 rounded-full bg-terra-500 animate-pulse" />
            Live ({counts.Live})
          </button>
          <button onClick={() => setActiveTab("Completed")} className={tabButton(activeTab === "Completed")}>
            Completed ({counts.Completed})
          </button>
          <button onClick={() => setActiveTab("Drafts")} className={tabButton(activeTab === "Drafts")}>
            Drafts ({counts.Draft})
          </button>
          <button onClick={() => setActiveTab("Cancelled")} className={tabButton(activeTab === "Cancelled")}>
            Cancelled ({counts.Cancelled})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search candidate, role, reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-9 pr-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {truncated && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Showing the most recent 1,000 interviews. Older ones are not loaded.</p>
      )}

      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState title="Couldn't load interviews" description={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={searchQuery || activeTab !== "All" ? "No matching interviews found" : "No interviews yet"}
          description={
            searchQuery
              ? `No sessions found matching "${searchQuery}". Try clearing your search term.`
              : activeTab !== "All"
                ? "Nothing in this tab yet."
                : "Schedule your first interview to start building your interview pipeline."
          }
          actionLabel={canCreateInterview && activeTab === "All" && !searchQuery ? "Schedule interview" : undefined}
          onAction={() => setScheduleModalOpen(true)}
          secondaryActionLabel={searchQuery ? "Clear search" : activeTab !== "All" ? "Show all" : undefined}
          onSecondaryAction={() => {
            setSearchQuery("");
            setActiveTab("All");
          }}
        />
      ) : (
        <>
          {viewMode === "table" && <TableView interviews={filtered} onChanged={reload} />}
          {viewMode === "calendar" && <CalendarView interviews={filtered} />}
          {viewMode === "list" && <ListView interviews={filtered} />}
        </>
      )}

      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} onCreated={reload} />
    </div>
  );
}
