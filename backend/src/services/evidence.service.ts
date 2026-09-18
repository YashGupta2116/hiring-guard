import type { Observation, Prisma } from "../generated/prisma/client.js";
import type { MonitoringChannel, ObservationSource } from "../generated/prisma/enums.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";

export type PendingObservation = {
  source: ObservationSource;
  channel: MonitoringChannel;
  type: string;
  clientTs: Date | null;
  ts: Date;
  llr: number | null;
  payload: Record<string, unknown>;
};

function chainKey(sessionId: string): string {
  return `s:${sessionId}:chain`;
}

function genesis(sessionId: string): string {
  return sha256Hex(`veritrust:${sessionId}`);
}

async function loadChainHead(sessionId: string): Promise<{ lastSeq: number; lastHash: string }> {
  const stored = await redis.hmget(chainKey(sessionId), "lastSeq", "lastHash");
  const [lastSeqRaw, lastHash] = stored;
  if (lastSeqRaw === null || lastHash === null) {
    return { lastSeq: 0, lastHash: genesis(sessionId) };
  }
  return { lastSeq: Number(lastSeqRaw), lastHash };
}

/**
 * Assigns seq + prevHash + hash to each pending observation, in order, and batch-inserts them
 * (Architecture.md §7.4), returning the inserted rows (with their generated ids) so the fusion engine
 * can link flags to the exact observations that caused them. Must be called from a single serialized
 * writer per session (SessionRuntime's write queue) — this function does not itself lock, matching the
 * "single writer holding the lease" design instead of adding a second lock here.
 */
export async function appendObservations(sessionId: string, entries: PendingObservation[]): Promise<Observation[]> {
  if (entries.length === 0) return [];

  let { lastSeq, lastHash } = await loadChainHead(sessionId);
  const rows = entries.map((entry) => {
    const seq = ++lastSeq;
    const hash = sha256Hex(
      lastHash +
        canonicalJson({
          sessionId,
          seq,
          source: entry.source,
          channel: entry.channel,
          type: entry.type,
          ts: entry.ts,
          payload: entry.payload,
        }),
    );
    const prevHash = lastHash;
    lastHash = hash;
    return {
      sessionId,
      seq,
      source: entry.source,
      channel: entry.channel,
      type: entry.type,
      clientTs: entry.clientTs,
      ts: entry.ts,
      llr: entry.llr,
      payload: entry.payload as Prisma.InputJsonValue,
      prevHash,
      hash,
    };
  });

  const created = await prisma.observation.createManyAndReturn({ data: rows });
  await redis.hset(chainKey(sessionId), "lastSeq", lastSeq, "lastHash", lastHash);
  return created;
}
