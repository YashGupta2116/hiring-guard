import type { Job } from "bullmq";
import { transition } from "../services/session-state.service.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import type { LinkExpiryJobData } from "../utils/queues.js";

/**
 * Fires when a join link's `expiresAt` passes. If the link was never consumed and the session is
 * still ARMED, the window closed with no consent: ARMED → EXPIRED (Architecture.md session state machine).
 */
export async function processLinkExpiry(job: Job<LinkExpiryJobData>): Promise<void> {
  const { sessionId, joinTokenId } = job.data;

  const joinToken = await prisma.joinToken.findUnique({ where: { id: joinTokenId } });
  if (!joinToken || joinToken.usedAt || joinToken.revokedAt) {
    return;
  }

  const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "ARMED") {
    return;
  }

  try {
    await transition(sessionId, ["ARMED"], "EXPIRED", { orgId: session.orgId, actorType: "SYSTEM" });
  } catch (err) {
    logger.warn({ err, sessionId }, "link expiry: session was no longer ARMED");
  }
}
