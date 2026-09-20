/**
 * SERVER-ONLY: adopts the ML lab's fitted calibration curves as LLR_TABLE magnitudes.
 *
 * This is the seam `docs/cross-component-architecture.md` describes: `ml/` is the offline
 * calibration lab "whose output the backend is meant to start consuming", and
 * `contracts/detector-registry.json`'s `typeMapping` was written as documentation for whoever
 * built it. This module is that consumer. It does not call Python, import anything from `ml/`,
 * or move scoring to a second engine — it reads one JSON artifact at startup.
 *
 * **Off by default.** `CALIBRATED_WEIGHTS_ENABLED` gates it, so a checkout with the artifact
 * present scores exactly as it did before this module existed. Turning it on changes live
 * scores, which `CLAUDE.md` requires asking about first; the flag is where that decision lives
 * rather than in a constant someone edited.
 *
 * **Loud when on.** With the flag on, an artifact that cannot be loaded throws instead of falling
 * back to the hand-set table, and so does an unreadable contract file (Node's own error names the
 * path). A fallback would score on priors while every setting says "calibrated", which is worse than
 * not starting. `index.ts` calls `getCalibrationReport()` at boot so the throw stops the process
 * there, not on the first live observation. With the flag off nothing is read and a missing artifact
 * is fine.
 *
 * **What is adopted, and what is not.** The artifact carries a curve over the *detector's raw
 * confidence*. The backend's detectors emit a `strength` in 0..1 and throw it away (see
 * `live/detectors/types.ts`), so feeding `strength` into the curve looks tempting and is wrong:
 * backend `strength` is a normalised magnitude (`insertedChars / 2000`, `durationMs / 30_000`),
 * not a detector's probabilistic confidence, and the curve was never fitted against it. So only
 * the curve's *magnitude at its operating point* (`reference_llr`, the LLR for a typical true
 * detection) is adopted, replacing the hand-set STANDARD value. Wiring `strength` through a
 * curve needs the two quantities reconciled first, which is a separate piece of work.
 *
 * **Sensitivity.** The lab fits against its own STANDARD preset, so a calibrated value is a
 * STANDARD value. LOW and HIGH keep their hand-set *ratios* to STANDARD rather than being
 * replaced or left at absolute values that no longer relate to it — the sensitivity spread is a
 * product decision the lab says nothing about, and preserving the ratio keeps it intact.
 *
 * **Many-to-one.** Several ml types collapse onto one backend type (three gaze types all map to
 * `gaze_away`). A backend type is only overridden when exactly one *fitted* ml type maps to it;
 * otherwise there is no defensible way to merge two curves into one number, and the hand-set
 * value stands with the reason recorded.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Sensitivity } from "../generated/prisma/enums.js";
import { logger } from "../utils/logger.js";
import { LLR_TABLE } from "./detection.js";
import { env } from "./env.js";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * `backend/src/config` and `backend/dist/config` both resolve to the repo root. In the container
 * image `backend/` is `/app`, so this is `/`, and the Dockerfile copies the two files this module
 * reads to `/ml/weights/` and `/contracts/` to match.
 */
const repoRoot = resolve(here, "..", "..", "..");

const DEFAULT_ARTIFACT_PATH = join(repoRoot, "ml", "weights", "weights.json");
const CONTRACT_PATH = join(repoRoot, "contracts", "detector-registry.json");

/**
 * Mirrors `ml/src/vtml/weights.py`. Deliberately `passthrough`-free and non-strict on the fields
 * this module does not read: the artifact is allowed to grow without breaking a backend that only
 * needs the curve.
 */
const fittedCurveSchema = z.object({
  intercept: z.number(),
  slope: z.number(),
  confidence_min: z.number(),
  confidence_max: z.number(),
  n_positives: z.number().int(),
  n_negatives: z.number().int(),
  positive_confidence_median: z.number(),
});

const detectorWeightSchema = z.object({
  source: z.enum(["fitted", "prior"]),
  channel: z.string(),
  prior: z.number(),
  curve: fittedCurveSchema.nullable().default(null),
  reason: z.string().nullable().default(null),
});

const weightsFileSchema = z.object({
  schema_version: z.number().int(),
  version: z.string(),
  dataset: z.object({
    kind: z.enum(["synthetic", "recorded", "mixed"]),
    sessions: z.array(z.string()),
    n_rows: z.number().int(),
    n_positives: z.number().int(),
    match_tolerance_ms: z.number().int(),
  }),
  detectors: z.record(z.string(), detectorWeightSchema),
  rejected: z.record(z.string(), z.string()).default({}),
});

export type CalibratedWeightsFile = z.infer<typeof weightsFileSchema>;

/** The schema version this backend understands. A newer artifact is refused, not guessed at. */
export const SUPPORTED_WEIGHTS_SCHEMA_VERSION = 1;

export type CalibratedEntry = {
  backendType: string;
  mlType: string;
  /** The LLR the lab's curve gives for a typical true detection. */
  referenceLlr: number;
  /** What LLR_TABLE had for this type at STANDARD, before the override. */
  handSetStandard: number;
  bySensitivity: Record<Sensitivity, number>;
};

export type CalibrationReport = {
  enabled: boolean;
  /** Null only when disabled: an enabled report that cannot load its artifact throws instead. */
  weightsVersion: string | null;
  datasetKind: CalibratedWeightsFile["dataset"]["kind"] | null;
  adopted: CalibratedEntry[];
  /** Backend type or ml type -> why it was not adopted. */
  skipped: Record<string, string>;
};

const EMPTY_REPORT: CalibrationReport = {
  enabled: false,
  weightsVersion: null,
  datasetKind: null,
  adopted: [],
  skipped: {},
};

/** Only reached with the flag on, so there is no quiet way to carry on: name what is wrong and stop. */
function refuse(problem: string, cause?: unknown): never {
  const detail = cause instanceof Error ? `: ${cause.message}` : "";
  throw new Error(
    `CALIBRATED_WEIGHTS_ENABLED is on but ${problem}${detail}. Ship the file, or set ` +
      "CALIBRATED_WEIGHTS_ENABLED=false to score on the hand-set LLR_TABLE.",
    { cause },
  );
}

function readTypeMapping(): Record<string, string | null> {
  const raw = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as {
    typeMapping?: Record<string, string | null>;
  };
  return raw.typeMapping ?? {};
}

/**
 * Scales an adopted STANDARD value out to LOW and HIGH by the ratios the hand-set row used, so a
 * calibrated magnitude does not flatten the sensitivity spread. The ratio divides by the hand-set
 * STANDARD, so a value at or below zero would divide by zero or flip the signs of LOW and HIGH.
 * Nothing reaches that today (the negative clean-behaviour rows are not in the contract's
 * `typeMapping`), but the safety should not live only in the caller: such a row comes back as
 * hand-set, unscaled, with a warning.
 */
export function scaleBySensitivity(
  handSet: Record<Sensitivity, number>,
  calibratedStandard: number,
): Record<Sensitivity, number> {
  if (handSet.STANDARD <= 0) {
    logger.warn(
      { handSetStandard: handSet.STANDARD },
      "calibrated weights: hand-set STANDARD is not positive, so LOW and HIGH cannot be scaled from it; keeping the hand-set row",
    );
    return { ...handSet };
  }
  const factor = calibratedStandard / handSet.STANDARD;
  return {
    LOW: handSet.LOW * factor,
    STANDARD: calibratedStandard,
    HIGH: handSet.HIGH * factor,
  };
}

/**
 * Builds the override table. Pure apart from reading the two files, so a test can point it at a
 * fixture artifact instead of the committed one.
 */
export function buildCalibrationReport(
  artifactPath: string = DEFAULT_ARTIFACT_PATH,
  enabled: boolean = env.CALIBRATED_WEIGHTS_ENABLED,
): CalibrationReport {
  if (!enabled) return EMPTY_REPORT;

  let parsed: CalibratedWeightsFile;
  try {
    parsed = weightsFileSchema.parse(JSON.parse(readFileSync(artifactPath, "utf8")));
  } catch (error) {
    return refuse(`the artifact at ${artifactPath} is missing, unreadable or invalid`, error);
  }

  if (parsed.schema_version !== SUPPORTED_WEIGHTS_SCHEMA_VERSION) {
    return refuse(
      `the artifact at ${artifactPath} has schema_version ${parsed.schema_version} and this ` +
        `backend supports ${SUPPORTED_WEIGHTS_SCHEMA_VERSION}`,
    );
  }

  const typeMapping = readTypeMapping();
  const skipped: Record<string, string> = {};

  // Which backend types more than one *fitted* ml type maps to. Counted before anything is
  // adopted, so the decision does not depend on iteration order.
  const fittedByBackendType = new Map<string, string[]>();
  for (const [mlType, entry] of Object.entries(parsed.detectors)) {
    if (entry.source !== "fitted" || entry.curve === null) continue;
    const backendType = typeMapping[mlType];
    if (backendType === undefined) {
      skipped[mlType] = "not in contracts/detector-registry.json typeMapping";
      continue;
    }
    if (backendType === null) {
      skipped[mlType] = "maps to no backend type by design (network channel is never scored)";
      continue;
    }
    fittedByBackendType.set(backendType, [...(fittedByBackendType.get(backendType) ?? []), mlType]);
  }

  const adopted: CalibratedEntry[] = [];
  for (const [backendType, mlTypes] of fittedByBackendType) {
    if (mlTypes.length > 1) {
      skipped[backendType] =
        `${mlTypes.length} fitted ml types map to it (${mlTypes.sort().join(", ")}); ` +
        "no defensible way to merge their curves into one value";
      continue;
    }
    const mlType = mlTypes[0]!;
    const handSet = LLR_TABLE[backendType];
    if (handSet === undefined) {
      skipped[backendType] = "no LLR_TABLE row to override";
      continue;
    }
    const curve = parsed.detectors[mlType]!.curve!;
    const referenceLlr = curve.intercept + curve.slope * curve.positive_confidence_median;
    if (!Number.isFinite(referenceLlr) || referenceLlr <= 0) {
      // detection.ts's sign convention: positive LLR is evidence of misconduct. A fitted value
      // at or below zero for a misconduct detector is a broken fit, not a lenient one.
      skipped[backendType] = `fitted reference LLR ${referenceLlr} is not usable as evidence`;
      continue;
    }
    adopted.push({
      backendType,
      mlType,
      referenceLlr,
      handSetStandard: handSet.STANDARD,
      bySensitivity: scaleBySensitivity(handSet, referenceLlr),
    });
  }

  adopted.sort((a, b) => a.backendType.localeCompare(b.backendType));
  return {
    enabled: true,
    weightsVersion: parsed.version,
    datasetKind: parsed.dataset.kind,
    adopted,
    skipped,
  };
}

let cached: CalibrationReport | null = null;

/** Read once per process: the artifact is a build input, not something that changes at runtime. */
export function getCalibrationReport(): CalibrationReport {
  if (cached === null) {
    cached = buildCalibrationReport();
    if (cached.enabled) {
      logger.info(
        {
          weightsVersion: cached.weightsVersion,
          datasetKind: cached.datasetKind,
          adopted: cached.adopted.map((entry) => entry.backendType),
          skipped: Object.keys(cached.skipped),
        },
        cached.datasetKind === "synthetic"
          ? "calibrated weights active, fitted on SYNTHETIC fixtures: these curves are not evidence about real behaviour"
          : "calibrated weights active",
      );
    }
  }
  return cached;
}

/**
 * The calibrated LLR for a type, or null when it is not overridden. `getLlr()` in detection.ts
 * consults this before the hand-set table.
 */
export function getCalibratedLlr(type: string, sensitivity: Sensitivity): number | null {
  const report = getCalibrationReport();
  if (!report.enabled) return null;
  const entry = report.adopted.find((candidate) => candidate.backendType === type);
  return entry === undefined ? null : entry.bySensitivity[sensitivity];
}

/** For the report's methodology appendix and `/ready`: which LLRs a session actually scored with. */
export function getCalibrationProvenance(): {
  weightsVersion: string | null;
  datasetKind: string | null;
  calibratedTypes: string[];
} {
  const report = getCalibrationReport();
  return {
    weightsVersion: report.weightsVersion,
    datasetKind: report.datasetKind,
    calibratedTypes: report.adopted.map((entry) => entry.backendType),
  };
}
