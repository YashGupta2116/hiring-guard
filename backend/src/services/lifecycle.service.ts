import { JOIN_EARLY_MINUTES } from "../config/constants.js";
import { registry } from "../live/registry.js";
import { SessionRuntime, type EndReason } from "../live/session-runtime.js";
import { broadcastSessionState } from "../sockets/session-broadcast.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { countCandidateSockets } from "../sockets/emitter.js";
import { redis } from "../utils/redis.js";
import { listFlags } from "./flag.service.js";
import { startRecordingIfConfigured } from "./media.service.js";
import { listNotes } from "./note.service.js";
import { sealSession } from "./seal.service.js";
import { getSession } from "./session.service.js";
import { transition } from "./session-state.service.js";

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
  // The join window already stops a candidate being admitted early; this covers a session whose time moved.
  if (session.scheduledAt && session.scheduledAt.getTime() - JOIN_EARLY_MINUTES * 60_000 > Date.now()) {
    throw new AppError("INTERVIEW_NOT_OPEN", "This interview is scheduled for later and can't be started yet.", { scheduledAt: session.scheduledAt.toISOString() });
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
    channels: session.channels,
    onEnd: async (reason) => {
      await endSession(orgId, sessionId, reason);
    },
  });
  registry.set(sessionId, runtime);
  await runtime.start();
  // The candidate usually connects in the waiting room, before this runtime exists, so nothing would ever
  // tell the interviewer they are already here.
  if ((await countCandidateSockets(sessionId)) > 0) runtime.onCandidateConnected();
  await startRecordingIfConfigured(session);

  await transition(sessionId, ["ADMITTED"], "LIVE", { orgId, actorType: "USER", actorId });
  await broadcastSessionState(sessionId, "LIVE", startedAt, null, null);

  return getSession(orgId, sessionId);
}

export async function endSession(orgId: string, sessionId: string, reason: EndReason, actorId?: string) {
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

  await sealSession(orgId, sessionId, reason, actorId);

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

  const [flags, notes] = await Promise.all([listFlags(orgId, sessionId, {}), listNotes(sessionId)]);

  return {
    status: session.status,
    startedAt: session.startedAt,
    calibrationEndsAt: runtime?.calibrationEndsAt ?? (session.startedAt ? new Date(session.startedAt.getTime() + 60_000) : null),
    elapsedMs,
    remainingMs,
    mediaReady: mediaReady === "1",
    candidateConnected: (await countCandidateSockets(sessionId)) > 0,
    integrity: runtime ? { score: runtime.snapshotIntegrity(), calibrating: Date.now() < runtime.calibrationEndsAt.getTime() } : null,
    flags,
    notes,
    lastFrameSeq: lastFrameSeqRaw ? Number(lastFrameSeqRaw) : 0,
  };
}
