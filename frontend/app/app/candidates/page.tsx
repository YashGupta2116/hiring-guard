"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import {
  Home,
  ChevronRight,
  ChevronLeft,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  UserCheck,
  CheckCircle2,
  TrendingUp,
  Star,
  Eye,
  User,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CandidatesPage() {
  const { candidates } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Extract unique roles for the role filter dropdown
  const uniqueRoles = useMemo(() => {
    const roles = Array.from(new Set(candidates.map((c) => c.appliedRole)));
    return roles.sort();
  }, [candidates]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((cand) => {
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchName = cand.name.toLowerCase().includes(q);
        const matchRole = cand.appliedRole.toLowerCase().includes(q);
        const matchEmail = cand.email.toLowerCase().includes(q);
        const matchSkill = cand.skills.some((s) => s.toLowerCase().includes(q));
        if (!matchName && !matchRole && !matchEmail && !matchSkill) return false;
      }
      if (statusFilter !== "all" && cand.status !== statusFilter) {
        return false;
      }
      if (roleFilter !== "all" && cand.appliedRole !== roleFilter) {
        return false;
      }
      return true;
    });
  }, [candidates, searchQuery, statusFilter, roleFilter]);

  // Paginated candidates
  const paginatedCandidates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, currentPage]);

  const totalCandidates = candidates.length > 8 ? 148 : filteredCandidates.length;

  return (
    <div className="space-y-5 animate-fade-in-up pb-10">
      {/* 1. Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        <Home className="h-3.5 w-3.5 text-stone-400" />
        <Link
          href="/app/dashboard"
          className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          Home
        </Link>
        <ChevronRight className="h-3 w-3 text-stone-400" />
        <span className="text-stone-800 dark:text-stone-200 font-medium">Candidates</span>
      </div>

      {/* 2. Page Header & Add Candidate Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Candidates
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            Candidate directory, aggregated evaluation benchmarks, and behavioral baseline profiles.
          </p>
        </div>

        <Button
          onClick={() => setAddModalOpen(true)}
          className="h-9 px-3.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Add candidate</span>
        </Button>
      </div>

      {/* 3. Search & Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search candidates by name, skill, role, email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-10 pr-4 py-2.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
          />
        </div>

        {/* Filter Controls Group */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Stage Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Stages</option>
              <option value="Shortlisted">Shortlisted</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Under Review">Under Review</option>
              <option value="Hired">Hired</option>
              <option value="Rejected">Rejected</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          {/* Role Filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer max-w-[180px] truncate"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          {/* Filters Action Button */}
          <button
            type="button"
            onClick={() => {
              // Toggle or reset filters
              if (statusFilter !== "all" || roleFilter !== "all" || searchQuery !== "") {
                setStatusFilter("all");
                setRoleFilter("all");
                setSearchQuery("");
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 px-3.5 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shadow-2xs cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-stone-500" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* 4. Stat Summary Cards (4 Cards Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Candidates */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Total Candidates
              </span>
            </div>
            <div className="pt-1">
              <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">148</div>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <TrendingUp className="h-3 w-3" />
                <span>12% from last month</span>
              </div>
            </div>
          </div>

          {/* Mini Bar Sparkline */}
          <div className="flex items-end gap-1.5 h-10 pr-1">
            <div className="w-1.5 bg-indigo-200 dark:bg-indigo-900/60 rounded-t h-[40%]" />
            <div className="w-1.5 bg-indigo-300 dark:bg-indigo-800/70 rounded-t h-[65%]" />
            <div className="w-1.5 bg-indigo-300 dark:bg-indigo-800/80 rounded-t h-[50%]" />
            <div className="w-1.5 bg-indigo-400 dark:bg-indigo-700 rounded-t h-[85%]" />
            <div className="w-1.5 bg-indigo-500 dark:bg-indigo-600 rounded-t h-[100%]" />
            <div className="w-1.5 bg-indigo-300 dark:bg-indigo-800/80 rounded-t h-[60%]" />
          </div>
        </div>

        {/* Card 2: Active in Process */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Active in Process
              </span>
            </div>
            <div className="pt-1">
              <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">28</div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400">
                19% of total
              </div>
            </div>
          </div>

          {/* Blue Wave Sparkline */}
          <div className="w-20 h-9 flex items-center justify-end">
            <svg viewBox="0 0 80 32" className="w-full h-full stroke-blue-500 fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 2,18 C 18,28 26,6 40,16 C 54,26 62,8 78,16" />
            </svg>
          </div>
        </div>

        {/* Card 3: Hired */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Hired
              </span>
            </div>
            <div className="pt-1">
              <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">12</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                8% of total
              </div>
            </div>
          </div>

          {/* Green Rising Wave Sparkline */}
          <div className="w-20 h-9 flex items-center justify-end">
            <svg viewBox="0 0 80 32" className="w-full h-full stroke-emerald-500 fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 2,24 C 18,22 30,26 44,18 C 58,10 68,6 78,4" />
            </svg>
          </div>
        </div>

        {/* Card 4: Under Review */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Under Review
              </span>
            </div>
            <div className="pt-1">
              <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">16</div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400">
                11% of total
              </div>
            </div>
          </div>

          {/* Coral Wavy Sparkline */}
          <div className="w-20 h-9 flex items-center justify-end">
            <svg viewBox="0 0 80 32" className="w-full h-full stroke-rose-400 fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 2,16 C 16,14 24,24 38,18 C 52,12 64,18 78,14" />
            </svg>
          </div>
        </div>
      </div>

      {/* 5. Candidates Table */}
      {filteredCandidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates found"
          description={
            searchQuery || statusFilter !== "all" || roleFilter !== "all"
              ? "No candidate profiles matched your active filters. Try clearing filters or refining your search."
              : "No candidates yet. Add your first candidate to start tracking interview performance."
          }
          actionLabel="Add candidate"
          onAction={() => setAddModalOpen(true)}
          secondaryActionLabel={
            searchQuery || statusFilter !== "all" || roleFilter !== "all"
              ? "Clear all filters"
              : undefined
          }
          onSecondaryAction={() => {
            setSearchQuery("");
            setStatusFilter("all");
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
                  <th className="px-4 py-3.5">Email</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Interviews</th>
                  <th className="px-4 py-3.5">Last Interview</th>
                  <th className="px-4 py-3.5">Average Score</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {paginatedCandidates.map((cand) => (
                  <tr
                    key={cand.id}
                    className="hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                  >
                    {/* Candidate (Avatar + Name) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CandidateAvatar
                          src={cand.avatar}
                          name={cand.name}
                          size="md"
                        />
                        <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">
                          {cand.name}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">
                      {cand.email}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 text-xs">
                      {cand.appliedRole}
                    </td>

                    {/* Interviews */}
                    <td className="px-4 py-3 text-stone-700 dark:text-stone-300 text-xs whitespace-nowrap">
                      {cand.interviewsTaken}
                    </td>

                    {/* Last Interview */}
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap font-sans">
                      {cand.lastInterviewDate || "—"}
                    </td>

                    {/* Average Score */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                          {cand.averageScore > 0 ? `${cand.averageScore}%` : "—"}
                        </span>
                        {cand.averageScore > 0 && (
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={cand.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <Link href={`/app/candidates/${cand.id}`}>
                        <button
                          type="button"
                          title={`View ${cand.name}'s profile`}
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
              Showing <strong className="font-semibold text-stone-900 dark:text-stone-100">1–8</strong> of{" "}
              <strong className="font-semibold text-stone-900 dark:text-stone-100">{totalCandidates}</strong> candidates
            </div>

            <div className="flex items-center gap-1 select-none">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 1
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                1
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(2)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 2
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                2
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(3)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 3
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                3
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(4)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 4
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                4
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(5)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 5
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                5
              </button>

              <span className="px-1 text-stone-400">…</span>

              <button
                type="button"
                onClick={() => setCurrentPage(19)}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors",
                  currentPage === 19
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                19
              </button>

              <button
                type="button"
                disabled={currentPage === 19}
                onClick={() => setCurrentPage((p) => Math.min(19, p + 1))}
                className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      <AddCandidateModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
