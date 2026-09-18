"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FileText,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Eye,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { reports } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [integrityFilter, setIntegrityFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
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
  }, [reports, searchQuery, integrityFilter, roleFilter]);

  const roles = useMemo(() => {
    const unique = Array.from(new Set(reports.map((r) => r.appliedRole)));
    return unique.sort();
  }, [reports]);

  const totalPages = Math.ceil(filteredReports.length / pageSize);

  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  return (
    <div className="space-y-5 animate-fade-in-up pb-10">
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
        <span className="text-neutral-600 dark:text-neutral-400">Reports</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Reports
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Candidate evaluation summaries, question rubrics, and multimodal integrity timelines.
          </p>
        </div>
        <div className="text-xs text-stone-400 dark:text-stone-500 font-mono pt-1 sm:text-right shrink-0">
          {reports.length} reports evaluated
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search reports by candidate or role..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-10 pr-4 py-2.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Integrity Band */}
          <div className="relative">
            <select
              value={integrityFilter}
              onChange={(e) => {
                setIntegrityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Integrity Levels</option>
              <option value="High Confidence">High Confidence</option>
              <option value="Moderate Variance">Moderate Variance</option>
              <option value="Review Recommended">Review Recommended</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          {/* Role */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>
        </div>
      </div>

      {/* Reports Table or Empty State */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports available"
          description="Completed interview reports will appear here."
          actionLabel={searchQuery || integrityFilter !== "all" || roleFilter !== "all" ? "Clear filters" : undefined}
          onAction={() => {
            setSearchQuery("");
            setIntegrityFilter("all");
            setRoleFilter("all");
          }}
        />
      ) : (
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 text-stone-500 dark:text-stone-400 font-medium">
                <tr>
                  <th className="px-4 py-3.5">Candidate</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Overall</th>
                  <th className="px-4 py-3.5">Technical</th>
                  <th className="px-4 py-3.5">Communication</th>
                  <th className="px-4 py-3.5">Integrity Band</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {paginatedReports.map((report) => (
                  <tr
                    key={report.id}
                    className="hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                  >
                    {/* Candidate */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CandidateAvatar
                          src={report.candidateAvatar}
                          name={report.candidateName}
                          size="md"
                        />
                        <div>
                          <div className="font-semibold text-stone-900 dark:text-stone-100 text-xs">
                            {report.candidateName}
                          </div>
                          <div className="text-[11px] text-stone-400 dark:text-stone-500">
                            Interviewer: {report.interviewerName.split(" ")[0]}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 text-xs">
                      {report.appliedRole}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap font-sans">
                      {report.interviewDate}
                    </td>

                    {/* Overall Score */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                        {report.overallScore}
                      </span>
                      <span className="text-stone-400 text-[10px]">/100</span>
                    </td>

                    {/* Technical */}
                    <td className="px-4 py-3 text-stone-900 dark:text-stone-100 font-medium text-xs whitespace-nowrap">
                      {report.technicalScore}%
                    </td>

                    {/* Communication */}
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap">
                      {report.communicationScore}%
                    </td>

                    {/* Integrity Confidence */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={report.integrityBand} size="sm" />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={report.status} size="sm" />
                    </td>

                    {/* Action - Eye Icon Button */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <Link href={`/app/reports/${report.id}`}>
                        <button
                          type="button"
                          title={`View report for ${report.candidateName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200/80 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900/60 text-xs text-stone-500 dark:text-stone-400">
            <div>
              Showing <strong className="font-semibold text-stone-900 dark:text-stone-100">
                {paginatedReports.length > 0
                  ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredReports.length)}`
                  : "0"}
              </strong> of{" "}
              <strong className="font-semibold text-stone-900 dark:text-stone-100">{filteredReports.length}</strong> reports
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 select-none">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={cn(
                      "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                      currentPage === p
                        ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                        : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                    )}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}