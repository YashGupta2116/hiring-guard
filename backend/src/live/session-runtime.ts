import {
  CALIBRATION_MS,
  CANDIDATE_ABANDON_GRACE_MS,
  FUSION_LEASE_RENEW_MS,
  FUSION_LEASE_TTL_MS,
  PRODUCER_HEALTH_CHECK_MS,
  TIMER_TICK_MS,
} from "../config/constants.js";
import { getLlr } from "../config/detection.js";
import type { MonitoringChannel, Sensitivity } from "../generated/prisma/enums.js";
import type { PendingObservation } from "../services/evidence.service.js";
import { appendObservations } from "../services/evidence.service.js";
import { emitToCandidate, emitToInterviewers } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "../sockets/events.js";
import { logger } from "../utils/logger.js";
import { redis } from "../utils/redis.js";
import { Baseline } from "./calibration.js";
import { EnvDetector } from "./detectors/env.detector.js";
import { FocusDetector } from "./detectors/focus.detector.js";
import { PasteDetector } from "./detectors/paste.detector.js";
import { PointerDetector } from "./detectors/pointer.detector.js";
import { RhythmDetector } from "./detectors/rhythm.detector.js";
import type { DetectorContext, TelemetryEvent } from "./detectors/types.js";
import { TelemetryIngest } from "./ingest.js";
import type { ProducerStatus } from "./producer-health.js";
import { ProducerHealthMonitor } from "./producer-health.js";
import { computeTimerState } from "./timer.js";
import { closeOpenUnscoredWindows, recordUnscoredWindow } from "./unscored.js";

export type EndReason = "interviewer" | "duration_limit" | "candidate_abandon" | "fatal";

export type SessionRuntimeOptions = {
  sessionId: string;
  durationMinutes: number;
  startedAt: Date;
  sensitivity: Sensitivity;
  onEnd: (reason: EndReason) => Promise<void>;
};

/** The five channels detected from candidate-side telemetry (Design.md §5.4). */
const CLIENT_TELEMETRY_CHANNELS: MonitoringChannel[] = ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"];

/**
 * One per LIVE session, in memory (Architecture.md §6.3). Owns the Redis fusion lease, the
 * 1 s timer tick, the candidate presence/abandon grace timer, and — as of Phase 6 — the single
 * serialized writer for candidate telemetry: ingest -> detectors -> evidence hash chain, plus
 * producer heartbeat health. Fusion/flags/warden land in Phase 7.
 */
export class SessionRuntime {
  readonly calibrationEndsAt: Date;
  private readonly startedAt: Date;
  private leaseInterval?: NodeJS.Timeout;
  private timerInterval?: NodeJS.Timeout;
  private durationTimeout?: NodeJS.Timeout;
  private abandonTimeout?: NodeJS.Timeout;
  private producerHealthInterval?: NodeJS.Timeout;
  private ended = false;

  private readonly ingest: TelemetryIngest;
  private readonly baseline = new Baseline();
  private readonly focusDetector = new FocusDetector();
  private readonly pasteDetector = new PasteDetector();
  private readonly pointerDetector = new PointerDetector();
  private readonly envDetector = new EnvDetector();
  private readonly rhythmDetector = new RhythmDetector();
  private readonly producerHealth = new ProducerHealthMonitor();
  private readonly producerChannels = new Map<string, MonitoringChannel[]>();
  /** Serializes every telemetry batch and internal-API write so seq/hash assignment never races. */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly opts: SessionRuntimeOptions) {
    this.startedAt = opts.startedAt;
    this.calibrationEndsAt = new Date(this.startedAt.getTime() + CALIBRATION_MS);
    this.ingest = new TelemetryIngest(opts.sessionId);
  }

  async start(): Promise<void> {
    await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS, "NX");
    this.leaseInterval = setInterval(() => void this.renewLease(), FUSION_LEASE_RENEW_MS);
    this.timerInterval = setInterval(() => void this.tick(), TIMER_TICK_MS);
    this.producerHealthInterval = setInterval(() => this.enqueue(() => this.checkProducerHealth()), PRODUCER_HEALTH_CHECK_MS);

    const remainingMs = this.opts.durationMinutes * 60_000 - (Date.now() - this.startedAt.getTime());
    this.durationTimeout = setTimeout(() => void this.triggerEnd("duration_limit"), Math.max(0, remainingMs));
  }

  private leaseKey(): string {
    return `s:${this.opts.sessionId}:lease`;
  }

  private async renewLease(): Promise<void> {
    await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS);
  }

  private isCalibrating(now: number): boolean {
    return now < this.calibrationEndsAt.getTime();
  }

  private async tick(): Promise<void> {
    const state = computeTimerState(this.startedAt, this.opts.durationMinutes);
    await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.TIMER_TICK, {
      elapsedMs: state.elapsedMs,
      remainingMs: state.remainingMs,
      frozen: false,
    });
  }

  /** Runs `task` after every previously queued write, so seq/hash assignment is never concurrent. */
  private enqueue(task: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(task).catch((err: unknown) => {
      logger.error({ err, sessionId: this.opts.sessionId }, "session runtime write failed");
    });
  }

  // ---- Telemetry ingest (FR-TEL-1, FR-TEL-2, FR-DET-1) ----

  handleTelemetryBatch(connId: string, seq: number, events: TelemetryEvent[], offsetMs: number): void {
    this.enqueue(() => this.processTelemetryBatch(connId, seq, events, offsetMs));
  }

  private async processTelemetryBatch(connId: string, seq: number, events: TelemetryEvent[], offsetMs: number): Promise<void> {
    const result = await this.ingest.acceptBatch(connId, seq, events, offsetMs);
    if (result.duplicate) return;

    if (result.gap) {
      const now = new Date();
      await Promise.all(
        CLIENT_TELEMETRY_CHANNELS.map((channel) =>
          recordUnscoredWindow(this.opts.sessionId, channel, "SEQUENCE_GAP", now, now, `connId=${connId} seq=${seq}`),
        ),
      );
    }

    const calibrating = this.isCalibrating(Date.now());
    const pending: PendingObservation[] = [];

    for (const { event, correctedTs } of result.accepted) {
      if (event.kind === "keystroke_stats" && calibrating) {
        this.baseline.addRhythmSample(event.variance);
        continue;
      }

      const ctx: DetectorContext = { calibrating, rhythmBaseline: this.baseline.rhythmDistribution() };
      const outputs = [
        ...this.focusDetector.handle(event, ctx),
        ...this.pasteDetector.handle(event, ctx),
        ...this.pointerDetector.handle(event, ctx),
        ...this.envDetector.handle(event, ctx),
        ...this.rhythmDetector.handle(event, ctx),
      ];

      for (const output of outputs) {
        pending.push({
          source: "CLIENT",
          channel: output.channel,
          type: output.type,
          clientTs: new Date(event.ts),
          ts: correctedTs,
          llr: getLlr(output.type, this.opts.sensitivity),
          payload: output.payload,
        });
      }
    }

    if (pending.length > 0) {
      await appendObservations(this.opts.sessionId, pending);
    }
  }

  /** Used by the internal API (CV/ASR producers) — routed through the same serialized write queue. */
  appendExternalObservations(entries: PendingObservation[]): void {
    this.enqueue(() => appendObservations(this.opts.sessionId, entries));
  }

  /** Resolves once every write enqueued so far has finished (or been logged and dropped). */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  // ---- Producer health (FR-DET-3) ----

  recordProducerHeartbeat(producer: string, channels: MonitoringChannel[], status: ProducerStatus): void {
    this.producerChannels.set(producer, channels);
    this.producerHealth.recordHeartbeat(producer, channels, status);
    this.enqueue(() => this.checkProducerHealth());
  }

  private async checkProducerHealth(): Promise<void> {
    const { becameDegraded, recovered } = this.producerHealth.checkHealth();

    for (const { producer, channels } of becameDegraded) {
      const since = new Date();
      await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.SYSTEM_DEGRADED, {
        producer,
        channels,
        since: since.toISOString(),
      });
      await Promise.all(channels.map((channel) => recordUnscoredWindow(this.opts.sessionId, channel, "DETECTOR_DOWN", since, null, producer)));
    }

    for (const producer of recovered) {
      const recoveredAt = new Date();
      await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.SYSTEM_DEGRADED, {
        producer,
        recoveredAt: recoveredAt.toISOString(),
      });
      const channels = this.producerChannels.get(producer) ?? [];
      await Promise.all(channels.map((channel) => closeOpenUnscoredWindows(this.opts.sessionId, channel, "DETECTOR_DOWN", recoveredAt)));
    }
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
    if (this.producerHealthInterval) clearInterval(this.producerHealthInterval);
    emitToCandidate(this.opts.sessionId, CANDIDATE_EVENTS.SESSION_ENDED, { message: "Thank you for completing your interview." });
    await redis.del(this.leaseKey());
  }
}
