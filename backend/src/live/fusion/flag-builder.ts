import { FLAG_MERGE_WINDOW_MS } from "../../config/detection.js";
import type { Flag } from "../../generated/prisma/client.js";
import type { MonitoringChannel, Sensitivity } from "../../generated/prisma/enums.js";
import { emitToInterviewers } from "../../sockets/emitter.js";
import { INTERVIEWER_EVENTS } from "../../sockets/events.js";
import { prisma } from "../../utils/prisma.js";
import { crossedThreshold, severityBand } from "./fusion.engine.js";

/** Interviewer-only narrative templates — never candidate-facing, but still neutral and factual. */
const NARRATIVE_TEMPLATES: Record<string, (payload: Record<string, unknown>) => string> = {
  focus_loss: (p) => `The interview window lost focus for ${Math.round(((p.durationMs as number) ?? 0) / 1000)}s.`,
  visibility_loss: (p) => `The interview tab was hidden for ${Math.round(((p.durationMs as number) ?? 0) / 1000)}s.`,
  paste_large: (p) => `A ${(p.length as number) ?? "large"}-character paste was detected.`,
  rhythm_anomaly: () => "Typing rhythm deviated from the candidate's calibrated baseline.",
  pointer_leave: (p) => `The pointer left the interview window for ${Math.round(((p.durationMs as number) ?? 0) / 1000)}s.`,
  multi_screen: () => "Multiple or extended displays were detected.",
  device_change: (p) => `A ${(p.deviceKind as string) ?? "media"} device was ${(p.change as string) ?? "changed"}.`,
  network_anomaly: () => "A network connectivity anomaly was detected.",
  face_absent: () => "The candidate's face was not visible to the camera.",
  multiple_faces: () => "More than one face was visible on camera.",
  gaze_away: () => "The candidate appeared to look away from the screen frequently.",
  second_voice: () => "A second voice was detected.",
};

/** Exported for pipeline/steps/integrity-rescore.step.ts, which builds OFFLINE-origin flags outside this module's live merge/emit path but wants the same narrative templates, not a second copy. */
export function narrativeFor(type: string, payload: Record<string, unknown>): string {
  const template = NARRATIVE_TEMPLATES[type];
  return template ? template(payload) : `Anomalous ${type.replace(/_/g, " ")} activity was detected.`;
}

export type FlagCrossingInput = {
  sessionId: string;
  observationId: bigint;
  channel: MonitoringChannel;
  type: string;
  ts: Date;
  before: number;
  after: number;
  corroboratingChannels: MonitoringChannel[];
  scoreDelta: number;
  sensitivity: Sensitivity;
  payload: Record<string, unknown>;
};

export type FlagCrossingResult = { flag: Flag; isNew: boolean };

function toFlagFrame(flag: Flag): Record<string, unknown> {
  return {
    id: flag.id,
    type: flag.type,
    channel: flag.channel,
    corroboratingChannels: flag.corroboratingChannels,
    severity: flag.severity,
    status: flag.status,
    origin: flag.origin,
    narrative: flag.narrative,
    startTs: flag.startTs.toISOString(),
    endTs: flag.endTs?.toISOString() ?? null,
    mediaOffsetMs: flag.mediaOffsetMs,
    scoreDelta: flag.scoreDelta,
    mergedCount: flag.mergedCount,
    supersededByReview: flag.supersededByReview,
  };
}

/**
 * Called for every non-frozen, non-calibrating observation (Architecture.md §6.4 steps 5-6). A repeat
 * of the same `type` within 15s of an open flag always merges into it, whether or not the accumulator
 * re-crossed the threshold this time. Otherwise a new flag is only created on an actual upward crossing
 * — never called during calibration (Rules.md §9.2) — the caller gates that.
 */
export async function processFlagCrossing(input: FlagCrossingInput): Promise<FlagCrossingResult | null> {
  const severity = severityBand(input.after, input.channel, input.sensitivity);
  const mergeWindowStart = new Date(input.ts.getTime() - FLAG_MERGE_WINDOW_MS);

  const existing = await prisma.flag.findFirst({
    where: { sessionId: input.sessionId, type: input.type, status: "OPEN", updatedAt: { gte: mergeWindowStart } },
    orderBy: { updatedAt: "desc" },
  });

  if (!existing && !crossedThreshold(input.before, input.after, input.channel, input.sensitivity)) return null;

  if (existing) {
    const updated = await prisma.$transaction(async (tx) => {
      const flag = await tx.flag.update({
        where: { id: existing.id },
        data: {
          endTs: input.ts,
          mergedCount: { increment: 1 },
          scoreDelta: existing.scoreDelta + input.scoreDelta,
          severity,
        },
      });
      await tx.flagObservation.create({ data: { flagId: flag.id, observationId: input.observationId } });
      return flag;
    });
    await emitToInterviewers(input.sessionId, INTERVIEWER_EVENTS.FLAG_UPDATE, toFlagFrame(updated));
    return { flag: updated, isNew: false };
  }

  const created = await prisma.$transaction(async (tx) => {
    const flag = await tx.flag.create({
      data: {
        sessionId: input.sessionId,
        origin: "LIVE",
        type: input.type,
        channel: input.channel,
        corroboratingChannels: input.corroboratingChannels,
        severity,
        status: "OPEN",
        narrative: narrativeFor(input.type, input.payload),
        startTs: input.ts,
        endTs: input.ts,
        scoreDelta: input.scoreDelta,
      },
    });
    await tx.flagObservation.create({ data: { flagId: flag.id, observationId: input.observationId } });
    return flag;
  });
  await emitToInterviewers(input.sessionId, INTERVIEWER_EVENTS.FLAG_NEW, toFlagFrame(created));
  return { flag: created, isNew: true };
}

export { toFlagFrame };
