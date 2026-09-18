"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Home } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat, StatGroup } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { computeAnalytics, RANGES, type RangeKey, type Slice } from "@/lib/api/analytics";
import { useOverview } from "@/lib/api/use-overview";

const OUTCOME_COLORS: Record<string, string> = {
  Completed: "#4f6d54",
  Live: "#3b6a9a",
  Scheduled: "#8a8578",
  Draft: "#b5b0a4",
  "Cancelled / expired": "#963927",
};

const BAND_COLORS: Record<string, string> = {
  "High Confidence": "#4f6d54",
  "Moderate Variance": "#b47b2c",
  "Review Recommended": "#963927",
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  color: "hsl(var(--foreground))",
  borderRadius: "0.375rem",
  fontSize: "11px",
};

const axis = { stroke: "currentColor", className: "text-muted-foreground", tickLine: false } as const;

function Card({ title, description, note, children, className }: { title: string; description: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 space-y-3 ${className ?? ""}`}>
      <SectionHeader title={title} description={description} />
      {children}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function NoData({ text }: { text: string }) {
  return <div className="h-52 flex items-center justify-center text-center text-xs text-muted-foreground px-6">{text}</div>;
}

const fmt = (v: number | null) => (v === null ? "-" : v.toFixed(1));

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("90d");
  const { data, error, reload } = useOverview();

  const header = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link href="/app/dashboard" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Analytics</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Analytics</h1>
          <p className="text-xs text-neutral-500 mt-1">Counts and averages worked out from this organization&apos;s interviews and reports.</p>
        </div>
        <select
          aria-label="Time range"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
        >
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  if (!data) {
    return (
      <div className="space-y-5 animate-fade-in-up pb-12">
        {header}
        {error ? <ErrorState title="Could not load analytics" description={error} onRetry={reload} /> : <LoadingState variant="cards" rows={3} />}
      </div>
    );
  }

  if (data.sessions.length === 0 && data.reports.length === 0) {
    return (
      <div className="space-y-5 animate-fade-in-up pb-12">
        {header}
        <EmptyState icon={BarChart3} title="Nothing to analyze yet" description="Analytics appear once interviews have been scheduled and reports generated." />
      </div>
    );
  }

  const a = computeAnalytics(data, range);
  const hire = data.candidates.byStatus.HIRED ?? 0;
  const showTechnical = a.trend.some((p) => p.technical !== null);
  const showCommunication = a.trend.some((p) => p.communication !== null);
  const reportsTruncated = data.reportsTotal > data.reports.length;
  const unit = a.trendUnit === "week" ? "week" : "month";

  return (
    <div className="space-y-5 animate-fade-in-up pb-12">
      {header}

      {error && <ErrorState className="min-h-0 p-4" title="Could not refresh" description={error} onRetry={reload} />}
      {(data.sessionsTruncated || reportsTruncated) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This organization has more data than is loaded here, so figures cover the newest {data.sessionsTruncated ? "sessions" : ""}
          {data.sessionsTruncated && reportsTruncated ? " and " : ""}
          {reportsTruncated ? `${data.reports.length} of ${data.reportsTotal} reports` : ""} only.
        </p>
      )}

      <StatGroup className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Interviews" value={a.interviews} change={RANGES.find((r) => r.key === range)?.label} />
        <Stat
          label="Completed"
          value={a.completed}
          change={a.completionRate === null ? "None concluded yet" : `${a.completionRate}% of concluded`}
          trend={a.completionRate === null ? "neutral" : "up"}
        />
        <Stat label="Avg integrity score" value={fmt(a.avgIntegrity)} change={`${a.reports} report${a.reports === 1 ? "" : "s"}`} />
        <Stat
          label="Avg technical score"
          value={fmt(a.avgTechnical)}
          change={a.technicalReports ? `${a.technicalReports} report${a.technicalReports === 1 ? "" : "s"}` : "No scored reports"}
        />
        <Stat label="Candidates hired" value={hire} change={`of ${data.candidates.total} candidates, all time`} />
      </StatGroup>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          className="lg:col-span-7"
          title="Score trend"
          description={`Average score per ${unit}, from reports created in the range`}
          note={
            a.trend.length === 1
              ? `Only one ${unit} has reports so far, so there is no trend yet.`
              : !showCommunication
                ? "Communication isn't shown: it needs a transcript to grade answers, and none exist yet."
                : undefined
          }
        >
          {a.trend.length === 0 ? (
            <NoData text="No reports in this range." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.trend}>
                  <XAxis dataKey="label" fontSize={11} {...axis} />
                  <YAxis domain={[0, 100]} fontSize={11} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="integrity" name="Integrity" stroke="#4f6d54" strokeWidth={1.5} fillOpacity={0.06} fill="#4f6d54" dot connectNulls />
                  {showTechnical && (
                    <Area type="monotone" dataKey="technical" name="Technical" stroke="hsl(var(--foreground))" strokeWidth={1.5} fillOpacity={0.05} fill="hsl(var(--foreground))" dot connectNulls />
                  )}
                  {showCommunication && (
                    <Area type="monotone" dataKey="communication" name="Communication" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} fillOpacity={0.04} fill="hsl(var(--muted-foreground))" dot connectNulls />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-5" title="Interview outcomes" description="Where interviews in the range stand">
          {a.outcomes.length === 0 ? (
            <NoData text="No interviews in this range." />
          ) : (
            <>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={a.outcomes} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={a.outcomes.length > 1 ? 4 : 0}>
                      {a.outcomes.map((s: Slice) => (
                        <Cell key={s.name} fill={OUTCOME_COLORS[s.name] ?? "#8a8578"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-border text-center text-xs">
                {a.outcomes.map((s) => (
                  <div key={s.name}>
                    <span className="font-semibold text-foreground block">{s.value}</span>
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[s.name] ?? "#8a8578" }} />
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Integrity score distribution" description="Reports per band, using the same 85 / 70 cut-offs as the reports page">
          {a.reports === 0 ? (
            <NoData text="No reports in this range." />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.integrityBands}>
                  <XAxis dataKey="name" fontSize={10} {...axis} />
                  <YAxis allowDecimals={false} fontSize={11} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Reports" radius={[2, 2, 0, 0]}>
                    {a.integrityBands.map((s) => (
                      <Cell key={s.name} fill={BAND_COLORS[s.name]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Interview types" description="How many interviews in the range were set up as each type" note="Shows the type chosen when scheduling. Per-skill results need graded answers, which need transcripts, so they are not shown.">
          {a.interviewTypes.length === 0 ? (
            <NoData text="No interviews in this range." />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.interviewTypes} layout="vertical">
                  <XAxis type="number" allowDecimals={false} fontSize={11} {...axis} />
                  <YAxis dataKey="name" type="category" fontSize={10} width={100} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Interviews" fill="hsl(var(--muted-foreground))" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Technical scores come from hidden-test results. In this environment the code sandbox is a mock that marks every test as passed, so treat them as placeholders rather than evidence.
      </p>
    </div>
  );
}
