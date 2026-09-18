import type { Prisma } from "../generated/prisma/client.js";
import type { PipelineStep } from "../generated/prisma/enums.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";

/**
 * Every pipeline step (Phase 10) goes through this: writes its own `pipeline_step_runs` row
 * RUNNING -> SUCCEEDED | FAILED (Architecture.md §6.8), and always re-throws on failure so the
 * caller — a BullMQ job when run for real, a direct call in tests — sees the same failure.
 * `failParentOnFailure: false` on the flow means a failed step never stops its siblings or the
 * step consuming its output; downstream steps decide for themselves what "no output" means by
 * re-querying the DB (see e.g. composite-score.step.ts), which is the actual data hand-off
 * between steps — `output` here is for `GET /sessions/:id/pipeline` visibility, not a return
 * channel other steps read from.
 */
export async function runStep<T>(runId: string, step: PipelineStep, fn: () => Promise<T>): Promise<T> {
  await prisma.pipelineStepRun.upsert({
    where: { runId_step: { runId, step } },
    create: { runId, step, status: "RUNNING", attempts: 1, startedAt: new Date() },
    update: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(), error: null },
  });

  try {
    const output = await fn();
    await prisma.pipelineStepRun.update({
      where: { runId_step: { runId, step } },
      data: { status: "SUCCEEDED", finishedAt: new Date(), output: (output ?? null) as Prisma.InputJsonValue },
    });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId, step }, "pipeline step failed");
    await prisma.pipelineStepRun.update({
      where: { runId_step: { runId, step } },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw err;
  }
}
