import { getCandidateSummary, type CandidateSummary } from "./candidates";
import { listReports, type ReportListItem } from "./reports";
import { listAllSessions, sessionUiStatus, type ApiSession } from "./sessions";

/** The org-wide snapshot the dashboard, sidebar badges and header activity feed are all derived from. */
export type Overview = {
  sessions: ApiSession[];
  sessionsTruncated: boolean;
  candidates: CandidateSummary;
  /** Newest reports first (one page of up to 100). */
  reports: ReportListItem[];
  reportsTotal: number;
  loadedAt: number;
};

const REPORT_PAGE = 100;
const CACHE_MS = 15_000;

let cached: Overview | null = null;
let inflight: Promise<Overview> | null = null;

async function fetchOverview(): Promise<Overview> {
  const [sessions, candidates, reports] = await Promise.all([
    listAllSessions(),
    getCandidateSummary(),
    listReports({ limit: REPORT_PAGE }),
  ]);
  return {
    sessions: sessions.items,
    sessionsTruncated: sessions.truncated,
    candidates,
    reports: reports.items,
    reportsTotal: reports.total,
    loadedAt: Date.now(),
  };
}

/**
 * Loads the snapshot. Concurrent callers (dashboard + sidebar) share one request, and a result under
 * 15s old is reused unless `force` is set (after something was created or changed).
 */
export function loadOverview(force = false): Promise<Overview> {
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_MS) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  const request = fetchOverview()
    .then((value) => {
      cached = value;
      return value;
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

/** Signing out or switching account must not leak the previous org's numbers. */
export function clearOverviewCache(): void {
  cached = null;
  inflight = null;
}

// ---- derivations ------------------------------------------------------------------------------

export type DashboardStats = {
  totalInterviews: number;
  createdThisMonth: number;
  upcoming: number;
  nextUpcomingAt: Date | null;
  completed: number;
  /** Completed as a share of concluded sessions (completed + aborted + expired); null until one concluded. */
  completionRate: number | null;
  live: number;
  /** Reports the backend flagged `reviewRequired`, out of the reports loaded. */
  reportsNeedingReview: number;
};

export function isUpcoming(s: ApiSession): boolean {
  return sessionUiStatus(s) === "Scheduled";
}

export function upcomingSessions(sessions: ApiSession[]): ApiSession[] {
  const withTime = (s: ApiSession) => (s.scheduledAt ? new Date(s.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER);
  return sessions.filter(isUpcoming).sort((a, b) => withTime(a) - withTime(b));
}

export function computeStats(overview: Overview, now = new Date()): DashboardStats {
  const { sessions, reports } = overview;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const upcoming = upcomingSessions(sessions);
  const nextUpcoming = upcoming.find((s) => s.scheduledAt && new Date(s.scheduledAt).getTime() >= now.getTime());

  let completed = 0;
  let stoppedShort = 0;
  let live = 0;
  for (const s of sessions) {
    if (s.status === "LIVE") live++;
    if (sessionUiStatus(s) === "Completed") completed++;
    else if (s.status === "ABORTED" || s.status === "EXPIRED") stoppedShort++;
  }
  const concluded = completed + stoppedShort;

  return {
    totalInterviews: sessions.length,
    createdThisMonth: sessions.filter((s) => new Date(s.createdAt).getTime() >= monthStart).length,
    upcoming: upcoming.length,
    nextUpcomingAt: nextUpcoming?.scheduledAt ? new Date(nextUpcoming.scheduledAt) : null,
    completed,
    completionRate: concluded > 0 ? Math.round((completed / concluded) * 100) : null,
    live,
    reportsNeedingReview: reports.filter((r) => r.scores.reviewRequired || r.degraded).length,
  };
}

/** "Today 15:00", "Tomorrow 10:00" or "Mon, Sep 21 10:00". */
export function formatWhen(d: Date, now = new Date()): string {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((day - today) / 86_400_000);
  const clock = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffDays === 0) return `Today ${clock}`;
  if (diffDays === 1) return `Tomorrow ${clock}`;
  if (diffDays === -1) return `Yesterday ${clock}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${clock}`;
}

/** "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
