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
} as const;

/** Server -> candidate. Allow-list only — never add an event here without checking Rules.md §9.1. */
export const CANDIDATE_EVENTS = {
  SESSION_STATE: "session.state",
  TIME_REMAINING: "time.remaining",
  SESSION_ENDED: "session.ended",
  WARN_SHOW: "warn.show",
} as const;

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
