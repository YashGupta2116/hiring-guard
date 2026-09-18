import type { ParsedJD } from "../../types/parsed-jd.js";
import { prisma } from "../../utils/prisma.js";

/** A candidate turn this short, on its own, doesn't open a new Q&A pair — Phases.md §10: "back-channel turns don't open a pair". */
const BACK_CHANNEL_PATTERN = /^(mm+-?h?m+|uh+-?h?uh+|yeah|yep|yup|okay|ok|right|sure|got it|i see|makes sense)[.,!?]?$/i;
const BACK_CHANNEL_MAX_WORDS = 3;

function isBackChannel(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  const words = trimmed.split(/\s+/);
  return words.length <= BACK_CHANNEL_MAX_WORDS && BACK_CHANNEL_PATTERN.test(trimmed);
}

/** Cheap keyword match against the JD's own topic/skill list — a mock, same spirit as `MockLlmProvider`. */
function guessTopic(text: string, parsedJd: ParsedJD | null): string | null {
  if (!parsedJd) return null;
  const lower = text.toLowerCase();
  let best: { name: string; hits: number } | null = null;
  for (const topic of parsedJd.topics) {
    const hits = topic.skills.reduce((count, skill) => (lower.includes(skill.toLowerCase()) ? count + 1 : count), 0);
    if (hits > 0 && (!best || hits > best.hits)) best = { name: topic.name, hits };
  }
  return best?.name ?? null;
}

export type TranscriptFinalizeOutput = { pairCount: number; segmentsConsidered: number };

/**
 * Pairs the final transcript into Q&A (Phases.md §10). Superseded partials (`supersededAt` set —
 * a later `isFinal` segment replacing an earlier ASR guess) are excluded; only `isFinal` segments
 * are evidence. An INTERVIEWER turn opens a pending question; the next non-back-channel CANDIDATE
 * turn (consecutive CANDIDATE segments concatenated) closes it as the answer. Idempotent: replaces
 * this session's QAPair rows outright, so a pipeline retry doesn't duplicate them.
 */
export async function computeTranscriptFinalize(sessionId: string): Promise<TranscriptFinalizeOutput> {
  const [segments, jd] = await Promise.all([
    prisma.transcriptSegment.findMany({
      where: { sessionId, isFinal: true, supersededAt: null },
      orderBy: { startMs: "asc" },
    }),
    prisma.jobDescription.findUnique({ where: { sessionId } }),
  ]);
  const parsedJd = (jd?.parsed as ParsedJD | null) ?? null;

  type Pending = { questionText: string; questionStartMs: number; answerParts: string[]; answerEndMs: number };
  let pending: Pending | null = null;
  const pairs: { questionText: string; answerText: string; topic: string | null; questionStartMs: number; answerEndMs: number }[] = [];

  const closePending = () => {
    if (pending && pending.answerParts.length > 0) {
      const answerText = pending.answerParts.join(" ");
      pairs.push({
        questionText: pending.questionText,
        answerText,
        topic: guessTopic(`${pending.questionText} ${answerText}`, parsedJd),
        questionStartMs: pending.questionStartMs,
        answerEndMs: pending.answerEndMs,
      });
    }
    pending = null;
  };

  for (const segment of segments) {
    if (segment.speaker === "INTERVIEWER") {
      closePending();
      pending = { questionText: segment.text, questionStartMs: segment.startMs, answerParts: [], answerEndMs: segment.endMs };
    } else if (segment.speaker === "CANDIDATE" && pending) {
      if (pending.answerParts.length === 0 && isBackChannel(segment.text)) continue; // back-channel before any real answer: ignore
      pending.answerParts.push(segment.text);
      pending.answerEndMs = segment.endMs;
    }
    // UNKNOWN speaker turns never open or close a pair.
  }
  closePending();

  await prisma.$transaction([
    prisma.qAPair.deleteMany({ where: { sessionId } }),
    ...pairs.map((pair, index) =>
      prisma.qAPair.create({
        data: { sessionId, position: index, ...pair },
      }),
    ),
  ]);

  return { pairCount: pairs.length, segmentsConsidered: segments.length };
}
