import type { InterviewMode, SessionStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { newSessionId } from "../utils/ids.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";
import { transition } from "./session-state.service.js";

const sessionInclude = {
  interviewers: { include: { user: { select: { id: true, name: true } } } },
  candidate: true,
  jobDescription: { select: { parseStatus: true } },
  tasks: { include: { task: { select: { id: true, title: true } } }, orderBy: { position: "asc" as const } },
  report: { select: { id: true } },
} as const;

export type CreateSessionInput = {
  mode: InterviewMode;
  title?: string;
  candidateEmail?: string;
  candidateName?: string;
  scheduledAt?: string;
  durationMinutes: number;
};

export type UpdateSessionInput = Partial<{
  title: string | null;
  candidateEmail: string;
  candidateName: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
}>;

export type ListSessionsFilter = {
  status?: SessionStatus;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
};

function toDto(session: Awaited<ReturnType<typeof findSessionOrThrow>>) {
  return {
    id: session.id,
    orgId: session.orgId,
    mode: session.mode,
    status: session.status,
    title: session.title,
    candidate: session.candidate
      ? { id: session.candidate.id, email: session.candidate.email, name: session.candidate.name }
      : null,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    config: {
      interviewType: session.interviewType,
      difficulty: session.difficulty,
      recordVideo: session.recordVideo,
      recordAudio: session.recordAudio,
      recordScreen: session.recordScreen,
      channels: session.channels,
      sensitivity: session.sensitivity,
      topicBudgets: session.topicBudgets,
      configVersion: session.configVersion,
      needsReconsent: session.needsReconsent,
    },
    interviewers: session.interviewers.map((i) => ({ userId: i.userId, name: i.user.name, isPrimary: i.isPrimary })),
    jdStatus: session.jobDescription?.parseStatus ?? null,
    tasks: session.tasks.map((t) => ({ sessionTaskId: t.id, taskId: t.taskId, title: t.task.title, position: t.position })),
    reportId: session.report?.id ?? null,
    armedAt: session.armedAt,
    admittedAt: session.admittedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    sealedAt: session.sealedAt,
    createdAt: session.createdAt,
  };
}

async function findSessionOrThrow(orgId: string, id: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id, orgId }, include: sessionInclude });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  return session;
}

async function upsertCandidate(orgId: string, email?: string, name?: string): Promise<string | undefined> {
  if (!email) return undefined;
  const candidate = await prisma.candidate.upsert({
    where: { orgId_email: { orgId, email } },
    update: { ...(name ? { name } : {}) },
    create: { orgId, email, name },
  });
  return candidate.id;
}

export async function createSession(orgId: string, createdById: string, input: CreateSessionInput) {
  const candidateId = await upsertCandidate(orgId, input.candidateEmail, input.candidateName);
  const id = newSessionId();

  await prisma.$transaction(async (tx) => {
    await tx.interviewSession.create({
      data: {
        id,
        orgId,
        createdById,
        candidateId,
        mode: input.mode,
        title: input.title,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        durationMinutes: input.durationMinutes,
      },
    });
    await tx.sessionInterviewer.create({ data: { sessionId: id, userId: createdById, isPrimary: true } });
    await tx.auditLog.create({
      data: { orgId, sessionId: id, actorType: "USER", actorId: createdById, action: "session.created", toStatus: "DRAFT" },
    });
  });

  return toDto(await findSessionOrThrow(orgId, id));
}

export async function listSessions(orgId: string, filter: ListSessionsFilter) {
  const sessions = await prisma.interviewSession.findMany({
    where: {
      orgId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? { scheduledAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
        : {}),
    },
    include: sessionInclude,
    orderBy: { id: "desc" },
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });

  const hasMore = sessions.length > filter.limit;
  const items = hasMore ? sessions.slice(0, filter.limit) : sessions;

  return { items: items.map(toDto), nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function getSession(orgId: string, id: string) {
  return toDto(await findSessionOrThrow(orgId, id));
}

const UPDATABLE_STATUSES: SessionStatus[] = ["DRAFT", "CONFIGURED", "ARMED"];

export async function updateSession(orgId: string, id: string, patch: UpdateSessionInput) {
  const session = await findSessionOrThrow(orgId, id);
  if (!UPDATABLE_STATUSES.includes(session.status)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Session can only be edited in DRAFT, CONFIGURED or ARMED.", {
      currentStatus: session.status,
    });
  }

  const candidateId =
    patch.candidateEmail !== undefined ? await upsertCandidate(orgId, patch.candidateEmail, patch.candidateName ?? undefined) : undefined;

  const candidateChanged = candidateId !== undefined && candidateId !== session.candidateId;

  await prisma.interviewSession.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null } : {}),
      ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
      ...(candidateId !== undefined ? { candidateId } : {}),
    },
  });

  if (candidateChanged) {
    // Links were issued for the previous candidate; they must not admit the new one (or stay live for the old one).
    const revoked = await prisma.joinToken.updateMany({ where: { sessionId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await log({ orgId, sessionId: id, actorType: "USER", action: "session.candidate_changed", metadata: { candidateId, linksRevoked: revoked.count } });
  }

  return toDto(await findSessionOrThrow(orgId, id));
}

const CANCELLABLE_STATUSES: SessionStatus[] = ["DRAFT", "CONFIGURED", "ARMED", "ADMITTED"];

export async function cancelSession(orgId: string, id: string, actorId: string) {
  await transition(id, CANCELLABLE_STATUSES, "ABORTED", {
    orgId,
    actorType: "USER",
    actorId,
    extra: { endReason: "interviewer" },
  });
  return toDto(await findSessionOrThrow(orgId, id));
}

export async function addInterviewer(orgId: string, sessionId: string, userId: string) {
  await findSessionOrThrow(orgId, sessionId);

  const member = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (!member) {
    throw new AppError("VALIDATION_FAILED", "User is not a member of this organisation.");
  }

  await prisma.sessionInterviewer.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    update: {},
    create: { sessionId, userId },
  });

  await log({ orgId, sessionId, actorType: "USER", action: "session.interviewer_added", metadata: { userId } });

  return toDto(await findSessionOrThrow(orgId, sessionId));
}

export async function removeInterviewer(orgId: string, sessionId: string, userId: string) {
  await findSessionOrThrow(orgId, sessionId);

  const interviewer = await prisma.sessionInterviewer.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (!interviewer) {
    throw new AppError("NOT_FOUND", "Interviewer not found on this session.");
  }
  if (interviewer.isPrimary) {
    throw new AppError("CONFLICT", "Cannot remove the primary interviewer.");
  }

  await prisma.sessionInterviewer.delete({ where: { sessionId_userId: { sessionId, userId } } });
  await log({ orgId, sessionId, actorType: "USER", action: "session.interviewer_removed", metadata: { userId } });
}
