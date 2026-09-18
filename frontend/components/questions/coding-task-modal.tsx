"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { LoadingState } from "../ui/loading-state";
import { ErrorState } from "../ui/error-state";
import { useToast } from "../ui/toast";
import { ApiError } from "@/lib/api/client";
import {
  createCodingTask,
  DIFFICULTIES,
  getCodingTask,
  TASK_LANGUAGES,
  updateCodingTask,
  type CodingTaskDetail,
  type CodingTaskInput,
  type CodingTaskSummary,
  type DifficultyCode,
  type TestCase,
} from "@/lib/api/coding-tasks";

interface CodingTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates a new task; a task edits it (its hidden tests are fetched, admins only). */
  task: CodingTaskSummary | null;
  onSaved: () => void;
}

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 transition-colors";
const labelClass = "text-xs font-semibold text-foreground";
const mono = "font-mono text-xs";

function TestList({
  title,
  hint,
  tests,
  onChange,
}: {
  title: string;
  hint: string;
  tests: TestCase[];
  onChange: (tests: TestCase[]) => void;
}) {
  const update = (i: number, patch: Partial<TestCase>) => onChange(tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className={labelClass}>{title}</div>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...tests, { input: "", expectedOutput: "" }])}
          disabled={tests.length >= 50}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {tests.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
          <textarea
            aria-label={`${title} ${i + 1} input`}
            rows={2}
            value={t.input}
            onChange={(e) => update(i, { input: e.target.value })}
            placeholder="stdin"
            className={`${field} ${mono}`}
          />
          <textarea
            aria-label={`${title} ${i + 1} expected output`}
            rows={2}
            value={t.expectedOutput}
            onChange={(e) => update(i, { expectedOutput: e.target.value })}
            placeholder="expected stdout"
            className={`${field} ${mono}`}
          />
          <button
            type="button"
            onClick={() => onChange(tests.filter((_, idx) => idx !== i))}
            disabled={tests.length <= 1}
            title={tests.length <= 1 ? "At least one test is required" : "Remove test"}
            className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TaskForm({ initial, editingId, onDone, onCancel }: { initial: CodingTaskDetail | null; editingId: string | null; onDone: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [difficulty, setDifficulty] = useState<DifficultyCode>(initial?.difficulty ?? "MEDIUM");
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? ["python"]);
  const [timeLimitMs, setTimeLimitMs] = useState(String(initial?.timeLimitMs ?? 5000));
  const [starter, setStarter] = useState<Record<string, string>>(initial?.starterCode ?? {});
  const [visible, setVisible] = useState<TestCase[]>(initial?.visibleTests?.length ? initial.visibleTests : [{ input: "", expectedOutput: "" }]);
  const [hidden, setHidden] = useState<TestCase[]>(initial?.hiddenTests?.length ? initial.hiddenTests : [{ input: "", expectedOutput: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLanguage = (code: string) => setLanguages((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (languages.length === 0) {
      setError("Pick at least one language.");
      return;
    }
    const limit = Number(timeLimitMs);
    if (!Number.isInteger(limit) || limit < 500 || limit > 60_000) {
      setError("The time limit must be a whole number between 500 and 60000 ms.");
      return;
    }
    const starterCode: Record<string, string> = {};
    for (const lang of languages) if (starter[lang]?.trim()) starterCode[lang] = starter[lang];

    const payload: CodingTaskInput = {
      title: title.trim(),
      statement: statement.trim(),
      difficulty,
      languages,
      starterCode,
      visibleTests: visible,
      hiddenTests: hidden,
      timeLimitMs: limit,
    };
    setSaving(true);
    try {
      if (editingId) await updateCodingTask(editingId, payload);
      else await createCodingTask(payload);
      toast({ title: editingId ? "Coding task updated" : "Coding task created", description: `"${payload.title}" saved.`, type: "success" });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="task-title">Title</label>
          <input id="task-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Two Sum" />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="task-statement">Problem statement</label>
          <textarea id="task-statement" required rows={5} maxLength={20000} value={statement} onChange={(e) => setStatement(e.target.value)} className={field} placeholder="Describe the problem, input format and output format." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="task-difficulty">Difficulty</label>
            <select id="task-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as DifficultyCode)} className={field}>
              {DIFFICULTIES.map((d) => (
                <option key={d.code} value={d.code}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="task-limit">Time limit per run (ms)</label>
            <input id="task-limit" type="number" min={500} max={60000} value={timeLimitMs} onChange={(e) => setTimeLimitMs(e.target.value)} className={field} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className={labelClass}>Languages</div>
          <div className="flex flex-wrap gap-3">
            {TASK_LANGUAGES.map((l) => (
              <label key={l.code} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={languages.includes(l.code)} onChange={() => toggleLanguage(l.code)} />
                {l.label}
              </label>
            ))}
          </div>
        </div>

        {languages.map((lang) => (
          <div key={lang} className="space-y-1.5">
            <label className={labelClass} htmlFor={`starter-${lang}`}>Starter code ({lang}, optional)</label>
            <textarea id={`starter-${lang}`} rows={4} value={starter[lang] ?? ""} onChange={(e) => setStarter((s) => ({ ...s, [lang]: e.target.value }))} className={`${field} ${mono}`} />
          </div>
        ))}

        <TestList title="Visible tests" hint="Shown to the candidate when they run their code." tests={visible} onChange={setVisible} />
        <TestList title="Hidden tests" hint="Only used when the candidate submits; never sent to them." tests={hidden} onChange={setHidden} />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border shrink-0">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? "Saving..." : editingId ? "Save changes" : "Create task"}
        </button>
      </div>
    </form>
  );
}

export function CodingTaskModal({ open, onOpenChange, task, onSaved }: CodingTaskModalProps) {
  const editingId = task?.id ?? null;
  const [detail, setDetail] = useState<{ id: string; data: CodingTaskDetail } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !editingId) return;
    let cancelled = false;
    getCodingTask(editingId)
      .then((data) => {
        if (!cancelled) setDetail({ id: editingId, data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Could not load the task.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, editingId, attempt]);

  const loaded = editingId ? (detail?.id === editingId ? detail.data : null) : null;
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editingId ? "Edit coding task" : "New coding task"}</DialogTitle>
        <DialogDescription>
          A problem candidates solve in the code editor. Tests compare the program&apos;s stdout with the expected output.
        </DialogDescription>
      </DialogHeader>
      {editingId && !loaded ? (
        loadError ? (
          <ErrorState
            title="Could not load the task"
            description={loadError}
            onRetry={() => {
              setLoadError(null);
              setAttempt((a) => a + 1);
            }}
          />
        ) : (
          <LoadingState variant="detail" />
        )
      ) : (
        <TaskForm
          key={editingId ?? "new"}
          initial={loaded}
          editingId={editingId}
          onCancel={close}
          onDone={() => {
            onSaved();
            close();
          }}
        />
      )}
    </Dialog>
  );
}
