"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Search, Plus, Clock, Code, Trash2, Pencil, Calendar, CheckCircle2, EyeOff, X, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CodingTaskModal } from "@/components/questions/coding-task-modal";
import { QuestionModal } from "@/components/questions/question-modal";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { deleteCodingTask, DIFFICULTIES, difficultyLabel, listCodingTasks, type CodingTaskSummary, type DifficultyCode } from "@/lib/api/coding-tasks";
import { deleteQuestion, listQuestions, type BankQuestion } from "@/lib/api/question-bank";
import { cn } from "@/lib/utils";

type Tab = "tasks" | "questions";

const DIFFICULTY_STYLES: Record<DifficultyCode, { border: string; dot: string }> = {
  EASY: { border: "border-l-sage-500", dot: "bg-sage-500" },
  MEDIUM: { border: "border-l-amber-500", dot: "bg-amber-500" },
  HARD: { border: "border-l-terra-500", dot: "bg-terra-500" },
};

type Data = { tasks: CodingTaskSummary[]; questions: BankQuestion[]; questionsTruncated: boolean };
type Pending = { kind: Tab; id: string; label: string };

export default function QuestionsPage() {
  const { canManageSettings: canEdit, canCreateInterview } = usePermissions();
  const { toast } = useToast();

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<Tab>("tasks");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyCode | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [taskModal, setTaskModal] = useState<{ open: boolean; task: CodingTaskSummary | null }>({ open: false, task: null });
  const [questionModal, setQuestionModal] = useState<{ open: boolean; question: BankQuestion | null }>({ open: false, question: null });
  const [scheduleTask, setScheduleTask] = useState<CodingTaskSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Pending | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCodingTasks(), listQuestions()])
      .then(([tasks, questions]) => {
        if (!cancelled) setData({ tasks, questions: questions.items, questionsTruncated: questions.truncated });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "The server could not be reached.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const needle = searchQuery.trim().toLowerCase();
  const matchesDifficulty = (d: DifficultyCode) => difficultyFilter === "all" || d === difficultyFilter;

  const tasks = (data?.tasks ?? []).filter(
    (t) => matchesDifficulty(t.difficulty) && (!needle || t.title.toLowerCase().includes(needle) || t.statement.toLowerCase().includes(needle) || t.languages.some((l) => l.toLowerCase().includes(needle))),
  );
  const questions = (data?.questions ?? []).filter(
    (q) => matchesDifficulty(q.difficulty) && (!needle || q.text.toLowerCase().includes(needle) || q.topic.toLowerCase().includes(needle) || q.skills.some((s) => s.toLowerCase().includes(needle))),
  );

  const hasActiveFilters = difficultyFilter !== "all" || needle !== "";
  const clearFilters = () => {
    setDifficultyFilter("all");
    setSearchQuery("");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.kind === "tasks") await deleteCodingTask(pendingDelete.id);
      else await deleteQuestion(pendingDelete.id);
      toast({ title: "Deleted", description: `"${pendingDelete.label}" was removed.`, type: "info" });
      setPendingDelete(null);
      reload();
    } catch (err) {
      // e.g. a coding task that is attached to a session cannot be deleted
      toast({ title: "Could not delete", description: err instanceof ApiError ? err.message : "The request failed.", type: "error" });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const openCreate = () => (tab === "tasks" ? setTaskModal({ open: true, task: null }) : setQuestionModal({ open: true, question: null }));
  const total = tab === "tasks" ? (data?.tasks.length ?? 0) : (data?.questions.length ?? 0);
  const shown = tab === "tasks" ? tasks.length : questions.length;

  const tabButton = (value: Tab, label: string, count: number | undefined) => (
    <button
      key={value}
      onClick={() => setTab(value)}
      className={cn("relative py-2.5 text-xs font-medium whitespace-nowrap transition-colors", tab === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 text-[10px] text-muted-foreground">{count}</span>}
      {tab === value && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-foreground" />}
    </button>
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link href="/app/dashboard" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Question Bank</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Question Bank</h1>
          <p className="text-xs text-neutral-500 mt-1">Coding tasks candidates solve in the editor, and interview questions for the panel.</p>
        </div>

        {canEdit && (
          <Button onClick={openCreate} className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs h-9">
            <Plus className="h-3.5 w-3.5" /> {tab === "tasks" ? "New coding task" : "Add question"}
          </Button>
        )}
      </div>

      <div className="border-b border-border flex items-center gap-5 overflow-x-auto">
        {tabButton("tasks", "Coding tasks", data?.tasks.length)}
        {tabButton("questions", "Interview questions", data?.questions.length)}
      </div>

      {!canEdit && data && <p className="text-[11px] text-muted-foreground">Only owners and admins can add, edit or delete items here.</p>}

      {data && error && <ErrorState className="min-h-0 p-4" title="Could not refresh" description={error} onRetry={reload} />}

      {!data ? (
        error ? (
          <ErrorState title="Could not load the question bank" description={error} onRetry={reload} />
        ) : (
          <LoadingState variant="cards" rows={4} />
        )
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                aria-label="Search"
                placeholder={tab === "tasks" ? "Search coding tasks..." : "Search questions, topics, skills..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background/60 pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" title="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDifficultyFilter("all")}
                className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors", difficultyFilter === "all" ? "border-foreground/30 text-foreground bg-secondary" : "border-transparent text-muted-foreground hover:bg-secondary/50")}
              >
                All
              </button>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.code}
                  onClick={() => setDifficultyFilter(d.code)}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors", difficultyFilter === d.code ? "border-foreground/30 text-foreground bg-secondary" : "border-transparent text-muted-foreground hover:bg-secondary/50")}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", DIFFICULTY_STYLES[d.code].dot)} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between -mt-2">
              <span className="text-[11px] text-muted-foreground">
                {shown} {tab === "tasks" ? "coding task" : "question"}
                {shown !== 1 ? "s" : ""} found
              </span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                  Clear filters
                </button>
              )}
            </div>
          )}
          {tab === "questions" && data.questionsTruncated && <p className="text-xs text-amber-700 dark:text-amber-400">Showing the first 1,000 questions only.</p>}
          {tab === "tasks" && total > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Test cases are stored with each task, but the sandbox in this environment does not execute code; every run is reported as a mock result.
            </p>
          )}

          {shown === 0 ? (
            total === 0 ? (
              <EmptyState
                icon={tab === "tasks" ? Code : HelpCircle}
                title={tab === "tasks" ? "No coding tasks yet" : "No questions yet"}
                description={
                  tab === "tasks"
                    ? "Coding tasks appear in the scheduler, so candidates get a problem to solve in the editor."
                    : "Questions here back the live interview suggestions when the suggestion model is unavailable."
                }
                actionLabel={canEdit ? (tab === "tasks" ? "New coding task" : "Add question") : undefined}
                onAction={canEdit ? openCreate : undefined}
              />
            ) : (
              <EmptyState icon={HelpCircle} title="Nothing matches" description="Try broadening the search or difficulty filter." actionLabel="Clear filters" onAction={clearFilters} />
            )
          ) : tab === "tasks" ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {tasks.map((t) => (
                <div key={t.id} className={cn("rounded-lg border border-border border-l-4 bg-card p-5 flex flex-col justify-between transition-colors hover:border-foreground/20", DIFFICULTY_STYLES[t.difficulty].border)}>
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <StatusBadge status={difficultyLabel(t.difficulty)} size="sm" />
                        <span className="font-mono text-[11px] text-muted-foreground">{"// " + t.languages.join(", ")}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono shrink-0" title="Time limit per run">
                        <Clock className="h-3.5 w-3.5" /> {t.timeLimitMs / 1000}s/run
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground leading-snug mt-3">{t.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mt-1.5 whitespace-pre-line">{t.statement}</p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                      {t.starterCode && Object.keys(t.starterCode).length > 0 && (
                        <span className="flex items-center gap-1.5 font-mono">
                          <Code className="h-3.5 w-3.5" /> Starter code
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" /> {t.visibleTests.length} visible
                      </span>
                      {canEdit && (
                        <span className="flex items-center gap-1.5 font-mono" title="Hidden tests are only visible to admins">
                          <EyeOff className="h-3.5 w-3.5" /> hidden
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setScheduleTask(t)} disabled={!canCreateInterview} className="h-7 text-xs px-3 gap-1.5">
                        <Calendar className="h-3.5 w-3.5" /> Use
                      </Button>
                      {canEdit && (
                        <>
                          <button onClick={() => setTaskModal({ open: true, task: t })} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setPendingDelete({ kind: "tasks", id: t.id, label: t.title })} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {questions.map((q) => (
                <div key={q.id} className={cn("rounded-lg border border-border border-l-4 bg-card p-5 flex flex-col justify-between transition-colors hover:border-foreground/20", DIFFICULTY_STYLES[q.difficulty].border)}>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <StatusBadge status={difficultyLabel(q.difficulty)} size="sm" />
                      <span className="font-mono text-[11px] text-muted-foreground">{"// " + q.topic}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed mt-3 whitespace-pre-line">{q.text}</p>
                    {q.skills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                        {q.skills.map((s) => (
                          <span key={s} className="bg-secondary text-foreground px-2.5 py-1 rounded-md text-[11px] font-medium border border-border/60">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-end gap-1.5">
                      <button onClick={() => setQuestionModal({ open: true, question: q })} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setPendingDelete({ kind: "questions", id: q.id, label: q.topic })} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <CodingTaskModal key={taskModal.task?.id ?? "new-task"} open={taskModal.open} onOpenChange={(open) => setTaskModal((s) => ({ ...s, open }))} task={taskModal.task} onSaved={reload} />
      <QuestionModal open={questionModal.open} onOpenChange={(open) => setQuestionModal((s) => ({ ...s, open }))} question={questionModal.question} onSaved={reload} />
      {scheduleTask && <ScheduleModal key={scheduleTask.id} open onOpenChange={(open) => !open && setScheduleTask(null)} defaultTaskId={scheduleTask.id} />}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
        title="Delete this item?"
        description={pendingDelete ? `"${pendingDelete.label}" will be removed from your bank. This cannot be undone.` : ""}
        confirmText="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
