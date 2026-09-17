import type { ActorType, SessionStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../utils/prisma.js";

export type AuditLogInput = {
  orgId?: string;
  sessionId?: string;
  actorType: ActorType;
  actorId?: string;
  action: string;
  fromStatus?: SessionStatus;
  toStatus?: SessionStatus;
  metadata?: Record<string, unknown>;
};

/** Append-only. Never update or delete rows in `audit_logs`. */
export async function log(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      sessionId: input.sessionId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
