import { CALIBRATION_MS } from "../../config/constants.js";
import {
  applyObservation,
  computeIntegrity,
  computeIntegrityDelta,
  computeScoreFromAccumulators,
  crossedThreshold,
  projectState,
  severityBand,
  type FusionState,
} from "../../live/fusion/fusion.engine.js";
import { narrativeFor } from "../../live/fusion/flag-builder.js";
import { FLAG_MERGE_WINDOW_MS } from "../../config/detection.js";
import type { MonitoringChannel } from "../../generated/prisma/enums.js";
import { prisma } from "../../utils/prisma.js";

export type IntegrityRescoreOutput = {
  integrityScore: number;
  channels: Record<string, number>;
  observationsApplied: number;
  observationsExcludedFrozen: number;
  flagsCreated: number;
  flagsSuperseded: number;
};

/**
 * The authoritative, offline recompute (Architecture.md §6.8; flag.service.ts's live adjudicate
 * path already calls its own nudge "best-effort... Phase 10's IntegrityRescore is the authoritative
 * recompute"). Replays every observation through the exact same pure fusion functions the live
 * engine uses (`applyObservation` et al. — fusion/ never forks), in `seq` order, so with no
 * adjudications this reproduces the live score exactly. Two things change what an observation
 * contributes, both strictly *reducing* evidence, never adding any:
 *
 * 1. An observation whose channel was inside an `UnscoredWindow` at its own `ts` is excluded, same
 *    as live (`session-runtime.ts`'s `applyFusionAndFlags` skips a frozen channel's observations
 *    outright) — replaying inside a frozen window would silently un-freeze evidence the live
 *    engine deliberately never scored, which Rules.md's "no disconnection, drop or gap ever
 *    produces a positive LLR" exists to prevent.
 * 2. An observation linked to a DISMISSED flag contributes nothing; one linked to a DOWNGRADED
 *    flag contributes half its LLR — mirrors `flag.service.ts::adjudicateFlag`'s live nudge
 *    fraction (1 / 0.5) exactly, just applied to the full replay instead of a single delta.
 *
 * Calibration-window observations still accumulate (live does this too, session-runtime.ts line
 * ~196-199 — only flag *emission* is gated during calibration, not accumulation; ml/'s engine
 * gates both, a known cross-component difference, see docs/cross-component-architecture.md).
 *
 * Every flag with at least one adjudication is marked `supersededByReview` — a human review
 * decision is, by definition, what supersedes the raw live computation for that flag. A crossing
 * the replay finds with no existing flag of the same type/channel already covering that time
 * window becomes a new `origin: OFFLINE` flag; under today's inputs (adjudication only removes
 * evidence) this cannot actually happen, since removing evidence can't create a new crossing that
 * wasn't already live — the path exists and is tested for when that stops being true (a fitted
 * detector, a second replay pass, anything that changes an LLR upward at rescore time).
 */
export async function computeIntegrityRescore(sessionId: string): Promise<IntegrityRescoreOutput> {
  const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
  const sensitivity = session.sensitivity;
  const enabledChannels = new Set(session.channels);
  const calibrationEndsMs = (session.startedAt ?? session.createdAt).getTime() + CALIBRATION_MS;

  const [observations, windows, flags] = await Promise.all([
    prisma.observation.findMany({ where: { sessionId }, orderBy: { seq: "asc" } }),
    prisma.unscoredWindow.findMany({ where: { sessionId } }),
    prisma.flag.findMany({ where: { sessionId }, include: { observations: true, adjudications: true } }),
  ]);

  // observationId -> adjudication fraction to keep (1 = full, 0.5 = downgraded, 0 = dismissed).
  const keepFraction = new Map<bigint, number>();
  for (const flag of flags) {
    const fraction = flag.status === "DISMISSED" ? 0 : flag.status === "DOWNGRADED" ? 0.5 : 1;
    for (const link of flag.observations) {
      keepFraction.set(link.observationId, fraction);
    }
  }

  function isFrozenAt(channel: MonitoringChannel, tsMs: number): boolean {
    return windows.some(
      (w) => w.channel === channel && w.startTs.getTime() <= tsMs && (w.endTs === null || tsMs < w.endTs.getTime()),
    );
  }

  let state: FusionState = {};
  let observationsApplied = 0;
  let observationsExcludedFrozen = 0;
  let flagsCreated = 0;

  // type -> most recent OFFLINE flag id/endTs opened by this replay, for the same 15s merge window
  // flag-builder.ts uses live. Existing LIVE/OFFLINE flags of the same type also block a duplicate.
  const openOffline = new Map<string, { flagId: string; endTsMs: number }>();
  const existingByType = new Map<string, { startTsMs: number; endTsMs: number }[]>();
  for (const flag of flags) {
    const list = existingByType.get(flag.type) ?? [];
    list.push({ startTsMs: flag.startTs.getTime(), endTsMs: (flag.endTs ?? flag.startTs).getTime() });
    existingByType.set(flag.type, list);
  }

  for (const obs of observations) {
    if (!enabledChannels.has(obs.channel) || obs.llr === null || isFrozenAt(obs.channel, obs.ts.getTime())) {
      if (obs.llr !== null && enabledChannels.has(obs.channel)) observationsExcludedFrozen++;
      continue;
    }

    const fraction = keepFraction.get(obs.id) ?? 1;
    const effectiveLlr = obs.llr * fraction;
    const tsMs = obs.ts.getTime();
    const prevState = state;
    const result = applyObservation(state, obs.channel, effectiveLlr, tsMs);
    state = result.state;
    observationsApplied++;

    if (tsMs < calibrationEndsMs) continue; // calibration: accumulate (matches live), never flag

    if (!crossedThreshold(result.before, result.after, obs.channel, sensitivity)) continue;

    const coveredByExisting = (existingByType.get(obs.type) ?? []).some(
      (span) => tsMs >= span.startTsMs - FLAG_MERGE_WINDOW_MS && tsMs <= span.endTsMs + FLAG_MERGE_WINDOW_MS,
    );
    const openOfflineFlag = openOffline.get(obs.type);
    const coveredByOpenOffline = openOfflineFlag !== undefined && tsMs - openOfflineFlag.endTsMs <= FLAG_MERGE_WINDOW_MS;
    if (coveredByExisting || coveredByOpenOffline) continue;

    const { scoreDelta } = computeIntegrityDelta(
      prevState,
      obs.channel,
      result.before,
      result.after,
      tsMs,
      sensitivity,
      new Set(),
    );
    const created = await prisma.$transaction(async (tx) => {
      const flag = await tx.flag.create({
        data: {
          sessionId,
          origin: "OFFLINE",
          type: obs.type,
          channel: obs.channel,
          corroboratingChannels: result.corroboratingChannels,
          severity: severityBand(result.after, obs.channel, sensitivity),
          status: "OPEN",
          narrative: narrativeFor(obs.type, obs.payload as Record<string, unknown>),
          startTs: obs.ts,
          endTs: obs.ts,
          scoreDelta,
        },
      });
      await tx.flagObservation.create({ data: { flagId: flag.id, observationId: obs.id } });
      return flag;
    });
    openOffline.set(obs.type, { flagId: created.id, endTsMs: tsMs });
    flagsCreated++;
  }

  const frozenNow = new Set<MonitoringChannel>(); // finalise treats nothing as still-frozen; open windows without endTs are rare edge cases, not modelled here
  // Project decay to the session's own end, not wall-clock run time — otherwise this "authoritative"
  // score would keep drifting lower the longer it sits queued or the later someone recomputes it,
  // breaking the "every score is reconstructable" guarantee (Rules.md/PRD).
  const rescoredAt = (session.endedAt ?? new Date()).getTime();
  const finalAccumulators = projectState(state, rescoredAt, frozenNow);
  const integrityScore = computeIntegrity(computeScoreFromAccumulators(finalAccumulators, frozenNow), sensitivity);

  const flagsToSupersede = flags.filter((f) => f.adjudications.length > 0 && !f.supersededByReview).map((f) => f.id);
  if (flagsToSupersede.length > 0) {
    await prisma.flag.updateMany({ where: { id: { in: flagsToSupersede } }, data: { supersededByReview: true } });
  }

  return {
    integrityScore,
    channels: Object.fromEntries(Object.entries(finalAccumulators)),
    observationsApplied,
    observationsExcludedFrozen,
    flagsCreated,
    flagsSuperseded: flagsToSupersede.length,
  };
}
