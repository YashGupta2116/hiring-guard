import type { Difficulty } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export type CreateQuestionInput = { text: string; topic: string; skills: string[]; difficulty: Difficulty };
export type UpdateQuestionInput = Partial<CreateQuestionInput>;

export async function listQuestions(orgId: string, opts: { topic?: string; difficulty?: Difficulty; limit: number; cursor?: string }) {
  const items = await prisma.questionBankItem.findMany({
    where: { orgId, ...(opts.topic ? { topic: opts.topic } : {}), ...(opts.difficulty ? { difficulty: opts.difficulty } : {}) },
    orderBy: { id: "asc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > opts.limit;
  const page = hasMore ? items.slice(0, opts.limit) : items;
  return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export async function getQuestion(orgId: string, id: string) {
  const question = await prisma.questionBankItem.findFirst({ where: { id, orgId } });
  if (!question) {
    throw new AppError("NOT_FOUND", "Question not found.");
  }
  return question;
}

export async function createQuestion(orgId: string, input: CreateQuestionInput) {
  return prisma.questionBankItem.create({ data: { orgId, ...input } });
}

export async function updateQuestion(orgId: string, id: string, patch: UpdateQuestionInput) {
  await getQuestion(orgId, id);
  return prisma.questionBankItem.update({ where: { id }, data: patch });
}

export async function deleteQuestion(orgId: string, id: string): Promise<void> {
  await getQuestion(orgId, id);
  await prisma.questionBankItem.delete({ where: { id } });
}
