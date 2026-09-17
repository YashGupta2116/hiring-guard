import { redis } from "./redis.js";

/**
 * Publishes a worker → API notification on `events:{sid}`. In later phases the api process
 * subscribes and forwards these to the dashboard/candidate sockets (sockets/index.ts, Phase 5).
 * No subscriber exists yet, so this is fire-and-forget.
 */
export async function publishSessionEvent(sessionId: string, event: string, payload: unknown): Promise<void> {
  await redis.publish(`events:${sessionId}`, JSON.stringify({ event, payload }));
}
