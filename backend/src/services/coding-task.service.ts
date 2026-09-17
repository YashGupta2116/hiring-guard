import type { Difficulty } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export type CreateCodingTaskInput = {
  title: string;
  statement: string;
  difficulty: Difficulty;
  languages: string[];
  starterCode?: Record<string, string>;
  visibleTests: { input: string; expectedOutput: string }[];
  hiddenTests: { input: string; expectedOutput: string }[];
  timeLimitMs: number;
};

export type UpdateCodingTaskInput = Partial<CreateCodingTaskInput>;

const LIST_SELECT = {
  id: true,
  title: true,
  statement: true,
  difficulty: true,
  languages: true,
  starterCode: true,
  visibleTests: true,
  timeLimitMs: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listCodingTasks(orgId: string, opts: { limit: number; cursor?: string }) {
  const tasks = await prisma.codingTask.findMany({
    where: { orgId },
    select: LIST_SELECT,
    orderBy: { id: "asc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = tasks.length > opts.limit;
  const items = hasMore ? tasks.slice(0, opts.limit) : tasks;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function getCodingTask(orgId: string, id: string, includeHidden: boolean) {
  const task = await prisma.codingTask.findFirst({ where: { id, orgId } });
  if (!task) {
    throw new AppError("NOT_FOUND", "Coding task not found.");
  }
  if (includeHidden) {
    return task;
  }
  const { hiddenTests: _hiddenTests, ...rest } = task;
  return rest;
}

export async function createCodingTask(orgId: string, input: CreateCodingTaskInput) {
  return prisma.codingTask.create({ data: { orgId, ...input } });
}

export async function updateCodingTask(orgId: string, id: string, patch: UpdateCodingTaskInput) {
  const existing = await prisma.codingTask.findFirst({ where: { id, orgId } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Coding task not found.");
  }
  return prisma.codingTask.update({ where: { id }, data: patch });
}

export async function deleteCodingTask(orgId: string, id: string): Promise<void> {
  const existing = await prisma.codingTask.findFirst({ where: { id, orgId } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Coding task not found.");
  }
  const attached = await prisma.sessionCodingTask.count({ where: { taskId: id } });
  if (attached > 0) {
    throw new AppError("CONFLICT", "Cannot delete a coding task that is attached to a session.");
  }
  await prisma.codingTask.delete({ where: { id } });
}
