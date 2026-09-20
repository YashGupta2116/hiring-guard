"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import { usePermissions } from "@/components/auth/role-guard";
import {
  CANDIDATE_STATUSES,
  candidateAvatarUrl,
  candidateDisplayName,
  candidateStatusLabel,
  listCandidates,
  getCandidateSummary,
  type CandidateStatusCode,
  type CandidateSummary,
  type DirectoryCandidate,
} from "@/lib/api/candidates";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
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
  Star,
  Eye,
  User,
  ChevronDown,
} from "lucide-react";

const PAGE_SIZE = 8;

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong while loading candidates.";
}

function percentOf(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}% of total` : "No candidates yet";
}

export default function CandidatesPage() {
  const { canManageCandidates } = usePermissions();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CandidateStatusCode | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Cursor pagination: one cursor per visited page, so "previous" is just popping the stack.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const pageIndex = cursors.length - 1;

  const [items, setItems] = useState<DirectoryCandidate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CandidateSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const currentCursor = cursors[pageIndex];

  useEffect(() => {
    let cancelled = false;
    listCandidates({
      q: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      appliedRole: roleFilter === "all" ? undefined : roleFilter,
      limit: PAGE_SIZE,
      cursor: currentCursor,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, statusFilter, roleFilter, currentCursor, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    getCandidateSummary()
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch(() => {
        // The stat cards degrade to "—"; the table has its own error state.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const resetToFirstPage = () => {
    setCursors([undefined]);
    setLoading(true);
  };

  const hasActiveFilters = search !== "" || statusFilter !== "all" || roleFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    resetToFirstPage();
  };

  const total = summary?.total ?? null;
  // A grand total is only knowable when the active filters are ones the summary counts.
  const filteredTotal =
    summary === null || search !== "" || roleFilter !== "all"
      ? null
      : statusFilter === "all"
        ? summary.total
        : summary.byStatus[statusFilter];
  const firstShown = items.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const lastShown = pageIndex * PAGE_SIZE + items.length;

  return (
    <div className="space-y-5 animate-fade-in-up pb-10">
      {/* 1. Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        <Home className="h-3.5 w-3.5 text-stone-400" />
        <Link href="/app/dashboard" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3 text-stone-400" />
        <span className="text-stone-800 dark:text-stone-200 font-medium">Candidates</span>
      </div>

      {/* 2. Page Header & Add Candidate Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Candidates</h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            Candidate directory, aggregated evaluation benchmarks, and behavioral baseline profiles.
          </p>
        </div>

        {canManageCandidates && (
          <Button
            onClick={() => setAddModalOpen(true)}
            className="h-9 px-3.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 text-xs font-semibold shadow-xs gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Add candidate</span>
          </Button>
        )}
      </div>

      {/* 3. Search & Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search candidates by name, skill, role, email..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetToFirstPage();
            }}
            className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-10 pr-4 py-2.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              aria-label="Filter by stage"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CandidateStatusCode | "all");
                resetToFirstPage();
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Stages</option>
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          <div className="relative">
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                resetToFirstPage();
              }}
              className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer max-w-[180px] truncate"
            >
              <option value="all">All Roles</option>
              {(summary?.roles ?? []).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters && searchInput === ""}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 px-3.5 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-stone-500" />
            <span>Clear filters</span>
          </button>
        </div>
      </div>

      {/* 4. Stat Summary Cards (real counts for the whole directory) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          tone="bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400"
          label="Total Candidates"
          value={total}
          note="Across all stages"
        />
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          tone="bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400"
          label="Active in Process"
          value={summary?.byStatus.INTERVIEWING ?? null}
          note={summary ? percentOf(summary.byStatus.INTERVIEWING, summary.total) : ""}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="bg-sage-50 dark:bg-sage-950/40 text-sage-600 dark:text-sage-400"
          label="Hired"
          value={summary?.byStatus.HIRED ?? null}
          note={summary ? percentOf(summary.byStatus.HIRED, summary.total) : ""}
        />
        <StatCard
          icon={<User className="h-4 w-4" />}
          tone="bg-terra-50 dark:bg-terra-950/40 text-terra-500 dark:text-terra-400"
          label="Under Review"
          value={summary?.byStatus.UNDER_REVIEW ?? null}
          note={summary ? percentOf(summary.byStatus.UNDER_REVIEW, summary.total) : ""}
        />
      </div>

      {/* 5. Candidates Table */}
      {loading ? (
        <LoadingState rows={PAGE_SIZE} />
      ) : error ? (
        <ErrorState title="Couldn't load candidates" description={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates found"
          description={
            hasActiveFilters
              ? "No candidate profiles matched your active filters. Try clearing filters or refining your search."
              : "No candidates yet. Add your first candidate to start tracking interview performance."
          }
          actionLabel={canManageCandidates ? "Add candidate" : undefined}
          onAction={canManageCandidates ? () => setAddModalOpen(true) : undefined}
          secondaryActionLabel={hasActiveFilters ? "Clear all filters" : undefined}
          onSecondaryAction={hasActiveFilters ? clearFilters : undefined}
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
                {items.map((cand) => {
                  const displayName = candidateDisplayName(cand);
                  return (
                    <tr key={cand.id} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CandidateAvatar src={candidateAvatarUrl(cand)} name={displayName} size="md" />
                          <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">{displayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">{cand.email}</td>
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 text-xs">{cand.appliedRole ?? "—"}</td>
                      <td className="px-4 py-3 text-stone-700 dark:text-stone-300 text-xs whitespace-nowrap">{cand.interviewsTaken}</td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap font-sans">
                        {cand.lastInterviewAt ? formatDate(cand.lastInterviewAt) : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                            {cand.averageScore !== null ? `${Math.round(cand.averageScore)}%` : "—"}
                          </span>
                          {cand.averageScore !== null && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={candidateStatusLabel(cand.status)} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Link href={`/app/candidates/${cand.id}`}>
                          <button
                            type="button"
                            title={`View ${displayName}'s profile`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200/80 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900/60 text-xs text-stone-500 dark:text-stone-400">
            <div>
              Showing{" "}
              <strong className="font-semibold text-stone-900 dark:text-stone-100">
                {firstShown}–{lastShown}
              </strong>
              {filteredTotal !== null && (
                <>
                  {" "}
                  of <strong className="font-semibold text-stone-900 dark:text-stone-100">{filteredTotal}</strong>
                </>
              )}{" "}
              candidates
            </div>

            <div className="flex items-center gap-2 select-none">
              <button
                type="button"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() => {
                  setCursors((c) => c.slice(0, -1));
                  setLoading(true);
                }}
                className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[56px] text-center font-semibold text-stone-900 dark:text-stone-100">Page {pageIndex + 1}</span>
              <button
                type="button"
                aria-label="Next page"
                disabled={nextCursor === null}
                onClick={() => {
                  if (nextCursor === null) return;
                  setCursors((c) => [...c, nextCursor]);
                  setLoading(true);
                }}
                className="h-7 w-7 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <AddCandidateModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onCreated={() => {
          setCursors([undefined]);
          reload();
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number | null;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-2xs">
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
      </div>
      <div className="pt-2">
        <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{value ?? "—"}</div>
        <div className="text-[11px] text-stone-500 dark:text-stone-400">{note || " "}</div>
      </div>
    </div>
  );
}
