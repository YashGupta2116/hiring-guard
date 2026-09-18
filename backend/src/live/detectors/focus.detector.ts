import { FOCUS_IGNORE_MS } from "../../config/constants.js";
import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

/**
 * Focus/visibility loss under FOCUS_IGNORE_MS is normal tab-switch noise and is ignored (FR-DET-1).
 * Pure: no I/O, state is just the open loss timestamp per subkind.
 */
export class FocusDetector {
  private blurStartedAt: number | null = null;
  private hiddenStartedAt: number | null = null;

  handle(event: TelemetryEvent, _ctx: DetectorContext): DetectorObservation[] {
    if (event.kind === "focus") {
      if (event.state === "blur") {
        this.blurStartedAt = event.ts;
        return [];
      }
      return this.resolve(this.blurStartedAt, event.ts, () => (this.blurStartedAt = null));
    }
    if (event.kind === "visibility") {
      if (event.state === "hidden") {
        this.hiddenStartedAt = event.ts;
        return [];
      }
      return this.resolve(this.hiddenStartedAt, event.ts, () => (this.hiddenStartedAt = null));
    }
    return [];
  }

  private resolve(startedAt: number | null, endedAt: number, clear: () => void): DetectorObservation[] {
    if (startedAt === null) return [];
    const durationMs = endedAt - startedAt;
    clear();
    if (durationMs < FOCUS_IGNORE_MS) return [];
    return [
      {
        channel: "FOCUS",
        type: "focus_loss",
        strength: Math.min(1, durationMs / 30_000),
        ts: endedAt,
        payload: { durationMs },
      },
    ];
  }
}
