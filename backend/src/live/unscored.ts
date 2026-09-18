import type { MonitoringChannel, UnscoredReason } from "../generated/prisma/enums.js";
import { prisma } from "../utils/prisma.js";

/**
 * Records an unscored window (Architecture.md §6.4 step 7). Phase 6 only opens and immediately closes
 * point-in-time windows (e.g. a sequence gap detected at ingest); a window that stays open while a
 * channel is frozen (media grace, live producer-health) lands with the fusion engine in Phase 7.
 */
export async function recordUnscoredWindow(
  sessionId: string,
  channel: MonitoringChannel,
  reason: UnscoredReason,
  startTs: Date,
  endTs: Date | null,
  detail?: string,
): Promise<void> {
  await prisma.unscoredWindow.create({
    data: { sessionId, channel, reason, startTs, endTs, detail },
  });
}

/** Closes any still-open windows for this session/channel/reason (e.g. a producer coming back healthy). */
export async function closeOpenUnscoredWindows(
  sessionId: string,
  channel: MonitoringChannel,
  reason: UnscoredReason,
  endTs: Date,
): Promise<void> {
  await prisma.unscoredWindow.updateMany({
    where: { sessionId, channel, reason, endTs: null },
    data: { endTs },
  });
}
