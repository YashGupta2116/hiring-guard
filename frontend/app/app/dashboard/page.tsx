"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Plus,
  UserPlus,
  HelpCircle,
  ChevronRight,
  Video,
  CheckCircle2,
  Users,
  FileText,
} from "lucide-react";
import { useCurrentUser } from "@/lib/auth/auth-context";
import { usePermissions } from "@/components/auth/role-guard";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import { integrityBand, type ReportListItem } from "@/lib/api/reports";
import { sessionCandidateName, sessionRef, sessionRole, sessionStart, type ApiSession } from "@/lib/api/sessions";
import { computeStats, formatWhen, greeting, timeAgo, upcomingSessions } from "@/lib/api/overview";
import { useOverview } from "@/lib/api/use-overview";

const UPCOMING_LIMIT = 5;
const REPORTS_LIMIT = 5;

type Tone = "green" | "amber" | "red";

function integrityTone(score: number): Tone {
  if (score >= 85) return "green";
  if (score >= 70) return "amber";
  return "red";
}

const TONE_STROKE: Record<Tone, string> = { green: "#1E6539", amber: "#B7791F", red: "#B24734" };
const TONE_PILL: Record<Tone, string> = {
  green: "bg-[#EEF7F1] dark:bg-sage-950/40 text-[#1F7A44] dark:text-sage-400",
  amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  red: "bg-[#FDF2F0] dark:bg-terra-950/40 text-[#C23E30] dark:text-terra-400",
};
const TONE_DOT: Record<Tone, string> = {
  green: "bg-[#1F7A44] dark:bg-sage-500",
  amber: "bg-amber-500",
  red: "bg-[#D44333] dark:bg-terra-500",
};

function ScoreRing({ score, tone }: { score: number; tone: Tone }) {
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
          stroke={TONE_STROKE[tone]}
          strokeDasharray={`${Math.max(0, Math.min(100, score))}, 100`}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="absolute font-bold text-sm text-stone-900 dark:text-stone-100">{score}</span>
    </div>
  );
}

const cardClass =
  "rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex flex-col justify-between";
const secondaryButton =
  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer";
const primaryButton =
  "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

function StatCard({
  icon,
  tint,
  label,
  value,
  caption,
  captionClass,
  href,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: React.ReactNode;
  caption: string;
  captionClass: string;
  href: string;
}) {
  return (
    <Link href={href} className={`${cardClass} hover:border-stone-300 dark:hover:border-stone-700 transition-colors`}>
      <div className="flex items-center gap-2.5">
        <div className={`h-7 w-7 rounded-lg ${tint} dark:bg-stone-800 flex items-center justify-center`}>{icon}</div>
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2">{value}</div>
      <div className={`text-xs mt-2 pt-1 ${captionClass}`}>{caption}</div>
    </Link>
  );
}

function UpcomingRow({ session, now }: { session: ApiSession; now: Date }) {
  const name = sessionCandidateName(session);
  const start = sessionStart(session);
  const isLive = session.status === "LIVE";
  return (
    <div className="flex items-center justify-between p-3.5 sm:px-4 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <CandidateAvatar
          size="lg"
          name={name}
          src={session.candidate ? candidateAvatarUrl(session.candidate) : undefined}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{name}</span>
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-50 dark:bg-sage-950/40 text-sage-700 dark:text-sage-400 text-[10px] font-semibold shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
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
            {sessionRole(session)} • {start ? formatWhen(start, now) : "Not scheduled"} ({session.durationMinutes}m)
          </p>
        </div>
      </div>
      <Link
        href={isLive ? `/app/interviews/${session.id}/live` : `/app/interviews/${session.id}`}
        className={
          isLive
            ? "w-16 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center shrink-0"
            : "w-16 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors shadow-2xs flex items-center justify-center shrink-0"
        }
      >
        {isLive ? "Join" : "Details"}
      </Link>
    </div>
  );
}

function ReportRow({ report }: { report: ReportListItem }) {
  const candidate = report.session.candidate;
  const name = candidate ? (candidate.name?.trim() || candidate.email) : "No candidate";
  const integrity = report.scores.integrity === null ? null : Math.round(report.scores.integrity);
  const composite = report.scores.composite === null ? null : Math.round(report.scores.composite);
  const band = integrityBand(report.scores.integrity);
  const tone = integrity === null ? null : integrityTone(integrity);
  return (
    <Link
      href={`/app/reports/${report.id}`}
      className="flex items-center justify-between p-4 sm:px-5 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors gap-3"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <CandidateAvatar size="xl" name={name} src={candidate ? candidateAvatarUrl(candidate) : undefined} className="h-11 w-11" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{name}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">{report.session.title?.trim() || "Untitled interview"}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              {composite !== null ? `Score: ${composite}/100` : "No overall score"}
            </span>
            <span className="text-stone-300 dark:text-stone-600 font-bold">•</span>
            <span className="text-xs text-stone-500 dark:text-stone-400">{timeAgo(report.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
        {integrity !== null && tone ? (
          <>
            <ScoreRing score={integrity} tone={tone} />
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap ${TONE_PILL[tone]}`}
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
              {band}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 whitespace-nowrap">
            Integrity not scored
          </span>
        )}
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const currentUser = useCurrentUser();
  const { canCreateInterview, canManageCandidates } = usePermissions();
  const { data, error, reload } = useOverview();

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);

  const now = new Date();
  const firstName = currentUser.name.split(" ")[0];

  const header = (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="text-xs md:text-sm font-medium text-stone-500 dark:text-stone-400">
          {greeting(now)}, {firstName}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-0.5">Dashboard</h1>
        <p className="text-xs md:text-sm text-stone-500 dark:text-stone-400 mt-1">
          Overview: interview pipeline, live sessions and the latest reports.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
        <button onClick={() => setCandidateModalOpen(true)} disabled={!canManageCandidates} className={secondaryButton}>
          <UserPlus className="h-3.5 w-3.5" />
          <span>Add Candidate</span>
        </button>
        <Link href="/app/questions" className={secondaryButton}>
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Question Bank</span>
        </Link>
        <button onClick={() => setScheduleModalOpen(true)} disabled={!canCreateInterview} className={primaryButton}>
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Schedule Interview</span>
        </button>
      </div>
    </div>
  );

  const modals = (
    <>
      <ScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} onCreated={reload} />
      <AddCandidateModal open={candidateModalOpen} onOpenChange={setCandidateModalOpen} onCreated={reload} />
    </>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {error ? (
          <ErrorState title="Could not load the dashboard" description={error} onRetry={reload} />
        ) : (
          <LoadingState variant="cards" rows={4} />
        )}
        {modals}
      </div>
    );
  }

  const stats = computeStats(data, now);
  const liveSessions = data.sessions.filter((s) => s.status === "LIVE");
  const liveSession = liveSessions[0];
  const upcoming = [...liveSessions, ...upcomingSessions(data.sessions)].slice(0, UPCOMING_LIMIT);
  const recentReports = data.reports.slice(0, REPORTS_LIMIT);
  const monthLabel = now.toLocaleDateString([], { month: "long" });

  return (
    <div className="space-y-6">
      {header}

      {error && <ErrorState className="min-h-0 p-4" title="Could not refresh" description={error} onRetry={reload} />}
      {data.sessionsTruncated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This organisation has more sessions than the dashboard loads, so the counts below cover only the newest ones.
        </p>
      )}

      {/* Live banner: shown only while a session is actually live */}
      {liveSession && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-4 sm:py-3 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sage-50 dark:bg-sage-950/40 text-sage-700 dark:text-sage-400 text-xs font-semibold shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
              Live
            </span>
            <div className="truncate">
              <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                Active round: {sessionCandidateName(liveSession)}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500 ml-2 hidden sm:inline">
                {sessionRole(liveSession)} • Session #{sessionRef(liveSession.id)}
                {liveSessions.length > 1 ? ` • +${liveSessions.length - 1} more live` : ""}
              </span>
            </div>
          </div>
          <Link
            href={`/app/interviews/${liveSession.id}/live`}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors shrink-0 self-start sm:self-auto"
          >
            <Video className="h-3.5 w-3.5" />
            <span>Join Room</span>
          </Link>
        </div>
      )}

      {/* KPI cards: every figure is counted from the org's sessions and reports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          href="/app/interviews"
          icon={<Users className="h-4 w-4 text-stone-600 dark:text-stone-400" />}
          tint="bg-[#FAF5EE]"
          label="Total Interviews"
          value={stats.totalInterviews}
          caption={`${stats.createdThisMonth} created in ${monthLabel}`}
          captionClass="font-medium text-stone-500 dark:text-stone-400"
        />
        <StatCard
          href="/app/interviews"
          icon={<CalendarDays className="h-4 w-4 text-slate-600 dark:text-slate-400" />}
          tint="bg-[#EEF4FA]"
          label="Upcoming Sessions"
          value={stats.upcoming}
          caption={
            stats.nextUpcomingAt
              ? `Next: ${formatWhen(stats.nextUpcomingAt, now)}`
              : stats.upcoming > 0
                ? "Start time has passed; not started yet"
                : "Nothing scheduled"
          }
          captionClass="font-medium text-stone-500 dark:text-stone-400"
        />
        <StatCard
          href="/app/interviews"
          icon={<CheckCircle2 className="h-4 w-4 text-sage-600 dark:text-sage-400" />}
          tint="bg-[#EDF7EE]"
          label="Completed Rounds"
          value={stats.completed}
          caption={stats.completionRate === null ? "No concluded sessions yet" : `${stats.completionRate}% of concluded sessions`}
          captionClass="font-semibold text-sage-600 dark:text-sage-400"
        />
        <StatCard
          href="/app/reports"
          icon={<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          tint="bg-[#FAF2ED]"
          label="Reports To Review"
          value={stats.reportsNeedingReview}
          caption={
            data.reportsTotal === 0
              ? "No reports yet"
              : data.reportsTotal > data.reports.length
                ? `Among the newest ${data.reports.length} of ${data.reportsTotal} reports`
                : `Of ${data.reportsTotal} report${data.reportsTotal === 1 ? "" : "s"}`
          }
          captionClass="font-medium text-amber-700 dark:text-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Upcoming */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-base leading-tight">Upcoming Technical Sessions</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Live now, then scheduled sessions by start time</p>
            </div>
            <Link
              href="/app/interviews"
              className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-0.5 transition-colors"
            >
              All interviews <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming sessions"
              description="Scheduled and live interviews will show up here."
              actionLabel={canCreateInterview ? "Schedule Interview" : undefined}
              onAction={canCreateInterview ? () => setScheduleModalOpen(true) : undefined}
            />
          ) : (
            <div className="rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden shadow-2xs">
              {upcoming.map((session) => (
                <UpcomingRow key={session.id} session={session} now={now} />
              ))}
            </div>
          )}
        </div>

        {/* Reports */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-base leading-tight">Recent Reports</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Newest reports with their integrity score</p>
            </div>
            <Link
              href="/app/reports"
              className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-0.5 transition-colors"
            >
              All reports <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {recentReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="A report is generated after each completed interview has been processed."
            />
          ) : (
            <div className="rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden shadow-2xs">
              {recentReports.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </div>

      {modals}
    </div>
  );
}
