import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export async function getCandidateSession(sessionId: string) {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { tasks: { select: { id: true } } },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  return {
    status: session.status,
    title: session.title,
    startedAt: session.startedAt,
    durationMinutes: session.durationMinutes,
    hasCodingRound: session.tasks.length > 0 || session.interviewType === "CODING",
  };
}
