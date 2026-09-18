import {
  CHANNEL_DECAY_SECONDS,
  CHANNEL_FLOOR,
  CHANNEL_THRESHOLDS,
  CHANNEL_WEIGHTS,
  CORROBORATION_MAX_MULTIPLIER,
  CORROBORATION_STEP,
  CORROBORATION_WINDOW_MS,
  FUSION_SIGMA,
  SEVERITY_BAND_HIGH_MULTIPLIER,
  SEVERITY_BAND_MEDIUM_MULTIPLIER,
} from "../../config/detection.js";
import type { FlagSeverity, MonitoringChannel, Sensitivity } from "../../generated/prisma/enums.js";

type ChannelState = {
  accumulator: number;
  lastTs: number;
  /** Most recent positive-evidence timestamp on this channel, for the corroboration window. */
  lastPositiveAt: number | null;
};

export type FusionState = Partial<Record<MonitoringChannel, ChannelState>>;

export type ApplyResult = {
  state: FusionState;
  /** Accumulator value for the touched channel before this observation was applied. */
  before: number;
  /** Accumulator value for the touched channel after. */
  after: number;
  /** How many distinct channels (including this one) had positive evidence in the corroboration window. */
  corroboratingCount: number;
  /** The other channels that corroborated this observation (Flag.corroboratingChannels). */
  corroboratingChannels: MonitoringChannel[];
};

function emptyChannelState(): ChannelState {
  return { accumulator: 0, lastTs: 0, lastPositiveAt: null };
}

function decay(value: number, elapsedMs: number, tauSeconds: number): number {
  if (elapsedMs <= 0) return value;
  return value * Math.exp(-elapsedMs / 1000 / tauSeconds);
}

/**
 * Applies one observation's LLR to its channel: decay-to-now, corroboration boost on positive evidence,
 * add, floor (Architecture.md §6.4 steps 1-3). Pure — the caller persists `state` (Redis checkpoint) and
 * decides what to do with `before`/`after` (score delta, flag threshold crossing).
 */
export function applyObservation(state: FusionState, channel: MonitoringChannel, llr: number, tsMs: number): ApplyResult {
  const next: FusionState = { ...state };
  const current = next[channel] ?? emptyChannelState();
  const tau = CHANNEL_DECAY_SECONDS[channel];

  const decayed = decay(current.accumulator, tsMs - current.lastTs, tau);
  const before = decayed;

  let corroboratingCount = 1;
  const corroboratingChannels: MonitoringChannel[] = [];
  let appliedLlr = llr;

  if (llr > 0) {
    for (const [otherChannel, otherState] of Object.entries(next) as Array<[MonitoringChannel, ChannelState]>) {
      if (otherChannel === channel) continue;
      if (otherState.lastPositiveAt !== null && tsMs - otherState.lastPositiveAt <= CORROBORATION_WINDOW_MS) {
        corroboratingCount++;
        corroboratingChannels.push(otherChannel);
      }
    }
    const multiplier = Math.min(CORROBORATION_MAX_MULTIPLIER, 1 + CORROBORATION_STEP * (corroboratingCount - 1));
    appliedLlr = llr * multiplier;
  }

  const after = Math.max(CHANNEL_FLOOR, decayed + appliedLlr);

  next[channel] = {
    accumulator: after,
    lastTs: tsMs,
    lastPositiveAt: llr > 0 ? tsMs : current.lastPositiveAt,
  };

  return { state: next, before, after, corroboratingCount, corroboratingChannels };
}

/** Decays every channel to `now` without mutating the stored state — for display ticks (Design.md §5.2). */
export function projectState(state: FusionState, nowMs: number, frozenChannels: ReadonlySet<MonitoringChannel>): Partial<Record<MonitoringChannel, number>> {
  const projected: Partial<Record<MonitoringChannel, number>> = {};
  for (const [channel, channelState] of Object.entries(state) as Array<[MonitoringChannel, ChannelState]>) {
    if (frozenChannels.has(channel)) {
      projected[channel] = channelState.accumulator;
      continue;
    }
    const tau = CHANNEL_DECAY_SECONDS[channel];
    projected[channel] = decay(channelState.accumulator, nowMs - channelState.lastTs, tau);
  }
  return projected;
}

/** S = sum(weight_c * A_c) over scored (non-frozen) channels; unscored channels contribute 0. */
export function computeScoreFromAccumulators(accumulators: Partial<Record<MonitoringChannel, number>>, frozenChannels: ReadonlySet<MonitoringChannel>): number {
  let sum = 0;
  for (const [channel, value] of Object.entries(accumulators) as Array<[MonitoringChannel, number]>) {
    if (frozenChannels.has(channel)) continue;
    sum += CHANNEL_WEIGHTS[channel] * value;
  }
  return sum;
}

/** integrity = min(100, 200 / (1 + exp(S / sigma))) (Architecture.md §6.4 step 4). */
export function computeIntegrity(score: number, sensitivity: Sensitivity): number {
  return Math.min(100, 200 / (1 + Math.exp(score / FUSION_SIGMA[sensitivity])));
}

/** LOW/MEDIUM/HIGH band from how far the accumulator sits above its channel's threshold. */
export function severityBand(accumulator: number, channel: MonitoringChannel, sensitivity: Sensitivity): FlagSeverity {
  const threshold = CHANNEL_THRESHOLDS[channel][sensitivity];
  if (accumulator >= threshold * SEVERITY_BAND_HIGH_MULTIPLIER) return "HIGH";
  if (accumulator >= threshold * SEVERITY_BAND_MEDIUM_MULTIPLIER) return "MEDIUM";
  return "LOW";
}

export function crossedThreshold(before: number, after: number, channel: MonitoringChannel, sensitivity: Sensitivity): boolean {
  const threshold = CHANNEL_THRESHOLDS[channel][sensitivity];
  return before < threshold && after >= threshold;
}

/**
 * integrity before/after this single observation, holding every other channel fixed at its own
 * decay-to-now value (Architecture.md §6.4 step 5: `scoreDelta = integrityBefore - integrityAfter`).
 * `prevState` is the state as it stood *before* `applyObservation` touched `channel`.
 */
export function computeIntegrityDelta(
  prevState: FusionState,
  channel: MonitoringChannel,
  before: number,
  after: number,
  tsMs: number,
  sensitivity: Sensitivity,
  frozenChannels: ReadonlySet<MonitoringChannel>,
): { integrityBefore: number; integrityAfter: number; scoreDelta: number } {
  const projectedOthers = projectState(prevState, tsMs, frozenChannels);
  delete projectedOthers[channel];
  const scoreOthers = computeScoreFromAccumulators(projectedOthers, frozenChannels);
  const touchedWeight = frozenChannels.has(channel) ? 0 : CHANNEL_WEIGHTS[channel];

  const integrityBefore = computeIntegrity(scoreOthers + touchedWeight * before, sensitivity);
  const integrityAfter = computeIntegrity(scoreOthers + touchedWeight * after, sensitivity);
  return { integrityBefore, integrityAfter, scoreDelta: integrityBefore - integrityAfter };
}
