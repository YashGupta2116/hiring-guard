import {
  CALIBRATION_MS,
  CANDIDATE_ABANDON_GRACE_MS,
  FUSION_LEASE_RENEW_MS,
  FUSION_LEASE_TTL_MS,
  TIMER_TICK_MS,
} from "../config/constants.js";
import { emitToCandidate, emitToInterviewers } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "../sockets/events.js";
import { redis } from "../utils/redis.js";
import { computeTimerState } from "./timer.js";

export type EndReason = "interviewer" | "duration_limit" | "candidate_abandon" | "fatal";

export type SessionRuntimeOptions = {
  sessionId: string;
  durationMinutes: number;
  startedAt: Date;
  onEnd: (reason: EndReason) => Promise<void>;
};

/**
 * One per LIVE session, in memory (Architecture.md §6.3). Owns the Redis fusion lease, the
 * 1 s timer tick, and the candidate presence/abandon grace timer. Detector/fusion ticks land
 * in Phase 6-7; this phase only wires the lease, timer and lifecycle timers.
 */
export class SessionRuntime {
  readonly calibrationEndsAt: Date;
  private readonly startedAt: Date;
  private leaseInterval?: NodeJS.Timeout;
  private timerInterval?: NodeJS.Timeout;
  private durationTimeout?: NodeJS.Timeout;
  private abandonTimeout?: NodeJS.Timeout;
  private ended = false;

  constructor(private readonly opts: SessionRuntimeOptions) {
    this.startedAt = opts.startedAt;
    this.calibrationEndsAt = new Date(this.startedAt.getTime() + CALIBRATION_MS);
  }

  async start(): Promise<void> {
    await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS, "NX");
    this.leaseInterval = setInterval(() => void this.renewLease(), FUSION_LEASE_RENEW_MS);
    this.timerInterval = setInterval(() => void this.tick(), TIMER_TICK_MS);

    const remainingMs = this.opts.durationMinutes * 60_000 - (Date.now() - this.startedAt.getTime());
    this.durationTimeout = setTimeout(() => void this.triggerEnd("duration_limit"), Math.max(0, remainingMs));
  }

  private leaseKey(): string {
    return `s:${this.opts.sessionId}:lease`;
  }

  private async renewLease(): Promise<void> {
    await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS);
  }

  private async tick(): Promise<void> {
    const state = computeTimerState(this.startedAt, this.opts.durationMinutes);
    await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.TIMER_TICK, {
      elapsedMs: state.elapsedMs,
      remainingMs: state.remainingMs,
      frozen: false,
    });
  }

  /** Called by sockets/index.ts on /candidate connect and disconnect for this session. */
  onCandidateConnected(): void {
    if (this.abandonTimeout) {
      clearTimeout(this.abandonTimeout);
      this.abandonTimeout = undefined;
    }
    void emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.CANDIDATE_PRESENCE, { connected: true, since: new Date().toISOString() });
  }

  onCandidateDisconnected(): void {
    const graceEndsAt = new Date(Date.now() + CANDIDATE_ABANDON_GRACE_MS);
    void emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.CANDIDATE_PRESENCE, {
      connected: false,
      since: new Date().toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    });
    this.abandonTimeout = setTimeout(() => void this.triggerEnd("candidate_abandon"), CANDIDATE_ABANDON_GRACE_MS);
  }

  private async triggerEnd(reason: EndReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    await this.opts.onEnd(reason);
  }

  /** Called once the session has actually left LIVE. Idempotent. */
  async destroy(): Promise<void> {
    this.ended = true;
    if (this.leaseInterval) clearInterval(this.leaseInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.durationTimeout) clearTimeout(this.durationTimeout);
    if (this.abandonTimeout) clearTimeout(this.abandonTimeout);
    emitToCandidate(this.opts.sessionId, CANDIDATE_EVENTS.SESSION_ENDED, { message: "Thank you for completing your interview." });
    await redis.del(this.leaseKey());
  }
}
