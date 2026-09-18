import { PRODUCER_HEARTBEAT_TIMEOUT_MS } from "../config/constants.js";
import type { MonitoringChannel } from "../generated/prisma/enums.js";

export type ProducerStatus = "OK" | "DEGRADED";

type ProducerRecord = { lastSeenAt: number; channels: MonitoringChannel[]; status: ProducerStatus };

export type ProducerHealthTransitions = {
  becameDegraded: Array<{ producer: string; channels: MonitoringChannel[] }>;
  recovered: string[];
};

/**
 * Tracks external producer (CV/ASR) heartbeats and reports OK<->DEGRADED transitions (FR-DET-3).
 * Pure in-memory state machine — no I/O; the caller (SessionRuntime) does the emitting and unscored-window bookkeeping.
 */
export class ProducerHealthMonitor {
  private readonly producers = new Map<string, ProducerRecord>();
  private readonly degraded = new Set<string>();

  recordHeartbeat(producer: string, channels: MonitoringChannel[], status: ProducerStatus, now = Date.now()): void {
    this.producers.set(producer, { lastSeenAt: now, channels, status });
  }

  checkHealth(now: number = Date.now()): ProducerHealthTransitions {
    const becameDegraded: Array<{ producer: string; channels: MonitoringChannel[] }> = [];
    const recovered: string[] = [];

    for (const [producer, record] of this.producers) {
      const stale = now - record.lastSeenAt > PRODUCER_HEARTBEAT_TIMEOUT_MS;
      const isDegraded = stale || record.status === "DEGRADED";
      const wasDegraded = this.degraded.has(producer);

      if (isDegraded && !wasDegraded) {
        this.degraded.add(producer);
        becameDegraded.push({ producer, channels: record.channels });
      } else if (!isDegraded && wasDegraded) {
        this.degraded.delete(producer);
        recovered.push(producer);
      }
    }
    return { becameDegraded, recovered };
  }
}
