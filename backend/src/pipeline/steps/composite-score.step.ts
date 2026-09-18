import type { IntegrityRescoreOutput } from "./integrity-rescore.step.js";
import type { PipelineStep } from "../../generated/prisma/enums.js";
import { prisma } from "../../utils/prisma.js";

export type CompositeScoreOutput = {
  technical: number | null;
  communication: number | null;
  integrity: number | null;
  composite: number | null;
  reviewRequired: boolean;
  flagCounts: { LOW: number; MEDIUM: number; HIGH: number };
};

const INTEGRITY_RESCORE: PipelineStep = "INTEGRITY_RESCORE";

/**
 * Architecture.md §6.9, verbatim — this formula is fixed and does not change without asking
 * (backend/CLAUDE.md: "ask me before... changing... the scoring formula"):
 *
 *   technical     = weighted mean of answer grades + code evaluation   (0-100)
 *   communication = structure + specificity dimensions                 (0-100)
 *   I = integrity_final
 *   if I >= 85:      M = 100
 *   if 70 <= I < 85:  M = 100 * (I - 70) / 15
 *   if I < 70:        composite = null, reviewRequired = true
 *   composite = 0.55 * technical + 0.20 * communication + 0.25 * M
 *
 * What "weighted mean" and "structure + specificity dimensions" mean in terms of the five
 * `AnswerGrade` dimensions is not specified beyond that — see docs/Memory.md's decisions log for
 * how this step reads it: `technical` averages the three dimensions Architecture.md's own split
 * leaves for it (correctness, depth, handsOn) once `communication` claims structure/specificity,
 * blended 50/50 with `CodeEvaluation`'s hidden-test pass rate when a coding round exists.
 */
export async function computeCompositeScore(sessionId: string, runId: string): Promise<CompositeScoreOutput> {
  const [grades, codeEvals, integrityStep, flags] = await Promise.all([
    prisma.answerGrade.findMany({ where: { qaPair: { sessionId } } }),
    prisma.codeEvaluation.findMany({ where: { sessionTask: { sessionId } } }),
    prisma.pipelineStepRun.findUnique({ where: { runId_step: { runId, step: INTEGRITY_RESCORE } } }),
    prisma.flag.findMany({ where: { sessionId }, select: { severity: true } }),
  ]);

  const gradeTechnical =
    grades.length > 0
      ? grades.reduce((sum, g) => sum + (g.correctness + g.depth + g.handsOn) / 3, 0) / grades.length
      : null;
  const communication =
    grades.length > 0 ? grades.reduce((sum, g) => sum + (g.structure + g.specificity) / 2, 0) / grades.length : null;

  const codeEvalsWithHidden = codeEvals.filter((c) => c.hiddenTotal > 0);
  const codeTechnical =
    codeEvalsWithHidden.length > 0
      ? (codeEvalsWithHidden.reduce((sum, c) => sum + c.hiddenPassed / c.hiddenTotal, 0) / codeEvalsWithHidden.length) * 100
      : null;

  const technical =
    gradeTechnical !== null && codeTechnical !== null
      ? 0.5 * gradeTechnical + 0.5 * codeTechnical
      : (gradeTechnical ?? codeTechnical);

  const integrityOutput = integrityStep?.status === "SUCCEEDED" ? (integrityStep.output as IntegrityRescoreOutput | null) : null;
  const integrity = integrityOutput?.integrityScore ?? null;

  // The formula's own branches only cover "integrity < 70"; a missing input (rescore failed, or a
  // pure coding round with no Q&A pairs to grade) isn't a case it names. Both end at the same
  // place the spec already defines for "we can't stand behind a number": composite = null,
  // reviewRequired = true — never a guessed or partial composite.
  let composite: number | null = null;
  let reviewRequired = true;
  if (integrity !== null && technical !== null && communication !== null && integrity >= 70) {
    const m = integrity >= 85 ? 100 : (100 * (integrity - 70)) / 15;
    composite = 0.55 * technical + 0.2 * communication + 0.25 * m;
    reviewRequired = false;
  }

  const flagCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const flag of flags) flagCounts[flag.severity]++;

  return { technical, communication, integrity, composite, reviewRequired, flagCounts };
}
