"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { candidateDisplayName, listCandidates, type DirectoryCandidate } from "@/lib/api/candidates";
import { listReports, type ReportListItem } from "@/lib/api/reports";
import { sessionCandidateName, sessionRef, sessionRole, type ApiSession } from "@/lib/api/sessions";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const PER_GROUP = 4;

type Remote = { query: string; candidates: DirectoryCandidate[]; reports: ReportListItem[]; error: string | null };

/** Searches candidates and reports on the server (they can be many) and interviews in the already-loaded list. */
export function GlobalSearch({ sessions }: { sessions: ApiSession[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Remote | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const term = query.trim();
  const active = term.length >= MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([listCandidates({ q: term, limit: PER_GROUP }), listReports({ q: term, limit: PER_GROUP })])
        .then(([c, r]) => {
          if (!cancelled) setRemote({ query: term, candidates: c.items, reports: r.items, error: null });
        })
        .catch((err: unknown) => {
          if (!cancelled) setRemote({ query: term, candidates: [], reports: [], error: err instanceof ApiError ? err.message : "Search failed." });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, active]);

  // Ctrl/Cmd+K focuses the box; a click outside closes the results.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const interviews = useMemo(() => {
    if (!active) return [];
    const needle = term.toLowerCase();
    return sessions
      .filter((s) =>
        [s.title, s.candidate?.name, s.candidate?.email, sessionRef(s.id)].some((v) => v && v.toLowerCase().includes(needle)),
      )
      .slice(0, PER_GROUP);
  }, [sessions, term, active]);

  const current = active && remote?.query === term ? remote : null;
  const searching = active && !current;
  const empty = current && !current.error && !current.candidates.length && !current.reports.length && !interviews.length;
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const groupTitle = "px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400";
  const item = "flex flex-col rounded-lg px-2.5 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors";

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
      <input
        ref={inputRef}
        type="text"
        aria-label="Search"
        placeholder="Search candidates, interviews, reports..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white/70 dark:bg-stone-900/60 pl-9 pr-14 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all shadow-2xs"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 select-none items-center gap-1 rounded border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 px-1.5 font-mono text-[10px] text-stone-500">
        Ctrl K
      </kbd>

      {open && term.length > 0 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1.5 shadow-xl">
          {!active && <p className="px-2.5 py-2 text-xs text-stone-500">Type at least {MIN_CHARS} characters.</p>}
          {searching && (
            <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-stone-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
            </p>
          )}
          {current?.error && <p className="px-2.5 py-2 text-xs text-red-600 dark:text-red-400">{current.error}</p>}
          {empty && <p className="px-2.5 py-2 text-xs text-stone-500">No matches for &ldquo;{term}&rdquo;.</p>}

          {current && current.candidates.length > 0 && (
            <div>
              <div className={groupTitle}>Candidates</div>
              {current.candidates.map((c) => (
                <Link key={c.id} href={`/app/candidates/${c.id}`} onClick={close} className={item}>
                  <span className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{candidateDisplayName(c)}</span>
                  <span className="text-[11px] text-stone-500 truncate">{c.appliedRole ?? c.email}</span>
                </Link>
              ))}
            </div>
          )}

          {interviews.length > 0 && (
            <div>
              <div className={groupTitle}>Interviews</div>
              {interviews.map((s) => (
                <Link key={s.id} href={`/app/interviews/${s.id}`} onClick={close} className={item}>
                  <span className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{sessionRole(s)}</span>
                  <span className="text-[11px] text-stone-500 truncate">
                    {sessionCandidateName(s)} • #{sessionRef(s.id)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {current && current.reports.length > 0 && (
            <div>
              <div className={groupTitle}>Reports</div>
              {current.reports.map((r) => (
                <Link key={r.id} href={`/app/reports/${r.id}`} onClick={close} className={item}>
                  <span className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                    {r.session.candidate ? (r.session.candidate.name?.trim() || r.session.candidate.email) : "No candidate"}
                  </span>
                  <span className="text-[11px] text-stone-500 truncate">{r.session.title?.trim() || "Untitled interview"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
