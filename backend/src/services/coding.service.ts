import { registry } from "../live/registry.js";
import { getSandbox } from "../providers/index.js";
import type { TestCase } from "../providers/sandbox/sandbox.provider.js";
import { emitToCandidate } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS } from "../sockets/events.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export type RunSubmitInput = { language: string; code: string };

export async function getCandidateTasks(sessionId: string) {
  const tasks = await prisma.sessionCodingTask.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    include: { task: true },
  });

  return tasks.map(({ task, ...sessionTask }) => ({
    taskId: sessionTask.id,
    title: task.title,
    statement: task.statement,
    languages: task.languages,
    starterCode: task.starterCode,
    visibleTests: task.visibleTests,
    frozen: sessionTask.submittedAt !== null,
  }));
}

async function loadOwnedSessionTask(sessionId: string, sessionTaskId: string) {
  const sessionTask = await prisma.sessionCodingTask.findFirst({
    where: { id: sessionTaskId, sessionId },
    include: { task: true },
  });
  if (!sessionTask) {
    throw new AppError("NOT_FOUND", "Coding task not found for this session.");
  }
  return sessionTask;
}

export async function runTask(sessionId: string, sessionTaskId: string, input: RunSubmitInput) {
  const sessionTask = await loadOwnedSessionTask(sessionId, sessionTaskId);
  if (sessionTask.submittedAt) {
    throw new AppError("TASK_FROZEN", "This task has already been submitted.");
  }

  const result = await getSandbox().execute({
    language: input.language,
    code: input.code,
    tests: sessionTask.task.visibleTests as unknown as TestCase[],
    timeLimitMs: sessionTask.task.timeLimitMs,
  });

  const execution = await prisma.codeExecution.create({
    data: {
      sessionId,
      sessionTaskId,
      kind: "RUN",
      status: result.status,
      language: input.language,
      code: input.code,
      visibleResults: result.results,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      finishedAt: new Date(),
    },
  });
  await prisma.codeSnapshot.create({
    data: { sessionId, sessionTaskId, language: input.language, content: input.code, reason: "RUN" },
  });

  return {
    executionId: execution.id,
    status: result.status,
    results: result.results,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    /** Lets the candidate UI say so when results come from the demo runner, which does not execute code. */
    runner: getSandbox().name,
  };
}

export async function submitTask(sessionId: string, sessionTaskId: string, input: RunSubmitInput) {
  const sessionTask = await loadOwnedSessionTask(sessionId, sessionTaskId);
  if (sessionTask.submittedAt) {
    throw new AppError("TASK_FROZEN", "This task has already been submitted.");
  }

  const claimed = await prisma.sessionCodingTask.updateMany({
    where: { id: sessionTaskId, submittedAt: null },
    data: { submittedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new AppError("TASK_FROZEN", "This task has already been submitted.");
  }

  const visibleTests = sessionTask.task.visibleTests as unknown as TestCase[];
  const hiddenTests = sessionTask.task.hiddenTests as unknown as TestCase[];
  const result = await getSandbox().execute({
    language: input.language,
    code: input.code,
    tests: [...visibleTests, ...hiddenTests],
    timeLimitMs: sessionTask.task.timeLimitMs,
  });

  const visibleResults = result.results.slice(0, visibleTests.length);
  const hiddenResults = result.results.slice(visibleTests.length);

  await prisma.codeExecution.create({
    data: {
      sessionId,
      sessionTaskId,
      kind: "SUBMIT",
      status: result.status,
      language: input.language,
      code: input.code,
      visibleResults,
      hiddenResults,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      finishedAt: new Date(),
    },
  });
  await prisma.codeSnapshot.create({
    data: { sessionId, sessionTaskId, language: input.language, content: input.code, reason: "SUBMIT" },
  });

  registry.get(sessionId)?.freezeTask(sessionTaskId);
  emitToCandidate(sessionId, CANDIDATE_EVENTS.TASK_FROZEN, { taskId: sessionTaskId });

  return { submitted: true, visibleResults, runner: getSandbox().name };
}

export async function getSessionCode(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const tasks = await prisma.sessionCodingTask.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    include: {
      task: { select: { id: true, title: true, languages: true, timeLimitMs: true } },
      snapshots: { orderBy: { createdAt: "asc" } },
      executions: { orderBy: { createdAt: "asc" } },
    },
  });

  return tasks.map((sessionTask) => ({
    taskId: sessionTask.id,
    title: sessionTask.task.title,
    languages: sessionTask.task.languages,
    frozen: sessionTask.submittedAt !== null,
    submittedAt: sessionTask.submittedAt,
    snapshots: sessionTask.snapshots,
    executions: sessionTask.executions,
  }));
}
