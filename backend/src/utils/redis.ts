import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Main client for app commands (live state, leases, rate limits).
 * lazyConnect: nothing connects until the first command, so importing this in tests is harmless.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (error: Error) => {
  logger.error({ err: error }, "redis error");
});

/**
 * Extra connections for pub/sub subscribers and BullMQ (which requires maxRetriesPerRequest: null).
 */
export function createRedisConnection(options: RedisOptions = {}): Redis {
  const connection = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    ...options,
  });
  connection.on("error", (error: Error) => {
    logger.error({ err: error }, "redis connection error");
  });
  return connection;
}
