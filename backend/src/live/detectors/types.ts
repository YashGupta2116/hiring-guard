import type { MonitoringChannel } from "../../generated/prisma/enums.js";

/** Candidate -> server telemetry, discriminated by kind (Design.md §5.4). */
export type TelemetryEvent =
  | { kind: "visibility"; state: "visible" | "hidden"; ts: number }
  | { kind: "focus"; state: "focus" | "blur"; ts: number }
  | { kind: "pointer"; state: "leave" | "enter" | "idle"; durationMs?: number; ts: number }
  | { kind: "clipboard"; action: "paste" | "copy"; length: number; target: "editor" | "other"; ts: number }
  | { kind: "screen"; screenCount: number; isExtended: boolean; ts: number }
  | { kind: "device"; change: "added" | "removed"; deviceKind: "audioinput" | "videoinput"; ts: number }
  | { kind: "network"; online: boolean; effectiveType?: string; downlinkMbps?: number; ts: number }
  | { kind: "raf_gap"; gapMs: number; ts: number }
  | {
      kind: "keystroke_stats";
      windowMs: number;
      histogram: number[];
      variance: number;
      digraphVariance: number;
      backspaceRatio: number;
      bursts: number;
      ts: number;
    };

/** What a pure detector emits. `strength` is 0..1; detection.ts maps (type, sensitivity) -> llr. */
export type DetectorObservation = {
  channel: MonitoringChannel;
  type: string;
  strength: number;
  ts: number;
  payload: Record<string, unknown>;
};

/** Shared context detectors read but never mutate outside their own instance state. */
export type DetectorContext = {
  calibrating: boolean;
  /** Read-only rhythm baseline captured during calibration. Only RhythmDetector uses this. */
  rhythmBaseline: number[];
};

/** One entry of candidate -> server `editor.delta` (Design.md §5.4). */
export type EditorChange = {
  changeType: "TYPE" | "PASTE" | "AUTOCOMPLETE" | "UNDO";
  rangeOffset: number;
  insertedChars: number;
  deletedChars: number;
  text?: string;
  ts: number;
  /** Interval in ms between consecutive keystrokes that produced this change; TYPE only. */
  keyIntervalsMs?: number[];
};
