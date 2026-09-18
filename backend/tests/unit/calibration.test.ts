import { describe, expect, it } from "vitest";
import { RHYTHM_BASELINE_MIN_SAMPLES } from "../../src/config/constants.js";
import { Baseline } from "../../src/live/calibration.js";

describe("Baseline", () => {
  it("is not ready until the minimum sample count is reached", () => {
    const baseline = new Baseline();
    for (let i = 0; i < RHYTHM_BASELINE_MIN_SAMPLES - 1; i++) {
      baseline.addRhythmSample(10 + i);
      expect(baseline.isRhythmReady()).toBe(false);
    }
    baseline.addRhythmSample(20);
    expect(baseline.isRhythmReady()).toBe(true);
  });

  it("returns the exact samples collected", () => {
    const baseline = new Baseline();
    baseline.addRhythmSample(1);
    baseline.addRhythmSample(2);
    expect(baseline.rhythmDistribution()).toEqual([1, 2]);
  });
});
