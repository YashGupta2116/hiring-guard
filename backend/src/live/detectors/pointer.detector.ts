import { POINTER_LEAVE_IGNORE_MS } from "../../config/constants.js";
import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

/**
 * Pointer leaving the window for longer than the ignore threshold. Pure, stateless per event.
 *
 * The client never puts a duration on the `leave` event itself — it only knows how long the pointer
 * was away once it comes back, so the away-duration is carried on the matching `enter` event instead
 * (see `pointerReturned()` in `frontend/lib/candidate/telemetry.ts`). An `enter` with no `durationMs`
 * is the unrelated "returned from idle" signal and isn't pointer-leave evidence.
 */
export class PointerDetector {
  handle(event: TelemetryEvent, _ctx: DetectorContext): DetectorObservation[] {
    if (event.kind !== "pointer") return [];
    if (event.state !== "enter" || event.durationMs === undefined) return [];
    const durationMs = event.durationMs;
    if (durationMs < POINTER_LEAVE_IGNORE_MS) return [];
    return [
      {
        channel: "POINTER",
        type: "pointer_leave",
        strength: Math.min(1, durationMs / 10_000),
        ts: event.ts,
        payload: { durationMs },
      },
    ];
  }
}
