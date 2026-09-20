import { z } from "zod";

/** Server -> interviewer. Every one of these is wrapped in a {frameSeq, sessionId, ts, data} envelope. */
export const INTERVIEWER_EVENTS = {
  SESSION_STATE: "session.state",
  JD_PARSED: "jd.parsed",
  CANDIDATE_PRESENCE: "candidate.presence",
  TIMER_TICK: "timer.tick",
  SYSTEM_DEGRADED: "system.degraded",
  TRANSCRIPT_PARTIAL: "transcript.partial",
  TRANSCRIPT_FINAL: "transcript.final",
  INTEGRITY_TICK: "integrity.tick",
  FLAG_NEW: "flag.new",
  FLAG_UPDATE: "flag.update",
  WARN_ISSUED: "warn.issued",
  NOTE_ADDED: "note.added",
  QS_SUGGESTIONS: "qs.suggestions",
  REPORT_READY: "report.ready",
} as const;

/** Server -> candidate. Allow-list only — never add an event here without checking Rules.md §9.1. */
export const CANDIDATE_EVENTS = {
  SESSION_STATE: "session.state",
  TIME_REMAINING: "time.remaining",
  SESSION_ENDED: "session.ended",
  WARN_SHOW: "warn.show",
  TASK_FROZEN: "task.frozen",
  TASK_ASSIGNED: "task.assigned",
} as const;

/** WebRTC signalling relayed between the interviewer and candidate sockets; it never carries scores or flags. */
export const rtcSignalSchema = z.object({
  to: z.string().min(1).max(100).optional(),
  type: z.enum(["ready", "offer", "answer", "candidate", "bye"]),
  sdp: z.string().max(100_000).optional(),
  candidate: z.unknown().optional(),
  streams: z.object({ camera: z.string().max(200).optional(), screen: z.string().max(200).optional() }).optional(),
});

/** Camera-derived observations produced in the candidate's browser (face presence, face count, gaze). */
export const cvBatchSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["face_absent", "multiple_faces", "gaze_away", "foreign_object", "screen_share_stopped"]),
        ts: z.number().int().min(0),
        strength: z.number().min(0).max(1),
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(20),
});

/** Live camera-analysis state, shown to the interviewer as an indicator. Not scored and not stored. */
export const cvStatusSchema = z.object({
  state: z.enum(["loading", "ok", "unavailable"]),
  faces: z.number().int().min(0).max(10),
  away: z.boolean(),
  object: z.string().max(40).optional(),
});

/** The candidate's browser reports leaving the required full-screen / focused state; the interview is cancelled. */
export const violationSchema = z.object({
  kind: z.enum(["left_fullscreen", "tab_hidden", "window_blur"]),
});

export const cvHeartbeatSchema = z.object({ status: z.enum(["OK", "DEGRADED"]) });

export const sessionJoinSchema = z.object({
  sessionId: z.string().min(1),
  lastFrameSeq: z.number().int().min(0).optional(),
});

// ---- Candidate -> server (Design.md §5.4) ----

export const clockSyncSchema = z.object({
  clientSentAt: z.number(),
});

export const clockOffsetSchema = z.object({
  offsetMs: z.number(),
  rttMs: z.number().min(0),
});

export const warnAckSchema = z.object({
  warningId: z.string().min(1),
  ackedAt: z.number(),
});

// ---- Interviewer -> server (Design.md §5.3) ----

export const noteAddSchema = z.object({
  body: z.string().min(1).max(4000),
});

const telemetryEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visibility"), state: z.enum(["visible", "hidden"]), ts: z.number() }),
  z.object({ kind: z.literal("focus"), state: z.enum(["focus", "blur"]), ts: z.number() }),
  z.object({
    kind: z.literal("pointer"),
    state: z.enum(["leave", "enter", "idle"]),
    durationMs: z.number().min(0).optional(),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("clipboard"),
    action: z.enum(["paste", "copy"]),
    length: z.number().int().min(0),
    target: z.enum(["editor", "other"]),
    ts: z.number(),
  }),
  z.object({ kind: z.literal("screen"), screenCount: z.number().int().min(0), isExtended: z.boolean(), ts: z.number() }),
  z.object({
    kind: z.literal("device"),
    change: z.enum(["added", "removed"]),
    deviceKind: z.enum(["audioinput", "videoinput"]),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("network"),
    online: z.boolean(),
    effectiveType: z.string().optional(),
    downlinkMbps: z.number().optional(),
    ts: z.number(),
  }),
  z.object({ kind: z.literal("raf_gap"), gapMs: z.number().min(0), ts: z.number() }),
  z.object({
    kind: z.literal("keystroke_stats"),
    windowMs: z.number().int().min(0),
    histogram: z.array(z.number()),
    variance: z.number(),
    digraphVariance: z.number(),
    backspaceRatio: z.number().min(0).max(1),
    bursts: z.number().int().min(0),
    ts: z.number(),
  }),
]);

export const telemetryBatchSchema = z.object({
  connId: z.string().min(1),
  seq: z.number().int().min(1),
  sentAt: z.number(),
  events: z.array(telemetryEventSchema).min(1),
});

const editChangeType = z.enum(["TYPE", "PASTE", "AUTOCOMPLETE", "UNDO"]);

const editorChangeSchema = z.object({
  changeType: editChangeType,
  rangeOffset: z.number().int().min(0),
  insertedChars: z.number().int().min(0),
  deletedChars: z.number().int().min(0),
  text: z.string().max(10_000).optional(),
  ts: z.number(),
  keyIntervalsMs: z.array(z.number().min(0)).optional(),
});

export const editorDeltaSchema = z.object({
  taskId: z.string().min(1),
  seq: z.number().int().min(1),
  changes: z.array(editorChangeSchema).min(1),
});

export const editorSnapshotSchema = z.object({
  taskId: z.string().min(1),
  language: z.string().min(1).max(40),
  content: z.string().max(200_000),
  reason: z.literal("INTERVAL"),
});
