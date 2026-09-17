"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
  Radio,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { cn } from "@/lib/utils";

export default function InterviewsPage() {
  const { interviews } = useStore();
  const { canCreateInterview } = usePermissions();

  const [activeTab, setActiveTab] = useState<"All" | "Upcoming" | "Live" | "Completed" | "Drafts">("All");
  const [viewMode, setViewMode] = useState<"table" | "calendar" | "list">("table");
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
      {/* 8. Page Header */}
      <PageHeader
        title="Interviews"
        description="Manage scheduled and completed technical interviews across synchronized views."
      >
        {/* Segmented View Switcher: Table | Calendar | List */}
        <div className="inline-flex rounded-md border border-border bg-secondary/50 p-0.5">
          <button
            onClick={() => handleViewChange("table")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors",
              viewMode === "table"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Table View"
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>

          <button
            onClick={() => handleViewChange("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors",
              viewMode === "calendar"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Calendar View"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Calendar</span>
          </button>

          <button
            onClick={() => handleViewChange("list")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors",
              viewMode === "list"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="List View"
          >
            <ListIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
        </div>

        <Button
          size="sm"
          onClick={() => setScheduleModalOpen(true)}
          disabled={!canCreateInterview}
          className="text-xs h-8 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Schedule interview
        </Button>
      </PageHeader>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setActiveTab("All")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === "All"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            All <span className="ml-1 text-[10px] opacity-70">({interviews.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("Upcoming")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === "Upcoming"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            Upcoming <span className="ml-1 text-[10px] opacity-70">({upcomingCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("Live")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              activeTab === "Live"
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            Live <span className="ml-0.5 text-[10px] opacity-70">({liveCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("Completed")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === "Completed"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            Completed <span className="ml-1 text-[10px] opacity-70">({completedCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("Drafts")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === "Drafts"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            Drafts <span className="ml-1 text-[10px] opacity-70">({draftCount})</span>
          </button>
        </div>

        {/* Search Filter */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search candidate, role, token..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          />
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
