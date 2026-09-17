import { z } from "zod";

/** Server -> interviewer. Every one of these is wrapped in a {frameSeq, sessionId, ts, data} envelope. */
export const INTERVIEWER_EVENTS = {
  SESSION_STATE: "session.state",
  JD_PARSED: "jd.parsed",
  CANDIDATE_PRESENCE: "candidate.presence",
  TIMER_TICK: "timer.tick",
} as const;

/** Server -> candidate. Allow-list only — never add an event here without checking Rules.md §9.1. */
export const CANDIDATE_EVENTS = {
  SESSION_STATE: "session.state",
  TIME_REMAINING: "time.remaining",
  SESSION_ENDED: "session.ended",
} as const;

export const sessionJoinSchema = z.object({
  sessionId: z.string().min(1),
  lastFrameSeq: z.number().int().min(0).optional(),
});
