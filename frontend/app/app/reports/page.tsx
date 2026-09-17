"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FileText,
  Search,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

export default function ReportsPage() {
  const { reports } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [integrityFilter, setIntegrityFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filteredReports = reports.filter((r) => {
    // Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = r.candidateName.toLowerCase().includes(q);
      const matchRole = r.appliedRole.toLowerCase().includes(q);
      if (!matchName && !matchRole) return false;
    }
    // Integrity band filter
    if (integrityFilter !== "all" && r.integrityBand !== integrityFilter) {
      return false;
    }
    // Role filter
    if (roleFilter !== "all" && r.appliedRole !== roleFilter) {
      return false;
    }
    return true;
  });

  const roles = Array.from(new Set(reports.map((r) => r.appliedRole)));

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* 8. Page Header */}
      <PageHeader
        title="Reports"
        description="Candidate evaluation summaries, question rubrics, and multimodal integrity timelines."
      >
        <div className="text-xs text-muted-foreground font-mono">
          {reports.length} reports evaluated
        </div>
      </PageHeader>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search reports by candidate or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Integrity Band */}
          <select
            value={integrityFilter}
            onChange={(e) => setIntegrityFilter(e.target.value)}
            className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          >
            <option value="all">All Integrity Levels</option>
            <option value="High Confidence">High Confidence</option>
            <option value="Moderate Variance">Moderate Variance</option>
            <option value="Review Recommended">Review Recommended</option>
          </select>

          {/* Role */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors max-w-[200px]"
          >
            <option value="all">All Roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports Table or Empty State */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports available"
          description="Completed interview reports will appear here."
          actionLabel={searchQuery || integrityFilter !== "all" ? "Clear filters" : undefined}
          onAction={() => {
            setSearchQuery("");
            setIntegrityFilter("all");
            setRoleFilter("all");
          }}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-border bg-secondary/35 text-muted-foreground font-medium text-[11px]">
              <tr>
                <th className="px-3.5 py-2.5">Candidate</th>
                <th className="px-3.5 py-2.5">Role</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5">Overall</th>
                <th className="px-3.5 py-2.5">Technical</th>
                <th className="px-3.5 py-2.5">Communication</th>
                <th className="px-3.5 py-2.5">Integrity Band</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className="hover:bg-secondary/40 transition-colors"
                >
                  {/* Candidate */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CandidateAvatar
                        src={report.candidateAvatar}
                        name={report.candidateName}
                        size="md"
                      />
                      <div>
                        <div className="font-semibold text-foreground text-xs">
                          {report.candidateName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Interviewer: {report.interviewerName.split(" ")[0]}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-3.5 py-2.5 font-medium text-foreground text-xs">
                    {report.appliedRole}
                  </td>

                  {/* Date */}
                  <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap text-[11px]">
                    {report.interviewDate}
                  </td>

                  {/* Overall Score */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <span className="font-semibold text-foreground text-xs">
                      {report.overallScore}
                    </span>
                    <span className="text-muted-foreground text-[10px]">/100</span>
                  </td>

                  {/* Technical */}
                  <td className="px-3.5 py-2.5 text-foreground font-medium text-xs">
                    {report.technicalScore}%
                  </td>

                  {/* Communication */}
                  <td className="px-3.5 py-2.5 text-muted-foreground text-xs">
                    {report.communicationScore}%
                  </td>

                  {/* Integrity Confidence */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <StatusBadge status={report.integrityBand} size="sm" />
                  </td>

                  {/* Status */}
                  <td className="px-3.5 py-2.5">
                    <StatusBadge status={report.status} size="sm" />
                  </td>

                  {/* Action */}
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <Link href={`/app/reports/${report.id}`}>
                      <Button size="sm" variant="ghost" className="h-6.5 text-[11px] px-2 gap-1">
                        Report <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
