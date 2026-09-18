import { RHYTHM_KS_THRESHOLD } from "../../config/constants.js";
import { ksStatistic } from "./ks-test.js";
import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

const ROLLING_WINDOW_SIZE = 5;

/**
 * Keystroke-interval variance vs the calibration baseline, compared with a two-sample KS test
 * (FR-DET-1). Never runs during calibration — the baseline isn't built yet, so callers should feed
 * calibration-window samples straight into Baseline instead of this detector.
 */
export class RhythmDetector {
  private rollingWindow: number[] = [];

  handle(event: TelemetryEvent, ctx: DetectorContext): DetectorObservation[] {
    if (event.kind !== "keystroke_stats") return [];
    if (ctx.calibrating || ctx.rhythmBaseline.length === 0) return [];

    this.rollingWindow.push(event.variance);
    if (this.rollingWindow.length > ROLLING_WINDOW_SIZE) this.rollingWindow.shift();

    const stat = ksStatistic(ctx.rhythmBaseline, this.rollingWindow);
    if (stat >= RHYTHM_KS_THRESHOLD) {
      return [
        {
          channel: "RHYTHM",
          type: "rhythm_anomaly",
          strength: Math.min(1, stat),
          ts: event.ts,
          payload: { ksStatistic: stat, variance: event.variance, backspaceRatio: event.backspaceRatio, bursts: event.bursts },
        },
      ];
    }
    return [
      {
        channel: "RHYTHM",
        type: "rhythm_normal",
        strength: 1 - stat,
        ts: event.ts,
        payload: { ksStatistic: stat },
      },
    ];
  }
}
