import type { Difficulty, InterviewType, MonitoringChannel, Sensitivity, SessionStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { getSession } from "./session.service.js";
import { transition } from "./session-state.service.js";

export type PatchConfigInput = Partial<{
  interviewType: InterviewType;
  difficulty: Difficulty;
  recordVideo: boolean;
  recordAudio: boolean;
  recordScreen: boolean;
  channels: MonitoringChannel[];
  sensitivity: Sensitivity;
  topicBudgets: Record<string, number>;
  taskIds: string[];
}>;

const CONFIGURABLE_STATUSES: SessionStatus[] = ["DRAFT", "CONFIGURED", "ARMED", "ADMITTED"];

export async function patchConfig(orgId: string, sessionId: string, actorId: string, patch: PatchConfigInput) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, orgId },
    include: { consents: { select: { id: true }, take: 1 } },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  if (!CONFIGURABLE_STATUSES.includes(session.status)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Session configuration can only change before it goes LIVE.", {
      currentStatus: session.status,
    });
  }

  if (patch.taskIds) {
    const owned = await prisma.codingTask.count({ where: { orgId, id: { in: patch.taskIds } } });
    if (owned !== patch.taskIds.length) {
      throw new AppError("VALIDATION_FAILED", "One or more coding tasks do not belong to this organisation.");
    }
  }

  const addsNewChannel = patch.channels?.some((c) => !session.channels.includes(c)) ?? false;
  const hasExistingConsent = session.consents.length > 0;
  const needsReconsent = session.needsReconsent || (addsNewChannel && hasExistingConsent);
  const fieldsChanged = Object.keys(patch).some((key) => key !== "taskIds");

  await prisma.$transaction(async (tx) => {
    await tx.interviewSession.update({
      where: { id: sessionId },
      data: {
        ...(patch.interviewType !== undefined ? { interviewType: patch.interviewType } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
        ...(patch.recordVideo !== undefined ? { recordVideo: patch.recordVideo } : {}),
        ...(patch.recordAudio !== undefined ? { recordAudio: patch.recordAudio } : {}),
        ...(patch.recordScreen !== undefined ? { recordScreen: patch.recordScreen } : {}),
        ...(patch.channels !== undefined ? { channels: patch.channels } : {}),
        ...(patch.sensitivity !== undefined ? { sensitivity: patch.sensitivity } : {}),
        ...(patch.topicBudgets !== undefined ? { topicBudgets: patch.topicBudgets } : {}),
        ...(fieldsChanged ? { configVersion: { increment: 1 } } : {}),
        ...(needsReconsent !== session.needsReconsent ? { needsReconsent } : {}),
      },
    });

    if (patch.taskIds) {
      await tx.sessionCodingTask.deleteMany({ where: { sessionId } });
      if (patch.taskIds.length > 0) {
        await tx.sessionCodingTask.createMany({
          data: patch.taskIds.map((taskId, position) => ({ sessionId, taskId, position })),
        });
      }
    }
  });

  if (session.status === "DRAFT") {
    await transition(sessionId, ["DRAFT"], "CONFIGURED", { orgId, actorType: "USER", actorId });
  }

  return getSession(orgId, sessionId);
}
