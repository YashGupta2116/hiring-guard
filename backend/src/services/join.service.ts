import { CANDIDATE_TOKEN_GRACE_HOURS, DEFAULT_RETENTION_DAYS, JOIN_EARLY_MINUTES, PREFLIGHT_MIN_CPU_CORES, PREFLIGHT_MIN_DOWNLINK_MBPS } from "../config/constants.js";
import type { InterviewSession, JoinToken } from "../generated/prisma/client.js";
import type { MonitoringChannel } from "../generated/prisma/enums.js";
import { getMedia } from "../providers/index.js";
import { AppError } from "../utils/app-error.js";
import { canonicalJson, pepperedHash, sha256Hex } from "../utils/hash.js";
import { signCandidateToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";
import { transition } from "./session-state.service.js";

const CHANNEL_BULLETS: Record<MonitoringChannel, string> = {
  GAZE: "where you are looking on screen",
  FACE: "whether a face is visible on camera",
  IDENTITY: "that the person on camera matches who joined",
  SCENE: "your surrounding environment on camera",
  AUDIO: "audio in the room, including additional voices",
  SCREEN: "what is shown on your shared screen",
  FOCUS: "whether this browser tab stays in focus",
  PASTE: "text pasted into the code editor",
  RHYTHM: "your typing rhythm",
  POINTER: "mouse pointer activity",
  ENVIRONMENT: "your device and network setup, such as number of displays",
};

export type PreflightProbe = {
  webrtc: boolean;
  getDisplayMedia: boolean;
  camera: "granted" | "prompt" | "denied" | "unavailable";
  microphone: "granted" | "prompt" | "denied" | "unavailable";
  screenCount: number;
  isExtended: boolean;
  downlinkMbps: number;
  hardwareConcurrency: number;
  userAgent: string;
};

type PreflightIssue = { code: string; message: string };

function evaluatePreflight(probe: PreflightProbe): { failures: PreflightIssue[]; warnings: PreflightIssue[] } {
  const failures: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  if (!probe.webrtc) failures.push({ code: "NO_WEBRTC", message: "Your browser does not support the required video call technology." });
  if (!probe.getDisplayMedia) failures.push({ code: "NO_SCREEN_CAPTURE", message: "Your browser does not support screen sharing, which this interview requires." });
  if (probe.camera !== "granted") failures.push({ code: "NO_CAMERA", message: "Camera access is required and was not granted." });
  if (probe.downlinkMbps < PREFLIGHT_MIN_DOWNLINK_MBPS) failures.push({ code: "LOW_DOWNLINK", message: "Your internet connection looks too slow for a stable interview." });

  if (probe.isExtended) warnings.push({ code: "EXTENDED_DISPLAY", message: "You appear to be using multiple displays. A single display is recommended." });
  if (probe.hardwareConcurrency < PREFLIGHT_MIN_CPU_CORES) warnings.push({ code: "LOW_CPU", message: "Your device may struggle to run the interview smoothly." });

  return { failures, warnings };
}

async function loadSession(sessionId: string): Promise<InterviewSession & { org: { name: string }; interviewers: { user: { name: string } }[] }> {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { org: { select: { name: true } }, interviewers: { include: { user: { select: { name: true } } } } },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  return session;
}

/**
 * When the candidate may first enter: JOIN_EARLY_MINUTES before a scheduled start, or the link's own
 * `notBefore` if that is later. Null means there is no restriction (e.g. a direct link with no start time).
 */
export function joinOpensAt(scheduledAt: Date | null, notBefore: Date | null): Date | null {
  const scheduled = scheduledAt ? new Date(scheduledAt.getTime() - JOIN_EARLY_MINUTES * 60_000) : null;
  if (scheduled && notBefore) return scheduled > notBefore ? scheduled : notBefore;
  return scheduled ?? notBefore;
}

export async function assertJoinWindowOpen(joinToken: JoinToken): Promise<void> {
  const session = await prisma.interviewSession.findUnique({ where: { id: joinToken.sessionId }, select: { scheduledAt: true } });
  const opensAt = joinOpensAt(session?.scheduledAt ?? null, joinToken.notBefore);
  if (opensAt && opensAt > new Date()) {
    throw new AppError("INTERVIEW_NOT_OPEN", "This interview isn't open yet. Please come back closer to the start time.", { opensAt: opensAt.toISOString() });
  }
}

export async function getJoinSummary(joinToken: JoinToken) {
  const session = await loadSession(joinToken.sessionId);
  const opensAt = joinOpensAt(session.scheduledAt, joinToken.notBefore);
  const notYetOpen = opensAt ? opensAt > new Date() : false;

  return {
    sessionTitle: session.title,
    orgName: session.org.name,
    interviewerNames: session.interviewers.map((i) => i.user.name),
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    status: notYetOpen ? "NOT_YET_OPEN" : "READY",
    opensAt: opensAt ? opensAt.toISOString() : null,
  };
}

export async function runPreflight(joinToken: JoinToken, probe: PreflightProbe) {
  const { failures, warnings } = evaluatePreflight(probe);
  const passed = failures.length === 0;

  const check = await prisma.preflightCheck.create({
    data: { sessionId: joinToken.sessionId, joinTokenId: joinToken.id, passed, failures, warnings, probe },
  });

  return { preflightId: check.id, passed, failures, warnings };
}

function buildPolicy(session: InterviewSession & { org: { name: string } }) {
  const bullets: string[] = [];
  if (session.recordVideo || session.recordAudio || session.recordScreen) {
    const parts = [session.recordVideo && "video", session.recordAudio && "audio", session.recordScreen && "your screen"].filter(Boolean);
    bullets.push(`This interview records ${parts.join(", ")} for review by the hiring team.`);
  }
  for (const channel of session.channels) {
    bullets.push(`We monitor ${CHANNEL_BULLETS[channel]} to help ensure interview integrity.`);
  }
  bullets.push(`Recordings and evidence are kept for up to ${DEFAULT_RETENTION_DAYS} days.`);

  const policy = {
    bullets,
    recording: { video: session.recordVideo, audio: session.recordAudio, screen: session.recordScreen },
    retentionDays: DEFAULT_RETENTION_DAYS,
    viewers: `Your interviewer and the hiring team at ${session.org.name}`,
  };

  const policyHash = sha256Hex(canonicalJson({ ...policy, configVersion: session.configVersion }));
  return { ...policy, policyHash };
}

export async function getPolicy(joinToken: JoinToken) {
  const session = await loadSession(joinToken.sessionId);
  return buildPolicy(session);
}

export type ConsentInput = {
  preflightId: string;
  policyHash: string;
  accepted: boolean;
  scrolledToEnd: true;
  ip: string;
  userAgent: string;
};

export async function submitConsent(joinToken: JoinToken, input: ConsentInput) {
  const session = await loadSession(joinToken.sessionId);

  if (!input.accepted) {
    await transition(session.id, ["ARMED"], "ABORTED", {
      orgId: session.orgId,
      actorType: "CANDIDATE",
      extra: { endReason: "candidate_declined" },
    });
    await log({ orgId: session.orgId, sessionId: session.id, actorType: "CANDIDATE", action: "consent.declined" });
    return { ended: true as const };
  }

  const currentPolicy = buildPolicy(session);
  if (currentPolicy.policyHash !== input.policyHash) {
    throw new AppError("POLICY_CHANGED", "The interview policy has changed since you last viewed it. Please review it again.");
  }

  const preflight = await prisma.preflightCheck.findFirst({ where: { id: input.preflightId, sessionId: session.id, joinTokenId: joinToken.id } });
  if (!preflight || !preflight.passed) {
    throw new AppError("PREFLIGHT_REQUIRED", "A passing system check is required before consenting.");
  }

  const consent = await prisma.consent.create({
    data: {
      sessionId: session.id,
      joinTokenId: joinToken.id,
      accepted: true,
      channels: session.channels,
      scopeDisplayed: { bullets: currentPolicy.bullets },
      policyHash: currentPolicy.policyHash,
      configVersion: session.configVersion,
      retentionDays: currentPolicy.retentionDays,
      ipHash: pepperedHash(input.ip),
      uaHash: pepperedHash(input.userAgent),
    },
  });

  await prisma.joinToken.update({
    where: { id: joinToken.id },
    data: { useCount: { increment: 1 }, ...(joinToken.kind === "ONE_TIME" ? { usedAt: new Date() } : {}) },
  });

  await transition(session.id, ["ARMED"], "ADMITTED", {
    orgId: session.orgId,
    actorType: "CANDIDATE",
    extra: { needsReconsent: false },
  });

  await log({ orgId: session.orgId, sessionId: session.id, actorType: "CANDIDATE", action: "consent.accepted", metadata: { consentId: consent.id } });

  const ttlSeconds = session.durationMinutes * 60 + CANDIDATE_TOKEN_GRACE_HOURS * 3600;
  const candidateToken = await signCandidateToken({ sid: session.id, consentId: consent.id }, ttlSeconds);
  const mediaToken = await getMedia().createParticipantToken({
    sessionId: session.id,
    identity: consent.id,
    role: "candidate",
    ttlSeconds,
  });

  return { candidateToken, media: { url: getMedia().url, token: mediaToken } };
}
