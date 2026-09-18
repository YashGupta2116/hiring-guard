import { POINTER_LEAVE_IGNORE_MS } from "../../config/constants.js";
import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

/** Pointer leaving the window for longer than the ignore threshold. Pure, stateless per event. */
export class PointerDetector {
  handle(event: TelemetryEvent, _ctx: DetectorContext): DetectorObservation[] {
    if (event.kind !== "pointer") return [];
    if (event.state !== "leave") return [];
    const durationMs = event.durationMs ?? 0;
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
