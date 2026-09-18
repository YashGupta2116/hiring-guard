import type { MonitoringChannel, UnscoredReason } from "../../generated/prisma/enums.js";
import { prisma } from "../../utils/prisma.js";

/**
 * Records an unscored window (Architecture.md §6.4 step 7). A point-in-time window (e.g. a telemetry
 * sequence gap) is opened and closed together; a window that stays open while a channel is frozen
 * (producer down) is opened with `endTs: null` and closed later via `closeOpenUnscoredWindows`.
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

/** Closes every still-open window for a session regardless of channel/reason (seal step 6). */
export async function closeAllOpenUnscoredWindows(sessionId: string, endTs: Date): Promise<void> {
  await prisma.unscoredWindow.updateMany({
    where: { sessionId, endTs: null },
    data: { endTs },
  });
}

/**
 * In-memory mirror of "is this channel currently frozen" for the fusion engine to consult on every
 * observation (Architecture.md §6.4 step 7: frozen = no decay, no new evidence, 0 score contribution).
 * A channel can be frozen for more than one reason at once (e.g. two producers down); it stays frozen
 * until every reason has cleared. Pure in-memory counting — no I/O.
 */
export class FrozenChannelTracker {
  private readonly openReasons = new Map<MonitoringChannel, Set<UnscoredReason>>();

  freeze(channel: MonitoringChannel, reason: UnscoredReason): void {
    const reasons = this.openReasons.get(channel) ?? new Set<UnscoredReason>();
    reasons.add(reason);
    this.openReasons.set(channel, reasons);
  }

  unfreeze(channel: MonitoringChannel, reason: UnscoredReason): void {
    this.openReasons.get(channel)?.delete(reason);
  }

  isFrozen(channel: MonitoringChannel): boolean {
    return (this.openReasons.get(channel)?.size ?? 0) > 0;
  }
}
