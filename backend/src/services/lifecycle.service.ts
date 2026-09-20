import { CALIBRATION_MS, DISCARD_EMPTY_SESSIONS, JOIN_EARLY_MINUTES } from "../config/constants.js";
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
import { log } from "./audit.service.js";
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
  // The atomic transition runs first, before any SessionRuntime is constructed: it's the only real
  // compare-and-set guard against a double-submitted startSession. If it throws (a concurrent call
  // already won), no runtime is ever created, so there's no zombie runtime left running for the loser.
  await transition(sessionId, ["ADMITTED"], "LIVE", { orgId, actorType: "USER", actorId });

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
  try {
    await runtime.start();
  } catch (err) {
    registry.delete(sessionId);
    throw err;
  }
  // The candidate usually connects in the waiting room, before this runtime exists, so nothing would ever
  // tell the interviewer they are already here.
  if ((await countCandidateSockets(sessionId)) > 0) runtime.onCandidateConnected();
  await startRecordingIfConfigured(session);

  await broadcastSessionState(sessionId, "LIVE", startedAt, null, null);

  return getSession(orgId, sessionId);
}

const ROOM_OPENABLE_STATUSES = new Set(["DRAFT", "CONFIGURED", "ARMED", "ADMITTED", "LIVE"]);

/** The interviewer has opened the live room; from now on the candidate may begin the setup checks. */
export async function openRoom(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  if (!ROOM_OPENABLE_STATUSES.has(session.status)) {
    throw new AppError("INVALID_STATE_TRANSITION", "This interview can no longer be opened.", { currentStatus: session.status });
  }
  await redis.hset(`s:${sessionId}:state`, "roomOpen", "1");
  return { open: true };
}

export async function isRoomOpen(sessionId: string, status: string): Promise<boolean> {
  if (status === "ADMITTED" || status === "LIVE") return true;
  return (await redis.hget(`s:${sessionId}:state`, "roomOpen")) === "1";
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

  // A session in which the candidate never took part (no telemetry received) or that ran less than the
  // calibration window has nothing to score: close it without producing a report.
  const telemetrySeen = await redis.hget(`s:${sessionId}:state`, "telemetrySeen");
  const ranMs = session.startedAt ? Date.now() - session.startedAt.getTime() : 0;
  if (DISCARD_EMPTY_SESSIONS && (telemetrySeen !== "1" || ranMs < CALIBRATION_MS)) {
    await discardSession(orgId, sessionId, actorId);
    return getSession(orgId, sessionId);
  }

  await sealSession(orgId, sessionId, reason, actorId);

  return getSession(orgId, sessionId);
}

/** Ends a LIVE session that had no real participation. No evidence is sealed and no report is built. */
async function discardSession(orgId: string, sessionId: string, actorId?: string): Promise<void> {
  const runtime = registry.get(sessionId);
  if (runtime) {
    await runtime.destroy("This interview was closed before it began.");
    registry.delete(sessionId);
  }
  const aborted = await transition(sessionId, ["LIVE"], "ABORTED", {
    orgId,
    actorType: actorId ? "USER" : "SYSTEM",
    actorId,
    extra: { endReason: "no_participation" },
  });
  await broadcastSessionState(sessionId, "ABORTED", aborted.startedAt, aborted.endedAt, "no_participation");
}

/** The candidate left full screen, switched tab or lost focus: the interview is ended immediately. */
export async function handleCandidateViolation(sessionId: string, kind: string): Promise<void> {
  const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "LIVE") return;
  await log({ orgId: session.orgId, sessionId, actorType: "SYSTEM", action: "session.candidate_violation", metadata: { kind } });
  await endSession(session.orgId, sessionId, "candidate_violation");
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
    warningCount: await prisma.warning.count({ where: { sessionId } }),
    lastFrameSeq: lastFrameSeqRaw ? Number(lastFrameSeqRaw) : 0,
  };
}
