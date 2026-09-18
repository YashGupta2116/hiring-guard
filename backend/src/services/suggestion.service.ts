import { SUGGESTION_BATCH_SIZE, SUGGESTION_LLM_TIMEOUT_MS } from "../config/constants.js";
import type { Difficulty } from "../generated/prisma/enums.js";
import { getLlm } from "../providers/index.js";
import type { SuggestedQuestion } from "../providers/llm/llm.provider.js";
import { emitToInterviewers } from "../sockets/emitter.js";
import { INTERVIEWER_EVENTS } from "../sockets/events.js";
import { AppError } from "../utils/app-error.js";
import { ulid } from "ulid";
import type { ParsedJD } from "../types/parsed-jd.js";
import { prisma } from "../utils/prisma.js";

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]).catch(() => null);
}

async function fallbackFromQuestionBank(orgId: string, difficulty: Difficulty): Promise<SuggestedQuestion[]> {
  const items = await prisma.questionBankItem.findMany({ where: { orgId, difficulty }, take: SUGGESTION_BATCH_SIZE });
  return items.map((item, index) => ({ rank: index + 1, text: item.text, rationale: "From the question bank (model unavailable).", topic: item.topic }));
}

/**
 * Manual trigger only (`POST .../suggestions/refresh`). Design.md/Phases.md also list automatic
 * triggers — topic change, answer end — but those need live topic tracking and ASR turn-detection that
 * don't exist yet (see Memory.md known issues); wiring them is a no-op until that infra lands.
 */
export async function refreshSuggestions(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const jd = await prisma.jobDescription.findUnique({ where: { sessionId } });
  const parsedJd = (jd?.parsed as ParsedJD | null) ?? null;
  const accepted = await prisma.questionSuggestion.findMany({ where: { sessionId, acceptedAt: { not: null } }, select: { topic: true } });
  const coveredTopics = accepted.map((s) => s.topic).filter((topic): topic is string => topic !== null);
  const difficulty: Difficulty = session.difficulty ?? "MEDIUM";

  const modelResult = await withTimeout(
    getLlm().suggestQuestions({ parsedJd, coveredTopics, currentTopic: null, transcriptTail: "", difficulty }),
    SUGGESTION_LLM_TIMEOUT_MS,
  );
  const items = modelResult ?? (await fallbackFromQuestionBank(orgId, difficulty));
  const source = modelResult ? "MODEL" : "QUESTION_BANK";

  const batchId = ulid();
  const rows = await prisma.$transaction(
    items.map((item) =>
      prisma.questionSuggestion.create({
        data: { sessionId, batchId, rank: item.rank, text: item.text, rationale: item.rationale, topic: item.topic, source },
      }),
    ),
  );

  const payload = {
    batchId,
    source,
    coverage: coveredTopics.map((topic) => ({ topic, covered: true })),
    items: rows.map((row) => ({ id: row.id, rank: row.rank, text: row.text, rationale: row.rationale, topic: row.topic })),
  };
  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.QS_SUGGESTIONS, payload);
  return payload;
}

export async function acceptSuggestion(orgId: string, sessionId: string, suggestionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  const suggestion = await prisma.questionSuggestion.findFirst({ where: { id: suggestionId, sessionId } });
  if (!suggestion) {
    throw new AppError("NOT_FOUND", "Suggestion not found.");
  }
  return prisma.questionSuggestion.update({ where: { id: suggestionId }, data: { acceptedAt: new Date(), acceptedById: userId } });
}
