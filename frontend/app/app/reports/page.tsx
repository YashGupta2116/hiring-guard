"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError } from "@/lib/api/client";
import { candidateAvatarUrl } from "@/lib/api/candidates";
import { integrityBand, listReports, reportStatus, type ReportListItem } from "@/lib/api/reports";
import { formatDate } from "@/lib/utils";
import { FileText, Search, ChevronRight, ChevronLeft, ChevronDown, Eye, Home } from "lucide-react";

const PAGE_SIZE = 9;

type Band = "HIGH" | "MODERATE" | "REVIEW";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

export default function ReportsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [band, setBand] = useState<Band | "all">("all");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const pageIndex = cursors.length - 1;
  const cursor = cursors[pageIndex];

  const [items, setItems] = useState<ReportListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    listReports({ q: search || undefined, band: band === "all" ? undefined : band, limit: PAGE_SIZE, cursor })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Something went wrong while loading reports."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, band, cursor, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const resetPage = () => {
    setCursors([undefined]);
    setLoading(true);
  };

  const filtered = search !== "" || band !== "all";
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setBand("all");
    resetPage();
  };
  const first = items.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const last = pageIndex * PAGE_SIZE + items.length;

  return (
    <div className="space-y-5 animate-fade-in-up pb-10">
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link href="/app/dashboard" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Reports</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Reports</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Scores, flags and verified evidence for every completed interview.</p>
        </div>
        <div className="text-xs text-stone-400 dark:text-stone-500 font-mono pt-1 sm:text-right shrink-0">{total === null ? "" : `${total} ${total === 1 ? "report" : "reports"}${filtered ? " match" : ""}`}</div>
      </div>

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search reports by candidate or role..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetPage();
            }}
            className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-10 pr-4 py-2.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
          />
        </div>

        <div className="relative">
          <select
            aria-label="Filter by integrity level"
            value={band}
            onChange={(e) => {
              setBand(e.target.value as Band | "all");
              resetPage();
            }}
            className="appearance-none rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/80 dark:bg-stone-900/60 pl-3.5 pr-8 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs cursor-pointer"
          >
            <option value="all">All Integrity Levels</option>
            <option value="HIGH">High Confidence (85+)</option>
            <option value="MODERATE">Moderate Variance (70–84)</option>
            <option value="REVIEW">Review Recommended (under 70)</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
        </div>
      </div>

      {loading ? (
        <LoadingState rows={PAGE_SIZE} />
      ) : error ? (
        <ErrorState title="Couldn't load reports" description={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports available"
          description={filtered ? "No reports match your filters." : "Reports appear here once an interview has ended and been processed."}
          actionLabel={filtered ? "Clear filters" : undefined}
          onAction={filtered ? clearFilters : undefined}
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
                  <th className="px-4 py-3.5">Integrity</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {items.map((report) => {
                  const cand = report.session.candidate;
                  const name = cand?.name?.trim() || cand?.email || "No candidate";
                  const b = integrityBand(report.scores.integrity);
                  const date = report.session.startedAt ?? report.createdAt;
                  return (
                    <tr key={report.id} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CandidateAvatar src={cand ? candidateAvatarUrl(cand) : undefined} name={name} size="md" />
                          <div>
                            <Link href={`/app/reports/${report.id}`} className="font-semibold text-stone-900 dark:text-stone-100 text-xs hover:underline">
                              {name}
                            </Link>
                            <div className="text-[11px] text-stone-400 dark:text-stone-500">{report.session.interviewerName ? `Interviewer: ${report.session.interviewerName.split(" ")[0]}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 text-xs">{report.session.title ?? "Untitled interview"}</td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap">{formatDate(date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {report.scores.composite !== null ? (
                          <>
                            <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">{Math.round(report.scores.composite)}</span>
                            <span className="text-stone-400 text-[10px]">/100</span>
                          </>
                        ) : (
                          <span className="text-stone-400 text-xs" title="No overall score could be produced for this interview">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-900 dark:text-stone-100 font-medium text-xs whitespace-nowrap">{pct(report.scores.technical)}</td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap">{pct(report.scores.communication)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-stone-700 dark:text-stone-300">{report.scores.integrity === null ? "—" : Math.round(report.scores.integrity)}</span>
                          {b && <StatusBadge status={b} size="sm" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                            (reportStatus(report.scores, report.degraded) === "Ready"
                              ? "border-sage-200 bg-sage-50 text-sage-700 dark:border-sage-800 dark:bg-sage-950/40 dark:text-sage-400"
                              : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400")
                          }
                        >
                          {reportStatus(report.scores, report.degraded)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Link href={`/app/reports/${report.id}`}>
                          <button
                            type="button"
                            title={`View report for ${name}`}
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

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900/60 text-xs text-stone-500 dark:text-stone-400">
            <div>
              Showing{" "}
              <strong className="font-semibold text-stone-900 dark:text-stone-100">
                {first}–{last}
              </strong>
              {total !== null && (
                <>
                  {" "}
                  of <strong className="font-semibold text-stone-900 dark:text-stone-100">{total}</strong>
                </>
              )}{" "}
              reports
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
    </div>
  );
}
