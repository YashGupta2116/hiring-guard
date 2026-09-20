import { randomUUID } from "node:crypto";
import {
  CALIBRATION_MS,
  CANDIDATE_ABANDON_GRACE_MS,
  FUSION_LEASE_RENEW_MS,
  FUSION_LEASE_TTL_MS,
  INTEGRITY_SNAPSHOT_MS,
  INTEGRITY_TICK_MS,
  PRODUCER_HEALTH_CHECK_MS,
  CANDIDATE_TIME_REMAINING_MS,
  TIMER_TICK_MS,
} from "../config/constants.js";
import { CHANNEL_FLOOR, CHANNEL_WEIGHTS, getLlr } from "../config/detection.js";
import type { Observation, Prisma } from "../generated/prisma/client.js";
import type { MonitoringChannel, Sensitivity } from "../generated/prisma/enums.js";
import type { PendingObservation } from "../services/evidence.service.js";
import { appendObservations } from "../services/evidence.service.js";
import { emitToCandidate, emitToInterviewers } from "../sockets/emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "../sockets/events.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";
import { Baseline } from "./calibration.js";
import { AuthorshipDetector } from "./detectors/authorship.detector.js";
import { EnvDetector } from "./detectors/env.detector.js";
import { FocusDetector } from "./detectors/focus.detector.js";
import { PasteDetector } from "./detectors/paste.detector.js";
import { PointerDetector } from "./detectors/pointer.detector.js";
import { RhythmDetector } from "./detectors/rhythm.detector.js";
import type { DetectorContext, EditorChange, TelemetryEvent } from "./detectors/types.js";
import {
  applyObservation,
  computeIntegrity,
  computeIntegrityDelta,
  computeScoreFromAccumulators,
  projectState,
} from "./fusion/fusion.engine.js";
import type { FusionState } from "./fusion/fusion.engine.js";
import { processFlagCrossing } from "./fusion/flag-builder.js";
import { closeOpenUnscoredWindows, FrozenChannelTracker, recordUnscoredWindow } from "./fusion/unscored.js";
import { TelemetryIngest } from "./ingest.js";
import type { ProducerStatus } from "./producer-health.js";
import { ProducerHealthMonitor } from "./producer-health.js";
import { computeTimerState } from "./timer.js";
import { evaluateWarden } from "./warden.js";

export type EndReason = "interviewer" | "duration_limit" | "candidate_abandon" | "candidate_violation" | "fatal";

export type SessionRuntimeOptions = {
  sessionId: string;
  durationMinutes: number;
  startedAt: Date;
  sensitivity: Sensitivity;
  /** Monitoring channels actually enabled for this session (PATCH .../config `channels`). */
  channels: MonitoringChannel[];
  onEnd: (reason: EndReason) => Promise<void>;
};

/** The five channels detected from candidate-side telemetry (Design.md §5.4). */
const CLIENT_TELEMETRY_CHANNELS: MonitoringChannel[] = ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"];

/**
 * One per LIVE session, in memory (Architecture.md §6.3). Owns the Redis fusion lease, the 1 s timer
 * tick, the candidate presence/abandon grace timer, the single serialized writer for telemetry (Phase 6:
 * ingest -> detectors -> evidence hash chain), and — as of Phase 7 — the fusion accumulator, flag
 * creation/merge and the warden, all driven inline from that same serialized write so scoring never races.
 */
export class SessionRuntime {
  readonly calibrationEndsAt: Date;
  private readonly startedAt: Date;
  private readonly enabledChannels: Set<MonitoringChannel>;
  private leaseInterval?: NodeJS.Timeout;
  private timerInterval?: NodeJS.Timeout;
  private durationTimeout?: NodeJS.Timeout;
  private abandonTimeout?: NodeJS.Timeout;
  private producerHealthInterval?: NodeJS.Timeout;
  private integrityTickInterval?: NodeJS.Timeout;
  private integritySnapshotInterval?: NodeJS.Timeout;
  private lastCandidateRemainingAt = 0;
  private ended = false;

  private readonly ingest: TelemetryIngest;
  private readonly baseline = new Baseline();
  private readonly focusDetector = new FocusDetector();
  private readonly pasteDetector = new PasteDetector();
  private readonly pointerDetector = new PointerDetector();
  private readonly envDetector = new EnvDetector();
  private readonly rhythmDetector = new RhythmDetector();
  private readonly authorshipDetector = new AuthorshipDetector();
  private readonly producerHealth = new ProducerHealthMonitor();
  private readonly producerChannels = new Map<string, MonitoringChannel[]>();
  private readonly frozenChannels = new FrozenChannelTracker();
  /** Coding tasks the candidate has submitted — editor.delta/snapshot are dropped for these (Rules.md §6). */
  private readonly frozenTasks = new Set<string>();
  /** Per-sessionTask last-accepted editor.delta seq, in memory only (same non-resume caveat as fusion state). */
  private readonly editorSeq = new Map<string, number>();
  /** In-memory only — not checkpointed to Redis (no mid-LIVE process resume exists yet; see Memory.md). */
  private fusionState: FusionState = {};
  /** Serializes every telemetry batch and internal-API write so seq/hash assignment never races. */
  private writeQueue: Promise<void> = Promise.resolve();
  /** Unique per instance, so a renewal or release can never affect a lease another instance now holds. */
  private readonly leaseToken = randomUUID();

  constructor(private readonly opts: SessionRuntimeOptions) {
    this.startedAt = opts.startedAt;
    this.calibrationEndsAt = new Date(this.startedAt.getTime() + CALIBRATION_MS);
    this.ingest = new TelemetryIngest(opts.sessionId);
    this.enabledChannels = new Set(opts.channels);
  }

  async start(): Promise<void> {
    const acquired = await redis.set(this.leaseKey(), this.leaseToken, "PX", FUSION_LEASE_TTL_MS, "NX");
    if (acquired !== "OK") {
      throw new Error(`Failed to acquire fusion lease for session ${this.opts.sessionId}: another runtime already holds it.`);
    }
    this.leaseInterval = setInterval(this.guardTimer(() => this.renewLease(), "lease renewal"), FUSION_LEASE_RENEW_MS);
    this.timerInterval = setInterval(this.guardTimer(() => this.tick(), "timer tick"), TIMER_TICK_MS);
    this.producerHealthInterval = setInterval(() => this.enqueue(() => this.checkProducerHealth()), PRODUCER_HEALTH_CHECK_MS);
    this.integrityTickInterval = setInterval(this.guardTimer(() => this.emitIntegrityTick(), "integrity tick"), INTEGRITY_TICK_MS);
    this.integritySnapshotInterval = setInterval(() => this.enqueue(() => this.persistIntegritySnapshot()), INTEGRITY_SNAPSHOT_MS);

    const remainingMs = this.opts.durationMinutes * 60_000 - (Date.now() - this.startedAt.getTime());
    this.durationTimeout = setTimeout(() => void this.triggerEnd("duration_limit"), Math.max(0, remainingMs));
  }

  /** Wraps a timer callback so a rejection (e.g. a Redis blip) is logged instead of becoming an
   * unhandled rejection — an unhandled rejection here would otherwise crash the whole process
   * (see index.ts's `process.on("unhandledRejection", ...)`), taking down every other live session. */
  private guardTimer(fn: () => Promise<void>, label: string): () => void {
    return () => {
      fn().catch((err: unknown) => {
        logger.error({ err, sessionId: this.opts.sessionId }, `${label} failed`);
      });
    };
  }

  private leaseKey(): string {
    return `s:${this.opts.sessionId}:lease`;
  }

  /** Compare-and-extend: only renews the TTL if this instance's token is still the one stored, so a
   * lease this instance has lost (e.g. to expiry while partitioned from Redis) can never look renewed. */
  private async renewLease(): Promise<void> {
    const renewed = await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end',
      1,
      this.leaseKey(),
      this.leaseToken,
      FUSION_LEASE_TTL_MS,
    );
    if (renewed === 0) {
      logger.error({ sessionId: this.opts.sessionId }, "fusion lease renewal did not match this instance's token; lease may have been lost");
    }
  }

  private isCalibrating(now: number): boolean {
    return now < this.calibrationEndsAt.getTime();
  }

  private frozenSet(): Set<MonitoringChannel> {
    const frozen = new Set<MonitoringChannel>();
    for (const channel of this.enabledChannels) {
      if (this.frozenChannels.isFrozen(channel)) frozen.add(channel);
    }
    return frozen;
  }

  private async tick(): Promise<void> {
    const state = computeTimerState(this.startedAt, this.opts.durationMinutes);
    await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.TIMER_TICK, {
      elapsedMs: state.elapsedMs,
      remainingMs: state.remainingMs,
      frozen: false,
    });

    // The candidate only ever learns how much time is left (Design.md §5.5), and only every few seconds.
    const now = Date.now();
    if (now - this.lastCandidateRemainingAt >= CANDIDATE_TIME_REMAINING_MS) {
      this.lastCandidateRemainingAt = now;
      emitToCandidate(this.opts.sessionId, CANDIDATE_EVENTS.TIME_REMAINING, { remainingMs: state.remainingMs });
    }
  }

  // ---- Fusion, flags, warden (FR-FUS-1, FR-FUS-2, FR-WARN-1) ----

  /** Current integrity score, decayed to now — used by the periodic ticks and exposed for adjudication tests. */
  snapshotIntegrity(): number {
    const now = Date.now();
    const frozen = this.frozenSet();
    const projected = projectState(this.fusionState, now, frozen);
    return computeIntegrity(computeScoreFromAccumulators(projected, frozen), this.opts.sensitivity);
  }

  private async emitIntegrityTick(): Promise<void> {
    const now = Date.now();
    const frozen = this.frozenSet();
    const projected = projectState(this.fusionState, now, frozen);

    const channels = [...this.enabledChannels].map((channel) => ({
      channel,
      contribution: CHANNEL_WEIGHTS[channel] * (projected[channel] ?? 0),
      scored: !frozen.has(channel),
    }));

    await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.INTEGRITY_TICK, {
      score: this.snapshotIntegrity(),
      calibrating: this.isCalibrating(now),
      channels,
    });
  }

  private async persistIntegritySnapshot(): Promise<void> {
    const now = Date.now();
    const frozen = this.frozenSet();
    const projected = projectState(this.fusionState, now, frozen);
    const score = computeScoreFromAccumulators(projected, frozen);
    const integrity = computeIntegrity(score, this.opts.sensitivity);

    await prisma.integritySnapshot.create({
      data: { sessionId: this.opts.sessionId, ts: new Date(now), score: integrity, channels: projected as Prisma.InputJsonValue },
    });
  }

  /** Feeds newly-appended observations through fusion decay/corroboration and, past calibration, flag-builder + warden. */
  private async applyFusionAndFlags(rows: Observation[]): Promise<void> {
    const calibrating = this.isCalibrating(Date.now());

    for (const row of rows) {
      if (!this.enabledChannels.has(row.channel) || this.frozenChannels.isFrozen(row.channel) || row.llr === null) continue;

      const prevState = this.fusionState;
      const tsMs = row.ts.getTime();
      const result = applyObservation(prevState, row.channel, row.llr, tsMs);
      this.fusionState = result.state;

      if (calibrating) continue;

      const { scoreDelta } = computeIntegrityDelta(prevState, row.channel, result.before, result.after, tsMs, this.opts.sensitivity, this.frozenSet());
      const crossing = await processFlagCrossing({
        sessionId: this.opts.sessionId,
        observationId: row.id,
        channel: row.channel,
        type: row.type,
        ts: row.ts,
        before: result.before,
        after: result.after,
        corroboratingChannels: result.corroboratingChannels,
        scoreDelta,
        sensitivity: this.opts.sensitivity,
        payload: row.payload as Record<string, unknown>,
      });
      if (crossing) {
        await evaluateWarden(this.opts.sessionId, row.type, crossing.flag.severity, crossing.flag.id);
      }
    }
  }

  /** Adjudication (flag.service) nudging the live accumulator — the authoritative rescore is Phase 10's IntegrityRescore. */
  applyAdjudication(channel: MonitoringChannel, accumulatorDelta: number): void {
    const current = this.fusionState[channel];
    if (!current) return;
    this.fusionState = { ...this.fusionState, [channel]: { ...current, accumulator: Math.max(CHANNEL_FLOOR, current.accumulator + accumulatorDelta) } };
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
      const created = await appendObservations(this.opts.sessionId, pending);
      await this.applyFusionAndFlags(created);
    }
  }

  /** Used by the internal API (CV/ASR producers) — routed through the same serialized write queue. */
  appendExternalObservations(entries: PendingObservation[]): void {
    this.enqueue(async () => {
      const created = await appendObservations(this.opts.sessionId, entries);
      await this.applyFusionAndFlags(created);
    });
  }

  /** Resolves once every write enqueued so far has finished (or been logged and dropped). */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  // ---- Coding round: editor deltas, snapshots, authorship (FR-CODE-2, FR-DET-2) ----

  handleEditorDelta(sessionTaskId: string, seq: number, changes: EditorChange[], offsetMs: number): void {
    this.enqueue(() => this.processEditorDelta(sessionTaskId, seq, changes, offsetMs));
  }

  private async processEditorDelta(sessionTaskId: string, seq: number, changes: EditorChange[], offsetMs: number): Promise<void> {
    if (this.frozenTasks.has(sessionTaskId)) return;

    const lastSeq = this.editorSeq.get(sessionTaskId) ?? 0;
    if (seq <= lastSeq) return; // duplicate/replayed batch
    this.editorSeq.set(sessionTaskId, seq);

    await prisma.editorDelta.createMany({
      data: changes.map((change) => ({
        sessionId: this.opts.sessionId,
        sessionTaskId,
        changeType: change.changeType,
        rangeOffset: change.rangeOffset,
        insertedChars: change.insertedChars,
        deletedChars: change.deletedChars,
        text: change.text ?? null,
        keystrokeStats: change.keyIntervalsMs ? (change.keyIntervalsMs as Prisma.InputJsonValue) : undefined,
        ts: new Date(change.ts + offsetMs),
      })),
    });

    const outputs = this.authorshipDetector.handle(sessionTaskId, changes);
    if (outputs.length === 0) return;

    const pending: PendingObservation[] = outputs.map((output) => ({
      source: "CLIENT",
      channel: output.channel,
      type: output.type,
      clientTs: new Date(output.ts),
      ts: new Date(output.ts + offsetMs),
      llr: getLlr(output.type, this.opts.sensitivity),
      payload: output.payload,
    }));

    const created = await appendObservations(this.opts.sessionId, pending);
    await this.applyFusionAndFlags(created);
  }

  handleEditorSnapshot(sessionTaskId: string, language: string, content: string): void {
    this.enqueue(async () => {
      if (this.frozenTasks.has(sessionTaskId)) return;
      await prisma.codeSnapshot.create({
        data: { sessionId: this.opts.sessionId, sessionTaskId, language, content, reason: "INTERVAL" },
      });
    });
  }

  /** Called by coding.service after a successful submit — stops accepting further edits for this task. */
  freezeTask(sessionTaskId: string): void {
    this.frozenTasks.add(sessionTaskId);
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
      for (const channel of channels) this.frozenChannels.freeze(channel, "DETECTOR_DOWN");
      await Promise.all(channels.map((channel) => recordUnscoredWindow(this.opts.sessionId, channel, "DETECTOR_DOWN", since, null, producer)));
    }

    for (const producer of recovered) {
      const recoveredAt = new Date();
      await emitToInterviewers(this.opts.sessionId, INTERVIEWER_EVENTS.SYSTEM_DEGRADED, {
        producer,
        recoveredAt: recoveredAt.toISOString(),
      });
      const channels = this.producerChannels.get(producer) ?? [];
      for (const channel of channels) this.frozenChannels.unfreeze(channel, "DETECTOR_DOWN");
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
  async destroy(message = "Thank you for completing your interview."): Promise<void> {
    this.ended = true;
    if (this.leaseInterval) clearInterval(this.leaseInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.durationTimeout) clearTimeout(this.durationTimeout);
    if (this.abandonTimeout) clearTimeout(this.abandonTimeout);
    if (this.producerHealthInterval) clearInterval(this.producerHealthInterval);
    if (this.integrityTickInterval) clearInterval(this.integrityTickInterval);
    if (this.integritySnapshotInterval) clearInterval(this.integritySnapshotInterval);
    emitToCandidate(this.opts.sessionId, CANDIDATE_EVENTS.SESSION_ENDED, { message });
    // Compare-and-delete: only clears the lease if it's still this instance's token, so destroy() can
    // never delete a lease a different (later) runtime instance has since acquired for this session.
    await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      this.leaseKey(),
      this.leaseToken,
    );
  }
}
