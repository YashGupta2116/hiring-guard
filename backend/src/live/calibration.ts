import { RHYTHM_BASELINE_MIN_SAMPLES } from "../config/constants.js";

/**
 * Baselines captured during the first 60 s of LIVE (FR-LIVE-2). Pure in-memory accumulator — no I/O.
 * Only the rhythm channel needs a numeric distribution today; pointer/focus rates are read directly
 * off Observation rows once Phase 7's fusion engine needs them.
 */
export class Baseline {
  private rhythmSamples: number[] = [];

  addRhythmSample(variance: number): void {
    this.rhythmSamples.push(variance);
  }

  isRhythmReady(): boolean {
    return this.rhythmSamples.length >= RHYTHM_BASELINE_MIN_SAMPLES;
  }

  rhythmDistribution(): number[] {
    return this.rhythmSamples;
  }
}
