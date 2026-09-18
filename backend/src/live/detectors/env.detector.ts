import type { DetectorContext, DetectorObservation, TelemetryEvent } from "./types.js";

/** Display count, device changes, network anomalies. Pure, stateless. */
export class EnvDetector {
  handle(event: TelemetryEvent, _ctx: DetectorContext): DetectorObservation[] {
    if (event.kind === "screen") {
      if (event.screenCount <= 1 && !event.isExtended) return [];
      return [
        {
          channel: "ENVIRONMENT",
          type: "multi_screen",
          strength: Math.min(1, event.screenCount / 4),
          ts: event.ts,
          payload: { screenCount: event.screenCount, isExtended: event.isExtended },
        },
      ];
    }
    if (event.kind === "device") {
      return [
        {
          channel: "ENVIRONMENT",
          type: "device_change",
          strength: 0.5,
          ts: event.ts,
          payload: { change: event.change, deviceKind: event.deviceKind },
        },
      ];
    }
    if (event.kind === "network") {
      if (event.online) return [];
      return [
        {
          channel: "ENVIRONMENT",
          type: "network_anomaly",
          strength: 0.4,
          ts: event.ts,
          payload: { online: event.online, effectiveType: event.effectiveType ?? null },
        },
      ];
    }
    return [];
  }
}
