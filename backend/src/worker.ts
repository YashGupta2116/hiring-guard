import { Worker } from "bullmq";
import { createRedisConnection } from "./utils/redis.js";
import { logger } from "./utils/logger.js";
import { QUEUE_NAMES, type JdParseJobData, type LinkExpiryJobData } from "./utils/queues.js";
import { processJdParse } from "./workers/jd-parse.worker.js";
import { processLinkExpiry } from "./workers/link-expiry.worker.js";

const connection = createRedisConnection();

const jdParseWorker = new Worker<JdParseJobData>(QUEUE_NAMES.jdParse, processJdParse, { connection });
jdParseWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "jd-parse job failed"));

const linkExpiryWorker = new Worker<LinkExpiryJobData>(QUEUE_NAMES.linkExpiry, processLinkExpiry, { connection });
linkExpiryWorker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "link-expiry job failed"));

logger.info("workers started");

async function shutdown(): Promise<void> {
  logger.info("workers shutting down");
  await Promise.all([jdParseWorker.close(), linkExpiryWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
