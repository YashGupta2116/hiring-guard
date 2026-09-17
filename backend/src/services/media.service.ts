import { AppError } from "../utils/app-error.js";
import { getMedia } from "../providers/index.js";
import { redis } from "../utils/redis.js";

export async function markMediaReady(sessionId: string): Promise<{ ready: true }> {
  const verification = await getMedia().verifyCandidateTracks(sessionId);
  if (!verification.camera || !verification.microphone || !verification.screen || !verification.screenIsMonitor) {
    throw new AppError("MEDIA_NOT_READY", "Camera, microphone and full-screen sharing must all be active.");
  }

  await redis.hset(`s:${sessionId}:state`, "mediaReady", "1");
  return { ready: true };
}
