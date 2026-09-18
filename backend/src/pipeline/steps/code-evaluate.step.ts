import { AUTHORSHIP_BURST_CHARS_PER_SEC, AUTHORSHIP_MIN_SOLUTION_CHARS } from "../../config/constants.js";
import type { TestResult } from "../../providers/sandbox/sandbox.provider.js";
import { prisma } from "../../utils/prisma.js";

export type CodeEvaluateOutput = { tasksEvaluated: number };

type EditorDeltaRow = {
  changeType: "TYPE" | "PASTE" | "AUTOCOMPLETE" | "UNDO";
  insertedChars: number;
  deletedChars: number;
  keystrokeStats: unknown;
  ts: Date;
};

function computeTypedRatio(deltas: EditorDeltaRow[]): number | null {
  let typed = 0;
  let total = 0;
  for (const d of deltas) {
    total = Math.max(0, total + d.insertedChars - d.deletedChars);
    if (d.changeType === "TYPE") typed += d.insertedChars;
  }
  if (total < AUTHORSHIP_MIN_SOLUTION_CHARS) return null;
  return Math.max(0, Math.min(1, typed / total));
}

/** Fraction of TYPE deltas whose char rate exceeded the same burst threshold the live authorship detector uses — a descriptive rate, not a re-run of live flag logic (Phases.md §10: "no integrity inference"). */
function computeBurstRate(deltas: EditorDeltaRow[]): number {
  const typed = deltas.filter((d) => d.changeType === "TYPE" && d.insertedChars > 0);
  if (typed.length === 0) return 0;
  let bursts = 0;
  for (const d of typed) {
    const stats = d.keystrokeStats as number[] | null;
    const durationSec = Array.isArray(stats) ? stats.reduce((sum, ms) => sum + ms, 0) / 1000 : null;
    if (durationSec && durationSec > 0 && d.insertedChars / durationSec > AUTHORSHIP_BURST_CHARS_PER_SEC) bursts++;
  }
  return bursts / typed.length;
}

function buildPasteMap(deltas: EditorDeltaRow[]) {
  return deltas
    .filter((d) => d.changeType === "PASTE")
    .map((d) => ({ ts: d.ts.toISOString(), insertedChars: d.insertedChars }));
}

function buildEditTimeline(deltas: EditorDeltaRow[]) {
  return deltas.map((d) => ({
    ts: d.ts.toISOString(),
    changeType: d.changeType,
    insertedChars: d.insertedChars,
    deletedChars: d.deletedChars,
  }));
}

/**
 * Descriptive coding-round metrics per task, read from what's already persisted (`EditorDelta`,
 * the SUBMIT `CodeExecution`'s `hiddenResults`) — no new sandbox run, no integrity inference
 * (Phases.md §10 is explicit: this step feeds `technical`, never `integrity`).
 */
export async function computeCodeEvaluate(sessionId: string): Promise<CodeEvaluateOutput> {
  const tasks = await prisma.sessionCodingTask.findMany({ where: { sessionId } });
  let evaluated = 0;

  for (const task of tasks) {
    const [deltas, submission] = await Promise.all([
      prisma.editorDelta.findMany({ where: { sessionTaskId: task.id }, orderBy: { ts: "asc" } }),
      prisma.codeExecution.findFirst({ where: { sessionTaskId: task.id, kind: "SUBMIT" }, orderBy: { createdAt: "desc" } }),
    ]);

    const hiddenResults = (submission?.hiddenResults as TestResult[] | null) ?? null;
    const hiddenPassed = hiddenResults?.filter((r) => r.passed).length ?? 0;
    const hiddenTotal = hiddenResults?.length ?? 0;

    await prisma.codeEvaluation.upsert({
      where: { sessionTaskId: task.id },
      create: {
        sessionTaskId: task.id,
        hiddenPassed,
        hiddenTotal,
        typedRatio: computeTypedRatio(deltas),
        burstRate: computeBurstRate(deltas),
        pasteMap: buildPasteMap(deltas),
        editTimeline: buildEditTimeline(deltas),
      },
      update: {
        hiddenPassed,
        hiddenTotal,
        typedRatio: computeTypedRatio(deltas),
        burstRate: computeBurstRate(deltas),
        pasteMap: buildPasteMap(deltas),
        editTimeline: buildEditTimeline(deltas),
      },
    });
    evaluated++;
  }

  return { tasksEvaluated: evaluated };
}
