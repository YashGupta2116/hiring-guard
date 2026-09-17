import { createRedisConnection } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { emitToInterviewers } from "./emitter.js";

/**
 * Subscribes to `events:{sid}` (published by workers via utils/events.ts publishSessionEvent)
 * and forwards them to the /interviewer dashboard. Pattern-subscribes once for every session.
 */
export function startEventSubscriber(): void {
  const subscriber = createRedisConnection();

  subscriber.psubscribe("events:*", (err) => {
    if (err) logger.error({ err }, "failed to subscribe to events:*");
  });

  subscriber.on("pmessage", (_pattern, channel, message) => {
    const sessionId = channel.slice("events:".length);
    try {
      const { event, payload } = JSON.parse(message) as { event: string; payload: unknown };
      void emitToInterviewers(sessionId, event, payload);
    } catch (err) {
      logger.error({ err, channel }, "malformed events:{sid} message");
    }
  });
}
