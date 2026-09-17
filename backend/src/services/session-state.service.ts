import type { InterviewSession } from "../generated/prisma/client.js";
import type { ActorType, SessionStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { publishSessionEvent } from "../utils/events.js";
import { prisma } from "../utils/prisma.js";

export type TransitionContext = {
  orgId: string;
  actorType: ActorType;
  actorId?: string;
  /** Extra fields to set alongside status, e.g. { endReason: "interviewer" }. */
  extra?: Record<string, unknown>;
};

/** Fields set automatically when entering a given status, beyond `status` itself. */
function timestampFieldsFor(to: SessionStatus): Record<string, unknown> {
  const now = new Date();
  switch (to) {
    case "ARMED":
      return { armedAt: now };
    case "ADMITTED":
      return { admittedAt: now };
    case "LIVE":
      return { startedAt: now };
    case "SEALING":
      return { endedAt: now };
    case "PROCESSING":
      return { sealedAt: now };
    case "ABORTED":
      return { endedAt: now };
    default:
      return {};
  }
}

/**
 * The only place `InterviewSession.status` may change. Runs a compare-and-set
 * (`updateMany` gated on the current status being one of `from`) and writes the
 * audit log row in the same transaction, so a lost race never silently succeeds.
 */
export async function transition(
  sessionId: string,
  from: SessionStatus[],
  to: SessionStatus,
  ctx: TransitionContext,
): Promise<InterviewSession> {
  const session = await prisma.$transaction(async (tx) => {
    const before = await tx.interviewSession.findFirst({ where: { id: sessionId, orgId: ctx.orgId } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Session not found.");
    }

    const result = await tx.interviewSession.updateMany({
      where: { id: sessionId, orgId: ctx.orgId, status: { in: from } },
      data: { status: to, ...timestampFieldsFor(to), ...ctx.extra },
    });

    if (result.count !== 1) {
      throw new AppError("INVALID_STATE_TRANSITION", `Session must be one of ${from.join(", ")} to become ${to}.`, {
        currentStatus: before.status,
      });
    }

    await tx.auditLog.create({
      data: {
        orgId: ctx.orgId,
        sessionId,
        actorType: ctx.actorType,
        actorId: ctx.actorId,
        action: "session.status_changed",
        fromStatus: before.status,
        toStatus: to,
      },
    });

    return tx.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
  });

  await publishSessionEvent(sessionId, "session.state", { status: session.status });

  return session;
}
