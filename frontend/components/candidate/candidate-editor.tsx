"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { Code, Lock, Play, Send, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import {
  runCandidateTask,
  submitCandidateTask,
  type CandidateTask,
  type RunResult,
  type TestResult,
} from "@/lib/candidate/api";
import { EDITOR_ROOT_ATTR, type EditorSync, type TelemetryReporter } from "@/lib/candidate/telemetry";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const MONACO_LANGUAGE: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  cpp: "cpp",
  go: "go",
  rust: "rust",
};

interface CandidateEditorProps {
  task: CandidateTask;
  candidateToken: string;
  telemetry: TelemetryReporter | null;
  editorSync: EditorSync | null;
  /** True while an interrupting warning is unacknowledged: the candidate can read but not edit. */
  locked: boolean;
  frozen: boolean;
  onSubmitted: (taskId: string) => void;
  /** Lets the room read the current content for the periodic snapshot. */
  registerSnapshot: (taskId: string, get: () => { language: string; content: string }) => void;
}

function starterFor(task: CandidateTask, language: string): string {
  return task.starterCode?.[language] ?? `// ${task.title}\n`;
}

function ResultLines({ results, runner }: { results: TestResult[]; runner: string }) {
  return (
    <div className="space-y-1">
      {runner === "mock" && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          Demo runner: this environment does not execute code, so these results are not a real evaluation of your solution.
        </div>
      )}
      {results.map((r) => (
        <div key={r.index} className="text-[11px]">
          <span className={r.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {r.passed ? "✓ Passed" : "✗ Failed"}
          </span>{" "}
          <span className="text-foreground">Test {r.index + 1}</span>
          {!r.passed && (
            <span className="text-muted-foreground">
              {" "}
              — expected {JSON.stringify(r.expectedOutput)}, got {JSON.stringify(r.actualOutput)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CandidateEditor({ task, candidateToken, telemetry, editorSync, locked, frozen, onSubmitted, registerSnapshot }: CandidateEditorProps) {
  const { toast } = useToast();
  const [language, setLanguage] = useState(task.languages[0] ?? "javascript");
  const codeByLanguage = useRef<Record<string, string>>({});
  const pasteUntil = useRef(0);
  const languageRef = useRef(language);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [output, setOutput] = useState<{ kind: "run" | "submit"; result: RunResult | { results: TestResult[]; runner: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Monaco callbacks are registered once on mount, so they read the latest values through refs.
  const telemetryRef = useRef(telemetry);
  const editorSyncRef = useRef(editorSync);
  useEffect(() => {
    languageRef.current = language;
    telemetryRef.current = telemetry;
    editorSyncRef.current = editorSync;
  }, [language, telemetry, editorSync]);

  const currentCode = useCallback((): string => {
    return codeByLanguage.current[language] ?? starterFor(task, language);
  }, [language, task]);

  useEffect(() => {
    registerSnapshot(task.taskId, () => ({ language: languageRef.current, content: codeByLanguage.current[languageRef.current] ?? starterFor(task, languageRef.current) }));
  }, [registerSnapshot, task]);

  const handleMount: OnMount = (editor, monaco) => {
    editor.onKeyDown((e) => telemetryRef.current?.recordKeystroke(e.keyCode === monaco.KeyCode.Backspace));

    editor.onDidChangeModelContent((e) => {
      const isPaste = Date.now() < pasteUntil.current;
      for (const change of e.changes) {
        const inserted = change.text.length;
        editorSyncRef.current?.push(task.taskId, {
          changeType: e.isUndoing ? "UNDO" : isPaste && inserted > 1 ? "PASTE" : inserted > 1 ? "AUTOCOMPLETE" : "TYPE",
          rangeOffset: change.rangeOffset,
          insertedChars: inserted,
          deletedChars: change.rangeLength,
          // Only pasted content is sent as text; ordinary typing never leaves the browser as content.
          ...(isPaste && inserted > 1 ? { text: change.text.slice(0, 10_000) } : {}),
          ts: Date.now(),
        });
      }
    });
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await runCandidateTask(candidateToken, task.taskId, { language, code: currentCode() });
      setOutput({ kind: "run", result });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "RATE_LIMITED" ? "Please wait a few seconds between runs." : err instanceof ApiError ? err.message : "Could not run your code.");
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitCandidateTask(candidateToken, task.taskId, { language, code: currentCode() });
      setOutput({ kind: "submit", result: { results: result.visibleResults, runner: result.runner } });
      onSubmitted(task.taskId);
      toast({ title: "Solution submitted", description: "Your answer is locked and has been sent to the interviewer.", type: "success" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your solution.");
    } finally {
      setSubmitting(false);
    }
  };

  const readOnly = frozen || locked;

  return (
    <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border bg-secondary/30 text-xs">
        <div className="flex items-center gap-2">
          <Code className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-foreground">Solution Editor</span>
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={frozen}
            className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none"
          >
            {task.languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {frozen && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Submitted
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={handleRun} isLoading={running} disabled={readOnly} className="h-6.5 px-3 text-xs">
            <Play className="h-3 w-3 mr-1 fill-current" /> Run Code
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmSubmit(true)} disabled={readOnly} isLoading={submitting} className="h-6.5 px-3 text-xs">
            <Send className="h-3 w-3 mr-1" /> Submit
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-[260px] bg-[#18181b]" {...{ [EDITOR_ROOT_ATTR]: "true" }} onPasteCapture={() => (pasteUntil.current = Date.now() + 400)}>
        <Editor
          height="100%"
          theme="vs-dark"
          path={`${task.taskId}.${language}`}
          language={MONACO_LANGUAGE[language] ?? "plaintext"}
          defaultValue={codeByLanguage.current[language] ?? starterFor(task, language)}
          onChange={(value) => {
            codeByLanguage.current[language] = value ?? "";
          }}
          onMount={handleMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            contextmenu: false,
            dragAndDrop: false,
            dropIntoEditor: { enabled: false },
            copyWithSyntaxHighlighting: false,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        />
      </div>

      <div className="h-36 border-t border-border bg-card p-2.5 font-mono text-xs overflow-y-auto space-y-1">
        <div className="text-[10px] font-semibold text-muted-foreground pb-1 flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> {output?.kind === "submit" ? "Submission results" : "Test Execution Output"}
        </div>
        {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}
        {!output && !error && <span className="text-muted-foreground text-[11px] italic">Press &quot;Run Code&quot; to run the visible tests.</span>}
        {output && <ResultLines results={output.result.results} runner={output.result.runner} />}
        {output?.kind === "run" && "stderr" in output.result && output.result.stderr && (
          <pre className="text-[11px] text-red-600 dark:text-red-400 whitespace-pre-wrap">{output.result.stderr}</pre>
        )}
        {output?.kind === "run" && "stdout" in output.result && output.result.stdout && (
          <pre className="text-[11px] text-foreground whitespace-pre-wrap">{output.result.stdout}</pre>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit this solution?"
        description="Once you submit, this task is locked and you can't edit it again."
        confirmText="Submit solution"
        onConfirm={handleSubmit}
      />
    </div>
  );
}
