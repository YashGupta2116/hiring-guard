import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { processPipelineStep } from "./pipeline/flow.js";
import { createRedisConnection } from "./utils/redis.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./utils/prisma.js";
import { redis } from "./utils/redis.js";
import {
  QUEUE_NAMES,
  retentionQueue,
  type JdParseJobData,
  type LinkExpiryJobData,
  type PipelineStepJobData,
  type RetentionJobData,
} from "./utils/queues.js";
import { processJdParse } from "./workers/jd-parse.worker.js";
import { processLinkExpiry } from "./workers/link-expiry.worker.js";
import { processRetention } from "./workers/retention.worker.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const connection = createRedisConnection();

const jdParseWorker = new Worker<JdParseJobData>(QUEUE_NAMES.jdParse, processJdParse, { connection });
jdParseWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "jd-parse job failed"));

const linkExpiryWorker = new Worker<LinkExpiryJobData>(QUEUE_NAMES.linkExpiry, processLinkExpiry, { connection });
linkExpiryWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "link-expiry job failed"));

const pipelineWorker = new Worker<PipelineStepJobData>(QUEUE_NAMES.pipeline, processPipelineStep, { connection });
pipelineWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id, step: job?.name }, "pipeline step failed"));

const retentionWorker = new Worker<RetentionJobData>(QUEUE_NAMES.retention, processRetention, { connection });
retentionWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "retention job failed"));

// upsertJobScheduler is idempotent by key: restarting the worker updates the existing scheduler
// instead of stacking a second nightly run.
await retentionQueue.upsertJobScheduler(
  "retention-nightly",
  { pattern: env.RETENTION_CRON },
  { opts: { removeOnComplete: true, removeOnFail: true } },
);

logger.info("workers started");

let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "workers shutting down");

  const force = setTimeout(() => {
    logger.error("forced worker shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  // Worker.close() waits for the current job to finish before releasing its lock, so an
  // in-flight step run doesn't get silently double-picked-up by the next deploy's worker.
  await Promise.allSettled([jdParseWorker.close(), linkExpiryWorker.close(), pipelineWorker.close(), retentionWorker.close()]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);

  clearTimeout(force);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown("uncaughtException", 1);
});
