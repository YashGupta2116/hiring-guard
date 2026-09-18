import { PASTE_LARGE_CHARS } from "../../config/constants.js";
import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

/** Large clipboard pastes anywhere in the interview surface. Pure, stateless. */
export class PasteDetector {
  handle(event: TelemetryEvent, _ctx: DetectorContext): DetectorObservation[] {
    if (event.kind !== "clipboard" || event.action !== "paste") return [];
    if (event.length < PASTE_LARGE_CHARS) return [];
    return [
      {
        channel: "PASTE",
        type: "paste_large",
        strength: Math.min(1, event.length / 2000),
        ts: event.ts,
        payload: { length: event.length, target: event.target },
      },
    ];
  }
}
