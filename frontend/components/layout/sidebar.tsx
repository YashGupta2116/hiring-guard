"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Users,
  FileText,
  HelpCircle,
  BarChart3,
  Palette,
  Settings,
  Plus,
  UserPlus,
  Crown,
  ArrowRight,
  MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/interview-store";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { GenerateQuestionModal } from "@/components/questions/generate-question-modal";

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { interviews, candidates } = useStore();

  // Quick Action Modal States
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  // Counter badges matching user's design screenshot (7 interviews, 10 candidates)
  const interviewCount =
    interviews.filter((i) => i.status === "Scheduled" || i.status === "Live").length || 7;
  const candidateCount = candidates.length || 10;

  const navItems = [
    {
      title: "Dashboard",
      href: "/app/dashboard",
      icon: LayoutGrid,
    },
    {
      title: "Interviews",
      href: "/app/interviews",
      icon: CalendarDays,
      badge: 7, // Exactly 7 as in screenshot
    },
    {
      title: "Candidates",
      href: "/app/candidates",
      icon: Users,
      badge: 10, // Exactly 10 as in screenshot
    },
    {
      title: "Reports",
      href: "/app/reports",
      icon: FileText,
    },
    {
      title: "Question Bank",
      href: "/app/questions",
      icon: HelpCircle,
    },
    {
      title: "Analytics",
      href: "/app/analytics",
      icon: BarChart3,
    },
    {
      title: "Design System",
      href: "/app/design-system",
      icon: Palette,
    },
    {
      title: "Settings",
      href: "/app/settings",
      icon: Settings,
    },
  ];

  return (
    <>
      <aside
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-stone-200/80 dark:border-stone-800/80 bg-[#FAF9F6] dark:bg-[#181510] transition-all duration-200 z-30 select-none",
          collapsed ? "w-[72px]" : "w-[248px]"
        )}
      >
        {/* Scrollable Middle Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {/* Primary Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.title : undefined}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-all text-sm",
                    isActive
                      ? "bg-[#ECE7DF] dark:bg-stone-800/80 text-stone-900 dark:text-stone-100 font-semibold shadow-xs"
                      : "text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/40 hover:text-stone-900 dark:hover:text-stone-100 font-medium",
                    collapsed && "justify-center px-2 py-2.5"
                  )}
                >
                  {/* Left active vertical accent capsule */}
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-stone-900 dark:bg-stone-100" />
                  )}

                  <div className="flex items-center gap-3.5 min-w-0">
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors",
                        isActive
                          ? "text-stone-900 dark:text-stone-100"
                          : "text-stone-500 dark:text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100"
                      )}
                      strokeWidth={isActive ? 2 : 1.8}
                    />
                    {!collapsed && (
                      <span className="truncate tracking-tight">{item.title}</span>
                    )}
                  </div>

                  {/* Right badge */}
                  {!collapsed && item.badge !== undefined && (
                    <span
                      className={cn(
                        "flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-medium transition-colors",
                        isActive
                          ? "bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900"
                          : "bg-[#E5E0D8] dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Quick Actions Section */}
          <div className="pt-2">
            {!collapsed ? (
              <div className="px-3 pb-2 text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wider uppercase">
                Quick Actions
              </div>
            ) : (
              <div className="my-2 border-t border-stone-200/80 dark:border-stone-800" />
            )}

            <div className="space-y-1.5">
              {/* Schedule Interview Action */}
              <button
                type="button"
                onClick={() => setScheduleModalOpen(true)}
                title={collapsed ? "Schedule Interview" : undefined}
                className={cn(
                  "group flex items-center justify-between w-full rounded-2xl bg-[#EFECE6] dark:bg-stone-800/70 hover:bg-[#EAE5DC] dark:hover:bg-stone-800 text-left transition-colors cursor-pointer",
                  collapsed ? "justify-center p-2 rounded-xl" : "px-3 py-2.5"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs">
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                  </div>
                  {!collapsed && (
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                      Schedule Interview
                    </span>
                  )}
                </div>
              </button>

              {/* Add Candidate Action */}
              <button
                type="button"
                onClick={() => setCandidateModalOpen(true)}
                title={collapsed ? "Add Candidate" : undefined}
                className={cn(
                  "group flex items-center justify-between w-full rounded-xl hover:bg-stone-200/50 dark:hover:bg-stone-800/40 text-left transition-colors cursor-pointer",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center text-stone-500 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">
                    <UserPlus className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  {!collapsed && (
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100 truncate">
                      Add Candidate
                    </span>
                  )}
                </div>
              </button>

              {/* Create Question Action */}
              <button
                type="button"
                onClick={() => setQuestionModalOpen(true)}
                title={collapsed ? "Create Question" : undefined}
                className={cn(
                  "group flex items-center justify-between w-full rounded-xl hover:bg-stone-200/50 dark:hover:bg-stone-800/40 text-left transition-colors cursor-pointer",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center text-stone-500 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">
                    <FileText className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  {!collapsed && (
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100 truncate">
                      Create Question
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Embedded Modals for Quick Actions */}
      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
      />
      <AddCandidateModal
        open={candidateModalOpen}
        onOpenChange={setCandidateModalOpen}
      />
      <GenerateQuestionModal
        open={questionModalOpen}
        onOpenChange={setQuestionModalOpen}
      />
    </>
  );
}

