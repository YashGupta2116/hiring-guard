import { Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";

export const QUEUE_NAMES = {
  jdParse: "jd-parse",
} as const;

const connection = createRedisConnection();

export const jdParseQueue = new Queue(QUEUE_NAMES.jdParse, { connection });

export type JdParseJobData = { sessionId: string };
