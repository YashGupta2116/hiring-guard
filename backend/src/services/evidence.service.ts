import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { DETECTOR_VERSION, WEIGHTS_VERSION } from "../config/detection.js";
import type { Observation, Prisma } from "../generated/prisma/client.js";
import type { MonitoringChannel, ObservationSource } from "../generated/prisma/enums.js";
import { getSigner, getStorage } from "../providers/index.js";
import type { StoredObject } from "../providers/storage/storage.provider.js";
import { AppError } from "../utils/app-error.js";
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

export type ChainVerification = {
  valid: boolean;
  lastSeq: number;
  chainHead: string;
  firstBrokenSeq: number | null;
};

/**
 * Recomputes the hash chain from genesis over every stored `Observation` row (Architecture.md §7.4) and
 * compares it against what's actually stored. A single-row tamper that also "fixes" that row's own hash
 * still breaks the link on the *next* row, since that row's `prevHash` was recorded before the tamper —
 * so `firstBrokenSeq` reports whichever row the mismatch first surfaces at. Used both by the seal
 * sequence (step 7, sanity check before signing) and by `verifySession` (recomputed fresh from the
 * live DB on every call, independent of the DB row's own `prevHash`/`hash` columns).
 */
export async function verifyChain(sessionId: string): Promise<ChainVerification> {
  const observations = await prisma.observation.findMany({
    where: { sessionId },
    orderBy: { seq: "asc" },
    select: { seq: true, source: true, channel: true, type: true, ts: true, payload: true, prevHash: true, hash: true },
  });

  let runningHash = genesis(sessionId);
  let firstBrokenSeq: number | null = null;
  let lastSeq = 0;

  for (const obs of observations) {
    const expectedHash = sha256Hex(
      obs.prevHash +
        canonicalJson({ sessionId, seq: obs.seq, source: obs.source, channel: obs.channel, type: obs.type, ts: obs.ts, payload: obs.payload }),
    );
    const linkOk = obs.prevHash === runningHash;
    const contentOk = obs.hash === expectedHash;
    if (firstBrokenSeq === null && (!linkOk || !contentOk)) {
      firstBrokenSeq = obs.seq;
    }
    runningHash = obs.hash;
    lastSeq = obs.seq;
  }

  return { valid: firstBrokenSeq === null, lastSeq, chainHead: runningHash, firstBrokenSeq };
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

const EXPORT_BATCH_SIZE = 500;

/** Cursor-paginates a Prisma query in fixed-size batches so the export never holds a whole table in memory. */
async function* paginate<T>(fetchBatch: (skip: number, take: number) => Promise<T[]>): AsyncGenerator<T> {
  let skip = 0;
  for (;;) {
    const batch = await fetchBatch(skip, EXPORT_BATCH_SIZE);
    for (const item of batch) yield item;
    if (batch.length < EXPORT_BATCH_SIZE) return;
    skip += EXPORT_BATCH_SIZE;
  }
}

type EvidenceSource = { record: string; gen: AsyncGenerator<Record<string, unknown>>; tsOf: (value: Record<string, unknown>) => number };

/** K-way merge of the five evidence tables (Architecture.md §6.7 step 7), streamed in chronological order. */
async function* mergedEvidenceStream(sessionId: string, sessionStartedAt: Date): AsyncGenerator<string> {
  const sources: EvidenceSource[] = [
    {
      record: "observation",
      gen: paginate((skip, take) => prisma.observation.findMany({ where: { sessionId }, orderBy: { seq: "asc" }, skip, take })),
      tsOf: (v) => (v.ts as Date).getTime(),
    },
    {
      record: "flag",
      gen: paginate((skip, take) => prisma.flag.findMany({ where: { sessionId }, orderBy: { startTs: "asc" }, skip, take })),
      tsOf: (v) => (v.startTs as Date).getTime(),
    },
    {
      record: "transcript",
      gen: paginate((skip, take) => prisma.transcriptSegment.findMany({ where: { sessionId }, orderBy: { startMs: "asc" }, skip, take })),
      tsOf: (v) => sessionStartedAt.getTime() + (v.startMs as number),
    },
    {
      record: "note",
      gen: paginate((skip, take) => prisma.note.findMany({ where: { sessionId }, orderBy: { ts: "asc" }, skip, take })),
      tsOf: (v) => (v.ts as Date).getTime(),
    },
    {
      record: "execution",
      gen: paginate((skip, take) => prisma.codeExecution.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" }, skip, take })),
      tsOf: (v) => (v.createdAt as Date).getTime(),
    },
  ];

  const heads = await Promise.all(sources.map((s) => s.gen.next()));

  while (heads.some((h) => !h.done)) {
    let bestIdx = -1;
    let bestTs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i]!;
      if (head.done) continue;
      const ts = sources[i]!.tsOf(head.value);
      if (ts < bestTs) {
        bestTs = ts;
        bestIdx = i;
      }
    }
    const { record } = sources[bestIdx]!;
    const value = heads[bestIdx]!.value as Record<string, unknown>;
    yield `${JSON.stringify({ record, ...value }, jsonReplacer)}\n`;
    heads[bestIdx] = await sources[bestIdx]!.gen.next();
  }
}

function evidenceStorageKey(orgId: string, sessionId: string, fileName: string): string {
  return `orgs/${orgId}/sessions/${sessionId}/evidence/${fileName}`;
}

/** Streams observations/flags/transcript/notes/executions to a gzipped ndjson file in storage (seal step 7). */
export async function exportEvidenceLog(orgId: string, sessionId: string): Promise<StoredObject> {
  const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
  const sessionStartedAt = session.startedAt ?? session.createdAt;

  const source = Readable.from(mergedEvidenceStream(sessionId, sessionStartedAt));
  const gzip = createGzip();
  // .pipe() doesn't forward source errors to the destination by default; without this, a failed query
  // mid-stream would leave the gzip stream (and storage.put's write) hanging instead of rejecting.
  source.on("error", (err) => gzip.destroy(err));
  source.pipe(gzip);

  return getStorage().put(evidenceStorageKey(orgId, sessionId, "events.ndjson.gz"), gzip);
}

/** Builds, signs and persists `manifest.json` + `manifest.sig` + the `EvidenceManifest` row (seal step 8). */
export async function buildAndSignManifest(orgId: string, sessionId: string, chain: ChainVerification): Promise<void> {
  const eventsLogKey = evidenceStorageKey(orgId, sessionId, "events.ndjson.gz");
  const eventsLogBuffer = await getStorage().getBuffer(eventsLogKey);
  const artifactChecksums = { eventsLog: { sha256: sha256Hex(eventsLogBuffer), sizeBytes: eventsLogBuffer.length } };

  const signer = getSigner();
  const detectorVersions = { all: DETECTOR_VERSION };
  const manifestContent = {
    sessionId,
    chainHead: chain.chainHead,
    lastSeq: chain.lastSeq,
    detectorVersions,
    weightsVersion: WEIGHTS_VERSION,
    artifactChecksums,
    sealedAt: new Date().toISOString(),
    signingKeyId: signer.keyId,
    algorithm: "Ed25519",
  };
  const manifestBytes = Buffer.from(canonicalJson(manifestContent), "utf8");
  const signature = signer.sign(manifestBytes);

  const manifestKey = evidenceStorageKey(orgId, sessionId, "manifest.json");
  const sigKey = evidenceStorageKey(orgId, sessionId, "manifest.sig");
  await getStorage().put(manifestKey, manifestBytes);
  await getStorage().put(sigKey, Buffer.from(signature.signatureBase64, "utf8"));

  await prisma.evidenceManifest.upsert({
    where: { sessionId },
    create: {
      sessionId,
      chainHead: chain.chainHead,
      lastSeq: chain.lastSeq,
      eventLogUri: eventsLogKey,
      manifestUri: manifestKey,
      signature: signature.signatureBase64,
      signingKeyId: signer.keyId,
      detectorVersions,
      weightsVersion: WEIGHTS_VERSION,
      artifactChecksums,
    },
    update: {
      chainHead: chain.chainHead,
      lastSeq: chain.lastSeq,
      eventLogUri: eventsLogKey,
      manifestUri: manifestKey,
      signature: signature.signatureBase64,
      signingKeyId: signer.keyId,
      detectorVersions,
      weightsVersion: WEIGHTS_VERSION,
      artifactChecksums,
      sealedAt: new Date(),
    },
  });
}

export type EvidenceVerification = {
  valid: boolean;
  chainValid: boolean;
  signatureValid: boolean;
  lastSeq: number;
  chainHead: string;
  firstBrokenSeq: number | null;
  verifiedAt: string;
};

type SignedManifestContent = {
  chainHead: string;
  lastSeq: number;
  eventsLogSha256: string;
};

/** Parses the bytes that were actually signed, trusting nothing else. Returns null on anything unexpected
 * so a malformed or tampered manifest fails verification instead of throwing. */
function parseSignedManifest(bytes: Buffer): SignedManifestContent | null {
  try {
    const raw = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    const artifactChecksums = raw.artifactChecksums as Record<string, unknown> | undefined;
    const eventsLog = artifactChecksums?.eventsLog as Record<string, unknown> | undefined;
    if (typeof raw.chainHead !== "string" || typeof raw.lastSeq !== "number" || typeof eventsLog?.sha256 !== "string") {
      return null;
    }
    return { chainHead: raw.chainHead, lastSeq: raw.lastSeq, eventsLogSha256: eventsLog.sha256 };
  } catch {
    return null;
  }
}

/**
 * `GET /sessions/:id/evidence/verify` (Design.md §4.11). Chain validity is recomputed straight from the
 * `Observation` table (never from the exported file). It is cross-checked against the `chainHead`/
 * `lastSeq`/event-log checksum recorded **inside the signed `manifest.json` bytes themselves** — not the
 * mutable `EvidenceManifest` database row, which anyone with database write access could otherwise edit
 * to match a rewritten chain without needing the signing key at all. A tampered row, a row added or
 * removed after sealing, or a replaced event log are all caught this way, independent of the DB.
 */
export async function verifySession(orgId: string, sessionId: string): Promise<EvidenceVerification> {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const manifest = await prisma.evidenceManifest.findUnique({ where: { sessionId } });
  if (!manifest) {
    throw new AppError("NOT_FOUND", "This session has not been sealed yet.");
  }

  const chain = await verifyChain(sessionId);

  // Read and parse the manifest content independently of whether the signature verifies: "does the
  // chain match what was recorded at seal time" and "is the recording itself authentic" are different
  // questions, and collapsing them together would make a tampered .sig file (content untouched) look
  // like a broken chain instead of what it actually is — an authenticity problem, not a data problem.
  let signedContent: SignedManifestContent | null = null;
  try {
    const manifestBytes = await getStorage().getBuffer(manifest.manifestUri);
    signedContent = parseSignedManifest(manifestBytes);
  } catch {
    signedContent = null;
  }

  let signatureValid = false;
  try {
    const signer = getSigner();
    const manifestBytes = await getStorage().getBuffer(manifest.manifestUri);
    const sigKey = manifest.manifestUri.replace(/\.json$/, ".sig");
    const sigBytes = await getStorage().getBuffer(sigKey);
    signatureValid = manifest.signingKeyId === signer.keyId && signer.verify(manifestBytes, sigBytes.toString("utf8"));
  } catch {
    signatureValid = false;
  }

  let manifestMatchesContent = false;
  if (signedContent) {
    const eventsLogBuffer = await getStorage()
      .getBuffer(manifest.eventLogUri)
      .catch(() => null);
    const eventsLogSha256 = eventsLogBuffer ? sha256Hex(eventsLogBuffer) : null;
    manifestMatchesContent =
      signedContent.chainHead === chain.chainHead && signedContent.lastSeq === chain.lastSeq && signedContent.eventsLogSha256 === eventsLogSha256;
  }

  const chainValid = chain.valid && manifestMatchesContent;
  const firstBrokenSeq = chain.firstBrokenSeq ?? (manifestMatchesContent ? null : Math.min(chain.lastSeq, signedContent?.lastSeq ?? chain.lastSeq) + 1);

  const verifiedAt = new Date();
  await prisma.evidenceManifest.update({ where: { sessionId }, data: { verifiedAt } });

  return {
    valid: chainValid && signatureValid,
    chainValid,
    signatureValid,
    lastSeq: chain.lastSeq,
    chainHead: chain.chainHead,
    firstBrokenSeq,
    verifiedAt: verifiedAt.toISOString(),
  };
}
