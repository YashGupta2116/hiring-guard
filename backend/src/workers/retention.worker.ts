import type { Job } from "bullmq";
import { logger } from "../utils/logger.js";
import type { RetentionJobData } from "../utils/queues.js";
import { runRetention } from "../services/retention.service.js";

/** Fires nightly (Architecture.md §3 "retention worker"). See retention.service.ts for the windows. */
export async function processRetention(_job: Job<RetentionJobData>): Promise<void> {
  const summary = await runRetention();
  logger.info({ summary }, "retention: run complete");
}
