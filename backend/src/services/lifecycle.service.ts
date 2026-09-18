import { registry } from "../live/registry.js";
import { SessionRuntime, type EndReason } from "../live/session-runtime.js";
import { emitToCandidate, emitToInterviewers } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "../sockets/events.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";
import { getSession } from "./session.service.js";
import { transition } from "./session-state.service.js";

function mapCandidateStatus(status: string): "WAITING" | "LIVE" | "ENDED" {
  if (status === "LIVE") return "LIVE";
  if (["ADMITTED", "ARMED", "CONFIGURED", "DRAFT"].includes(status)) return "WAITING";
  return "ENDED";
}

async function broadcastSessionState(sessionId: string, status: string, startedAt: Date | null, endedAt: Date | null, endReason: string | null) {
  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.SESSION_STATE, { status, startedAt, endedAt, endReason });
  emitToCandidate(sessionId, CANDIDATE_EVENTS.SESSION_STATE, { status: mapCandidateStatus(status) });
}

const ALREADY_ENDED_STATUSES = new Set(["SEALING", "PROCESSING", "COMPLETE", "ABORTED", "EXPIRED"]);

export async function startSession(orgId: string, sessionId: string, actorId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  if (session.status !== "ADMITTED") {
    throw new AppError("INVALID_STATE_TRANSITION", "Session must be ADMITTED to start.", { currentStatus: session.status });
  }
  if (session.needsReconsent) {
    throw new AppError("RECONSENT_REQUIRED", "The candidate must re-consent before this session can start.");
  }
  const mediaReady = await redis.hget(`s:${sessionId}:state`, "mediaReady");
  if (mediaReady !== "1") {
    throw new AppError("MEDIA_NOT_READY", "Candidate media tracks are not verified yet.");
  }

  const startedAt = new Date();
  const runtime = new SessionRuntime({
    sessionId,
    durationMinutes: session.durationMinutes,
    startedAt,
    sensitivity: session.sensitivity,
    onEnd: async (reason) => {
      await endSession(orgId, sessionId, reason);
    },
  });
  registry.set(sessionId, runtime);
  await runtime.start();

  await transition(sessionId, ["ADMITTED"], "LIVE", { orgId, actorType: "USER", actorId });
  await broadcastSessionState(sessionId, "LIVE", startedAt, null, null);

  return getSession(orgId, sessionId);
}

export async function endSession(orgId: string, sessionId: string, reason: EndReason, actorId?: string) {
  const runtime = registry.get(sessionId);
  if (runtime) {
    await runtime.destroy();
    registry.delete(sessionId);
  }

  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  if (ALREADY_ENDED_STATUSES.has(session.status)) {
    return getSession(orgId, sessionId);
  }
  if (session.status !== "LIVE") {
    throw new AppError("INVALID_STATE_TRANSITION", "Session must be LIVE to end.", { currentStatus: session.status });
  }

  const sealing = await transition(sessionId, ["LIVE"], "SEALING", {
    orgId,
    actorType: actorId ? "USER" : "SYSTEM",
    actorId,
    extra: { endReason: reason },
  });
  await broadcastSessionState(sessionId, "SEALING", sealing.startedAt, sealing.endedAt, reason);

  // Seal is a stub until Phase 9: go straight to PROCESSING instead of running the real seal sequence.
  const processing = await transition(sessionId, ["SEALING"], "PROCESSING", { orgId, actorType: "SYSTEM" });
  await broadcastSessionState(sessionId, "PROCESSING", processing.startedAt, processing.endedAt, reason);

  return getSession(orgId, sessionId);
}

export async function getLiveSnapshot(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const runtime = registry.get(sessionId);
  const mediaReady = await redis.hget(`s:${sessionId}:state`, "mediaReady");
  const lastFrameSeqRaw = await redis.get(`s:${sessionId}:frameseq`);

  const elapsedMs = session.startedAt ? Date.now() - session.startedAt.getTime() : 0;
  const remainingMs = session.startedAt ? Math.max(0, session.durationMinutes * 60_000 - elapsedMs) : session.durationMinutes * 60_000;

  return {
    status: session.status,
    startedAt: session.startedAt,
    calibrationEndsAt: runtime?.calibrationEndsAt ?? (session.startedAt ? new Date(session.startedAt.getTime() + 60_000) : null),
    elapsedMs,
    remainingMs,
    mediaReady: mediaReady === "1",
    lastFrameSeq: lastFrameSeqRaw ? Number(lastFrameSeqRaw) : 0,
  };
}
