import { integrityBand, type ReportListItem } from "./reports";
import { interviewTypeLabel, sessionUiStatus, type ApiSession } from "./sessions";
import type { Overview } from "./overview";

export type RangeKey = "30d" | "90d" | "all";

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const DAY_MS = 86_400_000;

export type TrendPoint = { key: string; label: string; integrity: number | null; technical: number | null; communication: number | null; reports: number };
export type Slice = { name: string; value: number };

export type Analytics = {
  interviews: number;
  completed: number;
  completionRate: number | null;
  reports: number;
  avgIntegrity: number | null;
  avgTechnical: number | null;
  technicalReports: number;
  avgCommunication: number | null;
  trend: TrendPoint[];
  trendUnit: "week" | "month";
  outcomes: Slice[];
  integrityBands: Slice[];
  interviewTypes: Slice[];
};

const mean = (values: number[]): number | null => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const nonNull = (values: (number | null)[]): number[] => values.filter((v): v is number => v !== null);

/** The date an interview belongs to: when it is (or was) scheduled, else when it was created. */
function sessionDate(s: ApiSession): number {
  return new Date(s.scheduledAt ?? s.createdAt).getTime();
}

function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

const pad = (n: number) => String(n).padStart(2, "0");

function bucket(iso: string, unit: "week" | "month"): { key: string; label: string } {
  const d = new Date(iso);
  if (unit === "month") {
    return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString([], { month: "short", year: "numeric" }) };
  }
  const monday = mondayOf(d);
  return { key: `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`, label: monday.toLocaleDateString([], { month: "short", day: "numeric" }) };
}

function countBy<T>(items: T[], name: (item: T) => string): Slice[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(name(item), (counts.get(name(item)) ?? 0) + 1);
  const out: Slice[] = [];
  counts.forEach((value, key) => out.push({ name: key, value }));
  return out.sort((a, b) => b.value - a.value);
}

export function computeAnalytics(overview: Overview, range: RangeKey, now = Date.now()): Analytics {
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = days === null ? -Infinity : now - days * DAY_MS;

  const sessions = overview.sessions.filter((s) => sessionDate(s) >= cutoff);
  const reports: ReportListItem[] = overview.reports.filter((r) => new Date(r.createdAt).getTime() >= cutoff);

  let completed = 0;
  let stoppedShort = 0;
  for (const s of sessions) {
    if (sessionUiStatus(s) === "Completed") completed++;
    else if (s.status === "ABORTED" || s.status === "EXPIRED") stoppedShort++;
  }
  const concluded = completed + stoppedShort;

  const integrity = nonNull(reports.map((r) => r.scores.integrity));
  const technical = nonNull(reports.map((r) => r.scores.technical));
  const communication = nonNull(reports.map((r) => r.scores.communication));

  // Weekly buckets up to 90 days, monthly beyond that.
  const trendUnit = days !== null && days <= 90 ? "week" : "month";
  const grouped = new Map<string, { label: string; items: ReportListItem[] }>();
  for (const r of [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const { key, label } = bucket(r.createdAt, trendUnit);
    const entry = grouped.get(key) ?? { label, items: [] };
    entry.items.push(r);
    grouped.set(key, entry);
  }
  const trend: TrendPoint[] = [];
  grouped.forEach((entry, key) => {
    const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
    trend.push({
      key,
      label: entry.label,
      integrity: round(mean(nonNull(entry.items.map((r) => r.scores.integrity)))),
      technical: round(mean(nonNull(entry.items.map((r) => r.scores.technical)))),
      communication: round(mean(nonNull(entry.items.map((r) => r.scores.communication)))),
      reports: entry.items.length,
    });
  });
  trend.sort((a, b) => a.key.localeCompare(b.key));

  const outcomes = countBy(sessions, (s) => {
    if (s.status === "ABORTED" || s.status === "EXPIRED") return "Cancelled / expired";
    return sessionUiStatus(s) === "Scheduled" ? "Scheduled" : sessionUiStatus(s);
  });

  const bandOrder = ["High Confidence", "Moderate Variance", "Review Recommended"];
  const bands = countBy(
    reports.filter((r) => r.scores.integrity !== null),
    (r) => integrityBand(r.scores.integrity) ?? "Unscored",
  );
  const integrityBands = bandOrder.map((name) => ({ name, value: bands.find((b) => b.name === name)?.value ?? 0 }));

  const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    interviews: sessions.length,
    completed,
    completionRate: concluded > 0 ? Math.round((completed / concluded) * 100) : null,
    reports: reports.length,
    avgIntegrity: round1(mean(integrity)),
    avgTechnical: round1(mean(technical)),
    technicalReports: technical.length,
    avgCommunication: round1(mean(communication)),
    trend,
    trendUnit,
    outcomes,
    integrityBands,
    interviewTypes: countBy(sessions, (s) => interviewTypeLabel(s.config.interviewType)),
  };
}
