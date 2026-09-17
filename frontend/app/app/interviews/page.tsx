"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { TableView } from "@/components/interviews/table-view";
import { CalendarView } from "@/components/interviews/calendar-view";
import { ListView } from "@/components/interviews/list-view";
import {
  CalendarDays,
  Table as TableIcon,
  List as ListIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Home,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { cn } from "@/lib/utils";

export default function InterviewsPage() {
  const { interviews } = useStore();
  const { canCreateInterview } = usePermissions();

  const [activeTab, setActiveTab] = useState<"All" | "Upcoming" | "Live" | "Completed" | "Drafts">("All");
  const [viewMode, setViewMode] = useState<"table" | "calendar" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // Hydrate viewMode preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("veritrust_interview_view");
    if (saved === "table" || saved === "calendar" || saved === "list") {
      setViewMode(saved);
    }
  }, []);

  const handleViewChange = (mode: "table" | "calendar" | "list") => {
    setViewMode(mode);
    localStorage.setItem("veritrust_interview_view", mode);
  };

  // Filter interviews by Tab and Search Query
  const filteredInterviews = interviews.filter((item) => {
    // Status tab filter
    if (activeTab === "Upcoming" && item.status !== "Scheduled") return false;
    if (activeTab === "Live" && item.status !== "Live") return false;
    if (activeTab === "Completed" && item.status !== "Completed") return false;
    if (activeTab === "Drafts" && item.status !== "Draft") return false;

    // Search query filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = item.candidateName.toLowerCase().includes(q);
      const matchRole = item.jobRole.toLowerCase().includes(q);
      const matchType = item.interviewType.toLowerCase().includes(q);
      const matchInterviewer = item.interviewerName.toLowerCase().includes(q);
      const matchToken = item.token.toLowerCase().includes(q);
      if (!matchName && !matchRole && !matchType && !matchInterviewer && !matchToken) {
        return false;
      }
    }
    return true;
  });

  const liveCount = interviews.filter((i) => i.status === "Live").length;
  const upcomingCount = interviews.filter((i) => i.status === "Scheduled").length;
  const completedCount = interviews.filter((i) => i.status === "Completed").length;
  const draftCount = interviews.filter((i) => i.status === "Draft").length;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link
          href="/app/dashboard"
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Interviews</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Interviews
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage scheduled and completed technical interviews across synchronized views.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented View Switcher: Table | Calendar | List */}
          <div className="inline-flex items-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs text-neutral-500 shadow-2xs">
            <button
              onClick={() => handleViewChange("table")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                viewMode === "table"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs"
                  : "hover:text-neutral-900 dark:hover:text-white"
              )}
              title="Table View"
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>

            <button
              onClick={() => handleViewChange("calendar")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs"
                  : "hover:text-neutral-900 dark:hover:text-white"
              )}
              title="Calendar View"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>

            <button
              onClick={() => handleViewChange("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                viewMode === "list"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs"
                  : "hover:text-neutral-900 dark:hover:text-white"
              )}
              title="List View"
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
          </div>

          <Button
            onClick={() => setScheduleModalOpen(true)}
            disabled={!canCreateInterview}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs h-9"
          >
            <Plus className="h-3.5 w-3.5" /> Schedule Interview
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab("All")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
              activeTab === "All"
                ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60"
            )}
          >
            All ({interviews.length})
          </button>

          <button
            onClick={() => setActiveTab("Upcoming")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
              activeTab === "Upcoming"
                ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60"
            )}
          >
            Upcoming ({upcomingCount})
          </button>

          <button
            onClick={() => setActiveTab("Live")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5",
              activeTab === "Live"
                ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            Live ({liveCount})
          </button>

          <button
            onClick={() => setActiveTab("Completed")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
              activeTab === "Completed"
                ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60"
            )}
          >
            Completed ({completedCount})
          </button>

          <button
            onClick={() => setActiveTab("Drafts")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
              activeTab === "Drafts"
                ? "bg-neutral-200/80 text-neutral-900 font-semibold dark:bg-neutral-800 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60"
            )}
          >
            Drafts ({draftCount})
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search candidate, role, token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-9 pr-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none transition-colors"
            />
          </div>
          <button
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 shrink-0 transition-colors"
            title="Filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {filteredInterviews.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={searchQuery ? "No matching interviews found" : "No interviews yet"}
          description={
            searchQuery
              ? `No sessions found matching "${searchQuery}". Try clearing your search term.`
              : "Schedule your first interview to start building your interview pipeline."
          }
          actionLabel={canCreateInterview ? "Schedule interview" : undefined}
          onAction={() => setScheduleModalOpen(true)}
          secondaryActionLabel={searchQuery ? "Clear search" : undefined}
          onSecondaryAction={() => setSearchQuery("")}
        />
      ) : (
        <>
          {viewMode === "table" && <TableView interviews={filteredInterviews} />}
          {viewMode === "calendar" && <CalendarView interviews={filteredInterviews} />}
          {viewMode === "list" && <ListView interviews={filteredInterviews} />}
        </>
      )}

      {/* Schedule Interview Modal */}
      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} />
    </div>
  );
}
