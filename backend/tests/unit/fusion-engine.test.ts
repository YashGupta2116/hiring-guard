import { describe, expect, it } from "vitest";
import { CHANNEL_DECAY_SECONDS, CHANNEL_FLOOR, CHANNEL_THRESHOLDS, CHANNEL_WEIGHTS, FUSION_SIGMA } from "../../src/config/detection.js";
import {
  applyObservation,
  computeIntegrity,
  computeIntegrityDelta,
  computeScoreFromAccumulators,
  crossedThreshold,
  projectState,
  severityBand,
  type FusionState,
} from "../../src/live/fusion/fusion.engine.js";

describe("applyObservation", () => {
  it("adds a fresh positive LLR to an empty channel with no boost (k=1)", () => {
    const result = applyObservation({}, "FOCUS", 1.2, 0);
    expect(result.before).toBe(0);
    expect(result.after).toBeCloseTo(1.2, 6);
    expect(result.corroboratingCount).toBe(1);
    expect(result.corroboratingChannels).toEqual([]);
  });

  it("decays the existing accumulator by elapsed time before adding the new LLR", () => {
    const tau = CHANNEL_DECAY_SECONDS.FOCUS;
    const state: FusionState = { FOCUS: { accumulator: 2, lastTs: 0, lastPositiveAt: 0 } };
    const elapsedMs = tau * 1000; // one time constant
    const result = applyObservation(state, "FOCUS", 0, elapsedMs);
    expect(result.before).toBeCloseTo(2 * Math.exp(-1), 6);
    expect(result.after).toBeCloseTo(2 * Math.exp(-1), 6);
  });

  it("boosts a positive observation when another channel had positive evidence within the corroboration window", () => {
    const state: FusionState = { PASTE: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 } };
    const result = applyObservation(state, "FOCUS", 1, 1000); // 1s later, within the 6s window
    // k=2 distinct channels -> multiplier = 1 + 0.45*(2-1) = 1.45
    expect(result.after).toBeCloseTo(1 * 1.45, 6);
    expect(result.corroboratingCount).toBe(2);
    expect(result.corroboratingChannels).toEqual(["PASTE"]);
  });

  it("does not boost negative (clean-behaviour) evidence", () => {
    const state: FusionState = { PASTE: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 } };
    const result = applyObservation(state, "FOCUS", -0.4, 1000);
    expect(result.after).toBeCloseTo(-0.4, 6);
  });

  it("floors the accumulator at CHANNEL_FLOOR", () => {
    const state: FusionState = { FOCUS: { accumulator: CHANNEL_FLOOR, lastTs: 0, lastPositiveAt: null } };
    const result = applyObservation(state, "FOCUS", -5, 0);
    expect(result.after).toBe(CHANNEL_FLOOR);
  });

  it("ignores corroboration from a channel whose last positive evidence is outside the 6s window", () => {
    const state: FusionState = { PASTE: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 } };
    const result = applyObservation(state, "FOCUS", 1, 6001);
    expect(result.corroboratingCount).toBe(1);
    expect(result.after).toBeCloseTo(1, 6);
  });

  it("caps the corroboration multiplier at 2.35 regardless of how many channels agree", () => {
    const state: FusionState = {
      PASTE: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 },
      POINTER: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 },
      ENVIRONMENT: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 },
      RHYTHM: { accumulator: 0, lastTs: 0, lastPositiveAt: 0 },
    };
    const result = applyObservation(state, "FOCUS", 1, 0);
    // k=5 -> raw multiplier 1+0.45*4=2.8, capped to 2.35
    expect(result.after).toBeCloseTo(2.35, 6);
  });
});

describe("projectState / computeScoreFromAccumulators", () => {
  it("decays every channel to now without mutating the source", () => {
    const tau = CHANNEL_DECAY_SECONDS.FOCUS;
    const state: FusionState = { FOCUS: { accumulator: 1, lastTs: 0, lastPositiveAt: null } };
    const projected = projectState(state, tau * 1000, new Set());
    expect(projected.FOCUS).toBeCloseTo(Math.exp(-1), 6);
    expect(state.FOCUS!.accumulator).toBe(1); // unchanged
  });

  it("keeps a frozen channel's value unchanged instead of decaying it", () => {
    const state: FusionState = { FOCUS: { accumulator: 1, lastTs: 0, lastPositiveAt: null } };
    const projected = projectState(state, 999_999, new Set(["FOCUS"]));
    expect(projected.FOCUS).toBe(1);
  });

  it("excludes frozen channels from the summed score", () => {
    const score = computeScoreFromAccumulators({ FOCUS: 5, PASTE: 5 }, new Set(["FOCUS"]));
    expect(score).toBeCloseTo(CHANNEL_WEIGHTS.PASTE * 5, 6);
  });
});

describe("computeIntegrity", () => {
  it("returns 100 when the score is very negative (clean session)", () => {
    expect(computeIntegrity(-1000, "STANDARD")).toBeCloseTo(100, 1);
  });

  it("approaches 0 as the score grows very positive", () => {
    expect(computeIntegrity(1000, "STANDARD")).toBeLessThan(1);
  });

  it("is exactly 100 at score=0 divided by 2 (midpoint of the logistic curve)", () => {
    expect(computeIntegrity(0, "STANDARD")).toBeCloseTo(100, 6);
  });

  it("uses sigma so HIGH sensitivity reacts more sharply than LOW for the same score", () => {
    const low = computeIntegrity(5, "LOW");
    const high = computeIntegrity(5, "HIGH");
    expect(high).toBeLessThan(low);
    expect(FUSION_SIGMA.HIGH).toBeLessThan(FUSION_SIGMA.LOW);
  });
});

describe("crossedThreshold / severityBand", () => {
  const threshold = CHANNEL_THRESHOLDS.FOCUS.STANDARD;

  it("detects an upward crossing only", () => {
    expect(crossedThreshold(threshold - 1, threshold + 1, "FOCUS", "STANDARD")).toBe(true);
    expect(crossedThreshold(threshold + 1, threshold + 2, "FOCUS", "STANDARD")).toBe(false); // already above
    expect(crossedThreshold(threshold - 2, threshold - 1, "FOCUS", "STANDARD")).toBe(false); // still below
  });

  it("bands severity by how far above threshold the accumulator sits", () => {
    expect(severityBand(threshold, "FOCUS", "STANDARD")).toBe("LOW");
    expect(severityBand(threshold * 1.5, "FOCUS", "STANDARD")).toBe("MEDIUM");
    expect(severityBand(threshold * 2.5, "FOCUS", "STANDARD")).toBe("HIGH");
  });
});

describe("computeIntegrityDelta", () => {
  it("returns a positive scoreDelta when integrity drops after the observation", () => {
    const prevState: FusionState = {};
    const { integrityBefore, integrityAfter, scoreDelta } = computeIntegrityDelta(prevState, "FOCUS", 0, 5, 0, "STANDARD", new Set());
    expect(integrityBefore).toBeGreaterThan(integrityAfter);
    expect(scoreDelta).toBeCloseTo(integrityBefore - integrityAfter, 6);
    expect(scoreDelta).toBeGreaterThan(0);
  });

  it("holds other channels fixed at their own decay-to-now value", () => {
    const prevState: FusionState = { PASTE: { accumulator: 3, lastTs: 0, lastPositiveAt: null } };
    const result = computeIntegrityDelta(prevState, "FOCUS", 0, 0, 0, "STANDARD", new Set());
    // FOCUS didn't actually change (before===after), so integrity before/after should match exactly.
    expect(result.integrityBefore).toBeCloseTo(result.integrityAfter, 10);
  });
});
