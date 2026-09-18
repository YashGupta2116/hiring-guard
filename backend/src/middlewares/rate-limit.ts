import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { isTest } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { redis } from "../utils/redis.js";

type LimiterOptions = {
  /** Unique per limiter, e.g. "auth". Becomes the Redis key prefix rl:<name>: */
  name: string;
  windowMs: number;
  limit: number;
  keyGenerator?: Options["keyGenerator"];
};

export function createRateLimiter(options: LimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: true,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    // In tests use the in-memory store so no Redis is needed.
    ...(isTest
      ? {}
      : {
          store: new RedisStore({
            prefix: `rl:${options.name}:`,
            sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
          }),
        }),
    handler: (_req, res, next, opts) => {
      res.set("Retry-After", String(Math.ceil(opts.windowMs / 1000)));
      next(new AppError("RATE_LIMITED", "Too many requests. Please try again later.", { retryAfterMs: opts.windowMs }));
    },
  });
}

/** Broad safety net for the whole API. Tighter limiters are added per route in later phases. */
export const apiLimiter = createRateLimiter({ name: "api", windowMs: 60_000, limit: 300 });
