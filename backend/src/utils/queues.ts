import { Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";

export const QUEUE_NAMES = {
  jdParse: "jd-parse",
  linkExpiry: "link-expiry",
} as const;

const connection = createRedisConnection();

export const jdParseQueue = new Queue(QUEUE_NAMES.jdParse, { connection });
export const linkExpiryQueue = new Queue(QUEUE_NAMES.linkExpiry, { connection });

export type JdParseJobData = { sessionId: string };
export type LinkExpiryJobData = { sessionId: string; joinTokenId: string };
