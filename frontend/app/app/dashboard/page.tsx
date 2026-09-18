"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Plus,
  UserPlus,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Video,
  CheckCircle2,
  Users,
  MoreVertical,
} from "lucide-react";
import { useStore } from "@/lib/store/interview-store";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { GenerateQuestionModal } from "@/components/questions/generate-question-modal";

// Circular Score Ring Gauge matching screenshot
function ScoreRing({ score, color }: { score: number; color: "green" | "red" }) {
  const strokeColor = color === "green" ? "#1E6539" : "#B24734";
  const strokeDash = `${score}, 100`;
  return (
    <div className="relative flex items-center justify-center h-12 w-12 shrink-0">
      <svg className="h-full w-full -rotate-[140deg]" viewBox="0 0 36 36">
        <path
          className="text-stone-200/80 dark:text-stone-800"
          strokeWidth="3.4"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          stroke={strokeColor}
          strokeDasharray={strokeDash}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="absolute font-bold text-sm text-stone-900 dark:text-stone-100">
        {score}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { interviews, candidates, reports, currentUser } = useStore();

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  // Live session
  const liveSession = interviews.find((i) => i.status === "Live") || interviews[0];

  // Specific 5 Upcoming Sessions shown in the mockup
  const upcomingSessionsList = [
    {
      id: "int-live-1",
      name: "Maya Chen",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      status: "Live" as const,
      role: "Lead Full Stack Architect",
      date: "2026-09-15 at 11:30 (60m)",
      isLive: true,
      href: "/app/interviews/int-live-1/live",
    },
    {
      id: "int-today-2",
      name: "Hanna Lindqvist",
      avatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80",
      status: "Scheduled" as const,
      role: "Senior Frontend Engineer (Design Systems)",
      date: "2026-09-15 at 15:00 (45m)",
      isLive: false,
      href: "/app/interviews/int-today-2",
    },
    {
      id: "int-tomorrow-1",
      name: "Sofia Rodriguez",
      avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80",
      status: "Scheduled" as const,
      role: "Data Platform Engineer",
      date: "2026-09-16 at 10:00 (60m)",
      isLive: false,
      href: "/app/interviews/int-tomorrow-1",
    },
    {
      id: "int-tomorrow-2",
      name: "Alexei Petrov",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      status: "Scheduled" as const,
      role: "Senior Distributed Systems Engineer",
      date: "2026-09-16 at 14:00 (60m)",
      isLive: false,
      href: "/app/interviews/int-tomorrow-2",
    },
    {
      id: "int-week-1",
      name: "Amina Al-Mansoor",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
      status: "Scheduled" as const,
      role: "ML Engineer",
      date: "2026-09-16 at 16:00 (45m)",
      isLive: false,
      href: "/app/interviews/int-week-1",
    },
  ];

  // Specific 3 Recent Decision Intelligence entries shown in the mockup
  const decisionIntelligenceList = [
    {
      id: "rep-1",
      name: "Alexei Petrov",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      role: "Senior Distributed Systems Engineer",
      score: 89,
      integrity: 94,
      gaugeScore: 94,
      color: "green" as const,
      band: "High Confidence",
    },
    {
      id: "rep-2",
      name: "Devon Thorne",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      role: "Senior Backend Engineer",
      score: 74,
      integrity: 68,
      gaugeScore: 68,
      color: "red" as const,
      band: "Review Recommended",
    },
    {
      id: "rep-3",
      name: "Maya Chen",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      role: "Lead Full Stack Architect",
      score: 96,
      integrity: 92,
      gaugeScore: 96,
      color: "green" as const,
      band: "High Confidence",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs md:text-sm font-medium text-stone-500 dark:text-stone-400">
            Good evening, {currentUser.name.split(" ")[0]} 👋
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-0.5">
            Dashboard
          </h1>
          <p className="text-xs md:text-sm text-stone-500 dark:text-stone-400 mt-1">
            Daily operational overview of candidate pipelines, live telemetry, and review queues.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setCandidateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add Candidate</span>
          </button>

          <button
            onClick={() => setQuestionModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Question Bank</span>
          </button>

          <button
            onClick={() => setScheduleModalOpen(true)}
            disabled={currentUser.role === "Viewer"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* 2. Active Live Technical Round Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-4 sm:py-3 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 shadow-2xs backdrop-blur-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
          <div className="truncate">
            <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
              Active Technical Round: {liveSession.candidateName}
            </span>
            <span className="text-xs text-stone-400 dark:text-stone-500 ml-2 hidden sm:inline">
              {liveSession.jobRole} • Session #{liveSession.token}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href={liveSession.candidateLink || `/interview/${liveSession.token}`} target="_blank">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer">
              <ExternalLink className="h-3 w-3" />
              <span>Candidate Link</span>
            </button>
          </Link>
          <Link
            href={`/app/interviews/${liveSession.id}/live`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer">
              <Video className="h-3.5 w-3.5" />
              <span>Join Room</span>
            </button>
          </Link>
        </div>
      </div>

      {/* 3. Four KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Interviews */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[#FAF5EE] dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400">
              <Users className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Total Interviews
            </span>
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2">
            15
          </div>
          <div className="flex items-center justify-between mt-2 pt-1">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              ↑ +14% this month
            </span>
            <svg className="w-16 h-7 text-emerald-500" viewBox="0 0 64 28" fill="none">
              <path
                d="M2 24C14 24 20 16 32 16C44 16 50 6 62 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Upcoming Sessions */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[#EEF4FA] dark:bg-stone-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Upcoming Sessions
            </span>
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2">
            6
          </div>
          <div className="flex items-center justify-between mt-2 pt-1">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Next: Today 15:00
            </span>
            <div className="flex items-end gap-1 h-7">
              <div className="w-1.5 h-3 bg-blue-200 dark:bg-blue-800 rounded-xs" />
              <div className="w-1.5 h-4.5 bg-blue-300 dark:bg-blue-700 rounded-xs" />
              <div className="w-1.5 h-6 bg-blue-400 dark:bg-blue-600 rounded-xs" />
              <div className="w-1.5 h-4 bg-blue-300 dark:bg-blue-700 rounded-xs" />
              <div className="w-1.5 h-7 bg-blue-500 dark:bg-blue-500 rounded-xs" />
            </div>
          </div>
        </div>

        {/* Card 3: Completed Rounds */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[#EDF7EE] dark:bg-stone-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Completed Rounds
            </span>
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2">
            7
          </div>
          <div className="flex items-center justify-between mt-2 pt-1">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              87% completion rate
            </span>
            <div className="relative h-7 w-7">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-stone-200 dark:text-stone-800"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-600 dark:text-emerald-400"
                  strokeDasharray="87, 100"
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Card 4: Pending Review */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[#FAF2ED] dark:bg-stone-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Pending Review
            </span>
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2">
            2
          </div>
          <div className="flex items-center justify-between mt-2 pt-1">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-500">
              Human review recommended
            </span>
            <svg className="w-16 h-7 text-amber-500" viewBox="0 0 64 28" fill="none">
              <path
                d="M2 20C16 20 24 14 36 15C48 16 52 8 62 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 4. Main Two Columns: Upcoming Technical Sessions & Recent Decision Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Upcoming Technical Sessions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-base leading-tight">
                Upcoming Technical Sessions
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Scheduled sessions, allocated times, and room links
              </p>
            </div>
            <Link
              href="/app/interviews"
              className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-0.5 transition-colors"
            >
              All interviews <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden shadow-2xs">
            {upcomingSessionsList.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 sm:px-4 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.avatar}
                    alt={item.name}
                    className="h-10 w-10 rounded-full object-cover shrink-0 ring-1 ring-stone-200 dark:ring-stone-700"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {item.name}
                      </span>
                      {item.isLive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 text-[10px] font-medium shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                      {item.role} • {item.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.isLive ? (
                    <Link href={item.href}>
                      <button className="w-16 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center cursor-pointer">
                        Join
                      </button>
                    </Link>
                  ) : (
                    <Link href={item.href}>
                      <button className="w-16 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors shadow-2xs flex items-center justify-center cursor-pointer">
                        Details
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Recent Decision Intelligence */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-base leading-tight">
                Recent Decision Intelligence
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Evaluation scores and integrity confidence ratings
              </p>
            </div>
            <Link
              href="/app/reports"
              className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-0.5 transition-colors"
            >
              All reports <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden shadow-2xs">
            {decisionIntelligenceList.map((item) => (
              <Link
                key={item.id}
                href={`/app/reports/${item.id}`}
                className="flex items-center justify-between p-4 sm:px-5 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors gap-3 block"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={item.avatar}
                    alt={item.name}
                    className="h-11 w-11 rounded-full object-cover shrink-0 ring-1 ring-stone-200 dark:ring-stone-700"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                      {item.role}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                        Score: {item.score}/100
                      </span>
                      <span className="text-stone-300 dark:text-stone-600 font-bold">•</span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        {item.integrity}% Integrity
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
                  <ScoreRing score={item.gaugeScore} color={item.color} />
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap ${
                      item.color === "green"
                        ? "bg-[#EEF7F1] dark:bg-emerald-950/40 text-[#1F7A44] dark:text-emerald-400"
                        : "bg-[#FDF2F0] dark:bg-red-950/40 text-[#C23E30] dark:text-red-400"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        item.color === "green" ? "bg-[#1F7A44] dark:bg-emerald-500" : "bg-[#D44333] dark:bg-red-500"
                      }`}
                    />
                    {item.band}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} />
      <AddCandidateModal open={candidateModalOpen} onOpenChange={setCandidateModalOpen} />
      <GenerateQuestionModal open={questionModalOpen} onOpenChange={setQuestionModalOpen} />
    </div>
  );
}
