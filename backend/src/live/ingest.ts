import { redis } from "../utils/redis.js";
import type { TelemetryEvent } from "./detectors/types.js";

export type AcceptedEvent = { event: TelemetryEvent; correctedTs: Date };

export type IngestResult = {
  accepted: AcceptedEvent[];
  duplicate: boolean;
  /** A forward jump in the per-connection seq: some batch could not be replayed (FR-TEL-2). */
  gap: boolean;
};

/**
 * Per-connection clock correction, sequence check and dedup (FR-TEL-1, FR-TEL-2). Backed by Redis so a
 * connection's last-accepted seq survives a process restart, per Architecture.md §7.2 `s:{sid}:conn:{connId}:seq`.
 * The clock offset (Design.md §5.4 `clock.offset`) is a socket-level value with no `connId` of its own,
 * so callers pass it in per call rather than this class tracking it by connId.
 */
export class TelemetryIngest {
  constructor(private readonly sessionId: string) {}

  async acceptBatch(connId: string, seq: number, events: TelemetryEvent[], offsetMs: number): Promise<IngestResult> {
    const key = this.seqKey(connId);
    const lastSeqRaw = await redis.get(key);
    const lastSeq = lastSeqRaw ? Number(lastSeqRaw) : 0;

    if (seq <= lastSeq) {
      return { accepted: [], duplicate: true, gap: false };
    }

    const gap = seq > lastSeq + 1;
    await redis.set(key, String(seq));

    const accepted = events.map((event) => ({ event, correctedTs: new Date(event.ts + offsetMs) }));
    return { accepted, duplicate: false, gap };
  }

  private seqKey(connId: string): string {
    return `s:${this.sessionId}:conn:${connId}:seq`;
  }
}
