import type { ActorType, SessionStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/app-error.js";
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

/** Append-only. Never update or delete rows in `audit_logs` (except the retention job). */
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

export type AuditLogFilter = { limit: number; cursor?: string };

/** FR-AUD-1: every session state transition and sensitive action is queryable per session. */
export async function listForSession(orgId: string, sessionId: string, filter: AuditLogFilter) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const entries = await prisma.auditLog.findMany({
    where: { sessionId },
    orderBy: { id: "desc" },
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: BigInt(filter.cursor) }, skip: 1 } : {}),
  });

  const hasMore = entries.length > filter.limit;
  const items = hasMore ? entries.slice(0, filter.limit) : entries;

  return {
    items: items.map((entry) => ({
      id: entry.id.toString(),
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? (items[items.length - 1]?.id.toString() ?? null) : null,
  };
}
