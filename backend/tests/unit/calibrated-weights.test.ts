import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../contracts/detector-registry.json" with { type: "json" };
import mlWeights from "../../../ml/weights/weights.json" with { type: "json" };
import {
  buildCalibrationReport,
  SUPPORTED_WEIGHTS_SCHEMA_VERSION,
} from "../../src/config/calibrated-weights.js";
import { LLR_TABLE } from "../../src/config/detection.js";

/**
 * The backend/ml seam: `ml/weights/weights.json` adopted as LLR_TABLE magnitudes.
 *
 * Every test here builds the report explicitly rather than going through `getLlr()`, because the
 * feature is off by default and `getLlr()`'s cached read is process-wide — a test that flipped it
 * would leak into every other test file in the worker.
 */

const ARTIFACT = join(import.meta.dirname, "..", "..", "..", "ml", "weights", "weights.json");

function writeArtifact(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "vt-weights-"));
  const path = join(dir, "weights.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

/** A minimal valid artifact with one fitted curve, for the cases the real one cannot produce. */
function artifactWith(detectors: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: SUPPORTED_WEIGHTS_SCHEMA_VERSION,
    version: "test-1",
    dataset: {
      kind: "synthetic",
      sessions: ["s1"],
      n_rows: 100,
      n_positives: 20,
      match_tolerance_ms: 5000,
    },
    channel_weights: {},
    detectors,
    rejected: {},
    ...overrides,
  };
}

function fittedCurve(overrides: Record<string, number> = {}) {
  return {
    intercept: -1.0,
    slope: 3.0,
    confidence_min: 0.25,
    confidence_max: 1.0,
    n_positives: 20,
    n_negatives: 60,
    positive_confidence_median: 0.8,
    ...overrides,
  };
}

describe("calibrated weights: the flag", () => {
  it("is inert when disabled, whatever the artifact says", () => {
    const report = buildCalibrationReport(ARTIFACT, false);
    expect(report.enabled).toBe(false);
    expect(report.adopted).toEqual([]);
    expect(report.weightsVersion).toBeNull();
  });

  it("adopts curves from the committed artifact when enabled", () => {
    const report = buildCalibrationReport(ARTIFACT, true);
    expect(report.enabled).toBe(true);
    expect(report.weightsVersion).toBe(mlWeights.version);
    expect(report.adopted.length).toBeGreaterThan(0);
  });
});

describe("calibrated weights: what gets adopted", () => {
  const report = buildCalibrationReport(ARTIFACT, true);

  it("only overrides a backend type that has an LLR_TABLE row", () => {
    for (const entry of report.adopted) {
      expect(LLR_TABLE).toHaveProperty(entry.backendType);
    }
  });

  it("maps through the contract's typeMapping and nothing else", () => {
    const mapping = contract.typeMapping as Record<string, string | null>;
    for (const entry of report.adopted) {
      expect(mapping[entry.mlType]).toBe(entry.backendType);
    }
  });

  it("adopts only ml types the artifact actually fitted", () => {
    const fitted = Object.entries(mlWeights.detectors)
      .filter(([, value]) => (value as { source: string }).source === "fitted")
      .map(([key]) => key);
    for (const entry of report.adopted) {
      expect(fitted).toContain(entry.mlType);
    }
  });

  it("never adopts a rejected fit", () => {
    const rejected = Object.keys(mlWeights.rejected ?? {});
    for (const entry of report.adopted) {
      expect(rejected).not.toContain(entry.mlType);
    }
  });

  it("uses the curve's operating point, not an end of its confidence range", () => {
    for (const entry of report.adopted) {
      const curve = (mlWeights.detectors as Record<string, { curve: ReturnType<typeof fittedCurve> }>)[
        entry.mlType
      ]!.curve;
      const expected = curve.intercept + curve.slope * curve.positive_confidence_median;
      expect(entry.referenceLlr).toBeCloseTo(expected, 10);
      expect(entry.bySensitivity.STANDARD).toBeCloseTo(expected, 10);
    }
  });

  it("keeps every adopted LLR positive, matching detection.ts's sign convention", () => {
    for (const entry of report.adopted) {
      expect(entry.referenceLlr).toBeGreaterThan(0);
    }
  });
});

describe("calibrated weights: sensitivity", () => {
  const report = buildCalibrationReport(ARTIFACT, true);

  it("preserves the hand-set LOW/HIGH ratios around the new STANDARD", () => {
    for (const entry of report.adopted) {
      const handSet = LLR_TABLE[entry.backendType]!;
      const factor = entry.bySensitivity.STANDARD / handSet.STANDARD;
      expect(entry.bySensitivity.LOW).toBeCloseTo(handSet.LOW * factor, 10);
      expect(entry.bySensitivity.HIGH).toBeCloseTo(handSet.HIGH * factor, 10);
    }
  });

  it("keeps LOW below STANDARD below HIGH, as the hand-set table does", () => {
    for (const entry of report.adopted) {
      expect(entry.bySensitivity.LOW).toBeLessThan(entry.bySensitivity.STANDARD);
      expect(entry.bySensitivity.STANDARD).toBeLessThan(entry.bySensitivity.HIGH);
    }
  });
});

describe("calibrated weights: many-to-one mapping", () => {
  it("refuses a backend type two fitted ml types both map to", () => {
    // All three gaze types collapse onto gaze_away, so two fitted gaze curves have no defensible
    // merge into one LLR_TABLE value.
    const path = writeArtifact(
      artifactWith({
        "gaze.persistent_offscreen": {
          source: "fitted",
          channel: "gaze",
          prior: 1.4,
          curve: fittedCurve(),
          reason: null,
        },
        "gaze.fixed_external_focus": {
          source: "fitted",
          channel: "gaze",
          prior: 1.6,
          curve: fittedCurve({ slope: 4.0 }),
          reason: null,
        },
      }),
    );
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped.gaze_away).toMatch(/2 fitted ml types map to it/);
  });

  it("adopts a type only one fitted ml type maps to, even when others share it unfitted", () => {
    const path = writeArtifact(
      artifactWith({
        "gaze.persistent_offscreen": {
          source: "fitted",
          channel: "gaze",
          prior: 1.4,
          curve: fittedCurve(),
          reason: null,
        },
        "gaze.fixed_external_focus": {
          source: "prior",
          channel: "gaze",
          prior: 1.6,
          curve: null,
          reason: "only 3 positives, needs 15",
        },
      }),
    );
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toHaveLength(1);
    expect(report.adopted[0]!.backendType).toBe("gaze_away");
  });
});

describe("calibrated weights: refusals", () => {
  it("skips an ml type the contract maps to no backend type", () => {
    const path = writeArtifact(
      artifactWith({
        "network.telemetry_gap": {
          source: "fitted",
          channel: "network",
          prior: 0.5,
          curve: fittedCurve(),
          reason: null,
        },
      }),
    );
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped["network.telemetry_gap"]).toMatch(/by design/);
  });

  it("skips a fit whose reference LLR is not evidence", () => {
    // A downward-sloping curve puts a typical true detection below zero, which would turn a
    // misconduct detector into clean-behaviour evidence.
    const path = writeArtifact(
      artifactWith({
        "input.large_paste": {
          source: "fitted",
          channel: "input",
          prior: 1.8,
          curve: fittedCurve({ intercept: 1.0, slope: -3.0 }),
          reason: null,
        },
      }),
    );
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped.paste_large).toMatch(/not usable as evidence/);
  });

  it("falls back to the hand-set table when the artifact is missing", () => {
    const report = buildCalibrationReport(join(tmpdir(), "definitely-absent-weights.json"), true);
    expect(report.enabled).toBe(true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped._artifact).toBeDefined();
  });

  it("falls back when the artifact is malformed rather than throwing", () => {
    const path = writeArtifact({ schema_version: 1, nonsense: true });
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped._artifact).toBe("unreadable or invalid");
  });

  it("refuses an artifact whose schema version it does not understand", () => {
    const path = writeArtifact(
      artifactWith({}, { schema_version: SUPPORTED_WEIGHTS_SCHEMA_VERSION + 1 }),
    );
    const report = buildCalibrationReport(path, true);
    expect(report.adopted).toEqual([]);
    expect(report.skipped._artifact).toMatch(/schema_version/);
  });
});

describe("calibrated weights: provenance", () => {
  it("reports the dataset kind so a synthetic fit is never presented as recorded", () => {
    const report = buildCalibrationReport(ARTIFACT, true);
    expect(report.datasetKind).toBe(mlWeights.dataset.kind);
    expect(report.datasetKind).toBe("synthetic");
  });

  it("the committed artifact's schema version is the one this backend supports", () => {
    expect(mlWeights.schema_version).toBe(SUPPORTED_WEIGHTS_SCHEMA_VERSION);
  });
});
