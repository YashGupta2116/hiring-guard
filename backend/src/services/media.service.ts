import { AppError } from "../utils/app-error.js";
import { getMedia } from "../providers/index.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";

export async function markMediaReady(sessionId: string): Promise<{ ready: true }> {
  const verification = await getMedia().verifyCandidateTracks(sessionId);
  if (!verification.camera || !verification.microphone || !verification.screen || !verification.screenIsMonitor) {
    throw new AppError("MEDIA_NOT_READY", "Camera, microphone and full-screen sharing must all be active.");
  }

  await redis.hset(`s:${sessionId}:state`, "mediaReady", "1");
  return { ready: true };
}

/**
 * Starts egress and creates the `Recording` row when the session goes LIVE (Architecture.md §7.1/§6.7
 * step 4 assumes a recording is already running by the time seal stops it). A session with all three
 * record flags off never gets a `Recording` row at all, and seal's stop step is then a no-op.
 */
export async function startRecordingIfConfigured(session: {
  id: string;
  recordVideo: boolean;
  recordAudio: boolean;
  recordScreen: boolean;
}): Promise<void> {
  if (!session.recordVideo && !session.recordAudio && !session.recordScreen) return;

  const { egressId, startedAt } = await getMedia().startRecording(session.id);
  await prisma.recording.upsert({
    where: { sessionId: session.id },
    create: { sessionId: session.id, egressId, status: "RECORDING", egressStartedAt: startedAt },
    update: {
      egressId,
      status: "RECORDING",
      egressStartedAt: startedAt,
      endedAt: null,
      compositeUri: null,
      hlsUri: null,
      checksum: null,
    },
  });
}
