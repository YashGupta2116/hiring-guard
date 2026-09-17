"use client";

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat, StatGroup } from "@/components/ui/stat";
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Award,
  Users,
} from "lucide-react";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("Last 90 Days");

  // Realistic analytics dataset
  const scoreTrendsData = [
    { month: "May", technical: 82, communication: 78, integrity: 93 },
    { month: "Jun", technical: 85, communication: 81, integrity: 90 },
    { month: "Jul", technical: 84, communication: 84, integrity: 94 },
    { month: "Aug", technical: 89, communication: 86, integrity: 92 },
    { month: "Sep", technical: 88, communication: 89, integrity: 91 },
  ];

  const integrityDistributionData = [
    { range: "90% - 100% (Optimal)", count: 18 },
    { range: "80% - 89% (Normal)", count: 7 },
    { range: "70% - 79% (Moderate)", count: 3 },
    { range: "< 70% (Anomaly)", count: 1 },
  ];

  const skillsAssessedData = [
    { skill: "Distributed Systems", sessions: 24 },
    { skill: "React Architecture", sessions: 22 },
    { skill: "Concurrency & Lock-Free", sessions: 18 },
    { skill: "Cloud & Storage Infra", sessions: 15 },
    { skill: "Database Query Tuning", sessions: 14 },
    { skill: "System Security & Auth", sessions: 12 },
  ];

  const outcomeDistributionData = [
    { name: "Strong Hire / Hire", value: 16, color: "#4f6d54" },
    { name: "Needs Review", value: 7, color: "#b47b2c" },
    { name: "No Hire / Withdrawn", value: 5, color: "#963927" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up pb-12">
      {/* 8. Page Header */}
      <PageHeader
        title="Analytics"
        description="Recruiting pipeline velocity, multimodal integrity distributions, and technical rubric metrics."
      >
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
        >
          <option value="Last 30 Days">Last 30 Days</option>
          <option value="Last 90 Days">Last 90 Days</option>
          <option value="Year to Date">Year to Date</option>
        </select>
      </PageHeader>

      {/* 20. Metrics Row */}
      <StatGroup className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Total Interviews"
          value={122}
          change="+18% vs last quarter"
          trend="up"
        />
        <Stat
          label="Avg Candidate Score"
          value="86.4%"
          change="Industry p75: 78%"
          trend="neutral"
        />
        <Stat
          label="Avg Technical Score"
          value="88.1%"
          change="Rubric consistency"
          trend="up"
        />
        <Stat
          label="Integrity Confidence"
          value="91.6%"
          change="Baseline stability"
          trend="up"
        />
        <Stat
          label="Pass / Offer Rate"
          value="57.1%"
          change="Strict quality bar"
          trend="neutral"
        />
      </StatGroup>

      {/* Primary Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Multi-Signal Score Trends */}
        <div className="lg:col-span-7">
          <div className="rounded-lg border border-border bg-card p-5 h-full space-y-3">
            <SectionHeader
              title="Multimodal Score Trajectory"
              description="Monthly technical, communication & integrity confidence averages"
            >
              <span className="text-[11px] text-muted-foreground font-mono">Quarterly</span>
            </SectionHeader>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreTrendsData}>
                  <XAxis
                    dataKey="month"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[60, 100]}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      borderRadius: "0.375rem",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area
                    type="monotone"
                    dataKey="technical"
                    name="Technical Score"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.5}
                    fillOpacity={0.08}
                    fill="hsl(var(--foreground))"
                  />
                  <Area
                    type="monotone"
                    dataKey="communication"
                    name="Communication"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    fillOpacity={0.04}
                    fill="hsl(var(--muted-foreground))"
                  />
                  <Area
                    type="monotone"
                    dataKey="integrity"
                    name="Integrity Confidence"
                    stroke="#4f6d54"
                    strokeWidth={1.5}
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Outcome Distribution */}
        <div className="lg:col-span-5">
          <div className="rounded-lg border border-border bg-card p-5 h-full flex flex-col justify-between space-y-3">
            <SectionHeader
              title="Candidate Decision Outcomes"
              description="Distribution of recommendations across completed sessions"
            />

            <div className="h-52 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomeDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {outcomeDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      borderRadius: "0.375rem",
                      fontSize: "11px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center text-xs">
              {outcomeDistributionData.map((item) => (
                <div key={item.name}>
                  <span className="font-semibold text-foreground block">{item.value}</span>
                  <span className="text-[10px] text-muted-foreground">{item.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lower Analytics Grid: Integrity Distribution & Skills Frequency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Integrity Confidence Band Distribution */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <SectionHeader
            title="Integrity Confidence Distribution"
            description="Proportion of candidates falling within verified baseline bands"
          />

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={integrityDistributionData}>
                <XAxis
                  dataKey="range"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    borderRadius: "0.375rem",
                    fontSize: "11px",
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Sessions"
                  fill="hsl(var(--foreground))"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Assessed Engineering Competencies */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <SectionHeader
            title="Evaluated Engineering Competencies"
            description="Frequency of core competency evaluations across question bank sessions"
          />

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skillsAssessedData} layout="vertical">
                <XAxis
                  type="number"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  dataKey="skill"
                  type="category"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={10}
                  width={130}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    borderRadius: "0.375rem",
                    fontSize: "11px",
                  }}
                />
                <Bar
                  dataKey="sessions"
                  name="Sessions"
                  fill="hsl(var(--muted-foreground))"
                  radius={[0, 2, 2, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
