import { WARDEN_CAP_ABOVE_TIER1, WARDEN_COOLDOWN_MS } from "../config/constants.js";
import type { FlagSeverity, WarningTier } from "../generated/prisma/enums.js";
import { toFlagFrame } from "./fusion/flag-builder.js";
import { emitToCandidate, emitToInterviewers } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "../sockets/events.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";

/**
 * Fixed, neutral, candidate-facing templates (Design.md §6, Rules.md §9.2). Only detector types with an
 * exact wording here ever produce a candidate warning — a type with no entry still gets a flag on the
 * dashboard, just no `warn.show`. Never invent wording; add a row here only when Design.md gains one.
 */
const WARNING_MESSAGES: Record<string, string> = {
  focus_loss: "The interview window lost focus. Please keep this window active for the rest of the interview.",
  paste_large: "A large paste into the editor was detected. Please type your solution during the interview.",
  second_voice: "Multiple voices detected. Please ensure you are alone for the rest of the interview.",
  face_absent: "Your face is not visible to the camera. Please stay in view.",
  multiple_faces: "More than one person is visible. Please ensure you are alone.",
  gaze_away: "You appear to be looking away from the screen frequently. Please keep your attention on the interview.",
  device_change: "A new audio or video device was connected. Please use only the devices you started with.",
  typing_burst: "Very fast text entry was detected in the editor. Please type your solution yourself.",
};

function warnKey(sessionId: string): string {
  return `s:${sessionId}:warn`;
}

/**
 * Runs once per flag "occurrence" (a fresh threshold crossing, whether it created a new flag or merged
 * into an open one) — never during calibration, the caller gates that. Tier/cooldown/cap live entirely in
 * Redis so they reset naturally when the session ends. A type with no template in WARNING_MESSAGES is a
 * silent no-op: the flag still exists, the candidate is just never told.
 */
export async function evaluateWarden(sessionId: string, type: string, severity: FlagSeverity, flagId: string): Promise<void> {
  const message = WARNING_MESSAGES[type];
  if (!message) return;

  const key = warnKey(sessionId);
  const countField = `${type}:count`;
  const lastShownField = `${type}:lastShownAt`;

  const [countRaw, lastShownRaw, aboveTier1Raw] = await redis.hmget(key, countField, lastShownField, "aboveTier1");
  const now = Date.now();
  const lastShownAt = lastShownRaw ? Number(lastShownRaw) : 0;

  if (now - lastShownAt < WARDEN_COOLDOWN_MS) return;

  const occurrence = (countRaw ? Number(countRaw) : 0) + 1;
  const aboveTier1 = aboveTier1Raw ? Number(aboveTier1Raw) : 0;

  let tier: WarningTier = occurrence === 1 ? (severity === "HIGH" ? "WARNING" : "NOTICE") : occurrence === 2 ? "WARNING" : "INTERRUPT";
  if (tier !== "NOTICE" && aboveTier1 >= WARDEN_CAP_ABOVE_TIER1) {
    tier = "NOTICE";
  }

  await redis.hset(key, countField, occurrence, lastShownField, now);
  if (tier !== "NOTICE") {
    await redis.hincrby(key, "aboveTier1", 1);
  }

  const displayMessage = tier === "INTERRUPT" ? `${message} Please confirm to continue.` : message;
  const shownAt = new Date(now);
  const warning = await prisma.warning.create({
    data: { sessionId, flagId, type, tier, message: displayMessage, shownAt },
  });

  emitToCandidate(sessionId, CANDIDATE_EVENTS.WARN_SHOW, { warningId: warning.id, tier, message: warning.message });
  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.WARN_ISSUED, {
    warningId: warning.id,
    flagId,
    type,
    tier,
    message: warning.message,
    shownAt: shownAt.toISOString(),
  });

  const flag = await prisma.flag.findUnique({ where: { id: flagId } });
  if (flag) {
    await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.FLAG_UPDATE, {
      ...toFlagFrame(flag),
      warning: { tier, shownAt: shownAt.toISOString(), acknowledgedAt: null, ackLatencyMs: null },
    });
  }
}

/** `warn.ack` from the candidate: records ack latency and tells the dashboard via flag.update. */
export async function acknowledgeWarning(sessionId: string, warningId: string, ackedAt: number): Promise<void> {
  const warning = await prisma.warning.findUnique({ where: { id: warningId } });
  if (!warning || warning.sessionId !== sessionId || warning.acknowledgedAt) return;

  const acknowledgedAt = new Date(ackedAt);
  const ackLatencyMs = Math.max(0, ackedAt - warning.shownAt.getTime());
  await prisma.warning.update({ where: { id: warningId }, data: { acknowledgedAt, ackLatencyMs } });

  if (!warning.flagId) return;
  const flag = await prisma.flag.findUnique({ where: { id: warning.flagId } });
  if (!flag) return;

  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.FLAG_UPDATE, {
    ...toFlagFrame(flag),
    warning: { tier: warning.tier, shownAt: warning.shownAt.toISOString(), acknowledgedAt: acknowledgedAt.toISOString(), ackLatencyMs },
  });
}
