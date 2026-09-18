import { FlowProducer, Queue } from "bullmq";
import type { PipelineStep } from "../generated/prisma/enums.js";
import { createRedisConnection } from "./redis.js";

export const QUEUE_NAMES = {
  jdParse: "jd-parse",
  linkExpiry: "link-expiry",
  pipeline: "pipeline",
} as const;

const connection = createRedisConnection();

export const jdParseQueue = new Queue(QUEUE_NAMES.jdParse, { connection });
export const linkExpiryQueue = new Queue(QUEUE_NAMES.linkExpiry, { connection });
export const pipelineQueue = new Queue(QUEUE_NAMES.pipeline, { connection });
export const pipelineFlowProducer = new FlowProducer({ connection });

export type JdParseJobData = { sessionId: string };
export type LinkExpiryJobData = { sessionId: string; joinTokenId: string };
/** Every pipeline step job (Phase 10) shares this data shape: which run, which session, which step. */
export type PipelineStepJobData = { runId: string; sessionId: string; orgId: string; step: PipelineStep };

/** BullMQ job `attempts`/`backoff` for every Phase 10 pipeline step (Phases.md §10: "attempts 3, exponential backoff"). */
export const PIPELINE_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
} as const;
