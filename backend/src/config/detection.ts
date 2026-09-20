/**
 * SERVER-ONLY: LLR tables, channel weights, decay and fusion tunables (Architecture.md §6.4).
 * Never sent to clients. Detectors emit {channel, type, strength}; this module maps a detector's
 * `type` and the session's sensitivity to a calibrated log-likelihood ratio.
 */
import type { MonitoringChannel, Sensitivity } from "../generated/prisma/enums.js";
import { logger } from "../utils/logger.js";
import { getCalibratedLlr } from "./calibrated-weights.js";

export const DETECTOR_VERSION = "2026.09.1";
export const WEIGHTS_VERSION = "2026.09.1";

type BySensitivity = Record<Sensitivity, number>;

/** Positive LLR = evidence of misconduct. Negative LLR = clean-behaviour evidence pulling the score back up. */
export const LLR_TABLE: Record<string, BySensitivity> = {
  focus_loss: { LOW: 0.8, STANDARD: 1.2, HIGH: 1.8 },
  visibility_loss: { LOW: 0.8, STANDARD: 1.2, HIGH: 1.8 },
  paste_large: { LOW: 1.0, STANDARD: 1.6, HIGH: 2.2 },
  rhythm_anomaly: { LOW: 0.9, STANDARD: 1.4, HIGH: 2.0 },
  pointer_leave: { LOW: 0.5, STANDARD: 0.8, HIGH: 1.2 },
  multi_screen: { LOW: 0.9, STANDARD: 1.3, HIGH: 1.9 },
  device_change: { LOW: 0.6, STANDARD: 1.0, HIGH: 1.5 },
  network_anomaly: { LOW: 0.4, STANDARD: 0.6, HIGH: 0.9 },
  face_absent: { LOW: 0.9, STANDARD: 1.4, HIGH: 2.0 },
  multiple_faces: { LOW: 1.1, STANDARD: 1.7, HIGH: 2.3 },
  gaze_away: { LOW: 0.7, STANDARD: 1.1, HIGH: 1.6 },
  foreign_object: { LOW: 1.0, STANDARD: 1.6, HIGH: 2.2 },
  second_voice: { LOW: 1.0, STANDARD: 1.5, HIGH: 2.1 },
  // Phase 8: authorship detector (editor.delta), reusing the PASTE/RHYTHM channels — no dedicated channel exists.
  typed_ratio_low: { LOW: 0.9, STANDARD: 1.4, HIGH: 2.0 },
  typing_burst: { LOW: 0.8, STANDARD: 1.3, HIGH: 1.9 },
  // Clean-behaviour observations: always negative, not scaled by sensitivity.
  focus_resume: { LOW: -0.4, STANDARD: -0.4, HIGH: -0.4 },
  pointer_return: { LOW: -0.2, STANDARD: -0.2, HIGH: -0.2 },
  rhythm_normal: { LOW: -0.3, STANDARD: -0.3, HIGH: -0.3 },
};

/**
 * Detector types this process has already warned about, so a repeatedly-misbehaving producer logs
 * once per type instead of flooding — but every occurrence still counts (see
 * `unknownDetectorTypeCounts`), since a silently-zeroed observation on an integrity score is the
 * kind of thing that needs to be countable, not just loggable.
 */
const warnedUnknownTypes = new Set<string>();
const unknownTypeCounts = new Map<string, number>();

/**
 * Returns null for a `type` with no LLR_TABLE row: unscorable, not clean. Callers store it as
 * `Observation.llr = null`, which live fusion and the offline rescore both skip, so the observation
 * stays in the evidence chain and adds nothing to the score. Known limit: only the row, the log and
 * `getUnknownDetectorTypeCounts()` show it, nothing on the dashboard does. Not thrown: the CV path
 * builds a whole request's observations in one pass, so one unknown type would reject all of them.
 */
export function getLlr(type: string, sensitivity: Sensitivity): number | null {
  // The ML lab's fitted curve for this type, when calibrated weights are enabled (off by
  // default, so this returns null and nothing below changes). Consulted before the hand-set row
  // rather than replacing it: only the handful of types with an accepted fit are overridden, and
  // an unknown type still falls through to the warn-and-null path below.
  const calibrated = getCalibratedLlr(type, sensitivity);
  if (calibrated !== null) return calibrated;

  const row = LLR_TABLE[type];
  if (row === undefined) {
    unknownTypeCounts.set(type, (unknownTypeCounts.get(type) ?? 0) + 1);
    if (!warnedUnknownTypes.has(type)) {
      warnedUnknownTypes.add(type);
      logger.warn(
        { detectorType: type, sensitivity },
        "getLlr: unrecognised detector type, returning null (observation stored, excluded from scoring). " +
          "Check contracts/detector-registry.json — the sender's vocabulary may not match LLR_TABLE.",
      );
    }
    return null;
  }
  return row[sensitivity];
}

/** For health checks / diagnostics: detector types seen that have no LLR_TABLE row, and how often. */
export function getUnknownDetectorTypeCounts(): ReadonlyMap<string, number> {
  return unknownTypeCounts;
}

export const CHANNEL_WEIGHTS: Record<MonitoringChannel, number> = {
  GAZE: 1.0,
  FACE: 1.0,
  IDENTITY: 1.2,
  SCENE: 0.8,
  AUDIO: 1.0,
  SCREEN: 1.0,
  FOCUS: 0.7,
  PASTE: 1.1,
  RHYTHM: 0.9,
  POINTER: 0.5,
  ENVIRONMENT: 0.6,
};

/** τ per channel in seconds — Architecture.md §6.4 step 2. */
export const CHANNEL_DECAY_SECONDS: Record<MonitoringChannel, number> = {
  GAZE: 180,
  AUDIO: 300,
  SCENE: 240,
  FACE: 180,
  IDENTITY: 240,
  SCREEN: 180,
  FOCUS: 300,
  PASTE: 240,
  RHYTHM: 240,
  POINTER: 180,
  ENVIRONMENT: 240,
};

/** Accumulator floor so old negative evidence can't make a channel look permanently spotless. */
export const CHANNEL_FLOOR = -2;

/** Threshold θ_c(sensitivity) above which a channel accumulator crossing upward creates a flag (Phase 7). */
export const CHANNEL_THRESHOLDS: Record<MonitoringChannel, BySensitivity> = {
  GAZE: { LOW: 4, STANDARD: 3, HIGH: 2 },
  AUDIO: { LOW: 4, STANDARD: 3, HIGH: 2 },
  SCENE: { LOW: 4, STANDARD: 3, HIGH: 2 },
  FACE: { LOW: 4, STANDARD: 3, HIGH: 2 },
  IDENTITY: { LOW: 3, STANDARD: 2.5, HIGH: 2 },
  SCREEN: { LOW: 4, STANDARD: 3, HIGH: 2 },
  FOCUS: { LOW: 4, STANDARD: 3, HIGH: 2 },
  PASTE: { LOW: 3, STANDARD: 2.5, HIGH: 2 },
  RHYTHM: { LOW: 4, STANDARD: 3, HIGH: 2 },
  POINTER: { LOW: 5, STANDARD: 4, HIGH: 3 },
  ENVIRONMENT: { LOW: 5, STANDARD: 4, HIGH: 3 },
};

export const FUSION_SIGMA: BySensitivity = { LOW: 6, STANDARD: 4, HIGH: 3 };

export const CORROBORATION_WINDOW_MS = 6000;
export const CORROBORATION_MAX_MULTIPLIER = 2.35;
export const CORROBORATION_STEP = 0.45;

export const FLAG_MERGE_WINDOW_MS = 15_000;

/** Severity band = how far the accumulator sits above its channel's crossing threshold. */
export const SEVERITY_BAND_MEDIUM_MULTIPLIER = 1.5;
export const SEVERITY_BAND_HIGH_MULTIPLIER = 2.5;
