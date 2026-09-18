import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { processPipelineStep } from "./pipeline/flow.js";
import { createRedisConnection } from "./utils/redis.js";
import { logger } from "./utils/logger.js";
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

async function shutdown(): Promise<void> {
  logger.info("workers shutting down");
  await Promise.all([jdParseWorker.close(), linkExpiryWorker.close(), pipelineWorker.close(), retentionWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
