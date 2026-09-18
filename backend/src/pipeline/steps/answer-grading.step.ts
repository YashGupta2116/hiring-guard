import { getLlm } from "../../providers/index.js";
import type { ParsedJD } from "../../types/parsed-jd.js";
import { gradeResultSchema } from "../../validators/grade.schema.js";
import { prisma } from "../../utils/prisma.js";

export type AnswerGradingOutput = { pairsGraded: number };

/**
 * Grades every Q&A pair `TranscriptFinalize` produced, via `llm.grade()` (mock today, Phase 10's
 * scope note; a real provider slots in behind the same interface later). Every result goes
 * through `gradeResultSchema` first — rubric validation, so a provider that ever returns a
 * forbidden dimension fails loudly here rather than reaching a report. Idempotent per pair
 * (`upsert` on `qaPairId`), so a retry re-grades rather than duplicating.
 */
export async function computeAnswerGrading(sessionId: string): Promise<AnswerGradingOutput> {
  const [pairs, jd] = await Promise.all([
    prisma.qAPair.findMany({ where: { sessionId }, orderBy: { position: "asc" } }),
    prisma.jobDescription.findUnique({ where: { sessionId } }),
  ]);
  const parsedJd = (jd?.parsed as ParsedJD | null) ?? null;

  let graded = 0;
  for (const pair of pairs) {
    const raw = await getLlm().gradeAnswer({
      question: pair.questionText,
      answer: pair.answerText,
      topic: pair.topic,
      parsedJd,
    });
    const result = gradeResultSchema.parse(raw);

    // AnswerGrade.positiveSignals is "timestamped like flags" (schema.prisma comment); the grade
    // interface has no finer-grained timing than the pair itself, so each strength is anchored at
    // the answer's own end offset rather than left without a timestamp.
    const positiveSignals = result.strengths.map((text) => ({ text, ts: pair.answerEndMs }));

    await prisma.answerGrade.upsert({
      where: { qaPairId: pair.id },
      create: {
        qaPairId: pair.id,
        correctness: result.correctness,
        depth: result.depth,
        specificity: result.specificity,
        structure: result.structure,
        handsOn: result.handsOn,
        strengths: result.strengths,
        concerns: result.concerns,
        positiveSignals,
      },
      update: {
        correctness: result.correctness,
        depth: result.depth,
        specificity: result.specificity,
        structure: result.structure,
        handsOn: result.handsOn,
        strengths: result.strengths,
        concerns: result.concerns,
        positiveSignals,
      },
    });
    graded++;
  }

  return { pairsGraded: graded };
}
