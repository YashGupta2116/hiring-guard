import { RECORDING_FINALIZE_TIMEOUT_MS, SEAL_DRAIN_TIMEOUT_MS, SEAL_PROGRESS_TTL_SECONDS } from "../config/constants.js";
import { closeAllOpenUnscoredWindows } from "../live/fusion/unscored.js";
import { registry } from "../live/registry.js";
import type { EndReason } from "../live/session-runtime.js";
import { enqueuePipeline } from "../pipeline/flow.js";
import { getMedia } from "../providers/index.js";
import { broadcastSessionState } from "../sockets/session-broadcast.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";
import { log } from "./audit.service.js";
import { buildAndSignManifest, exportEvidenceLog, verifyChain, type ChainVerification } from "./evidence.service.js";
import { transition } from "./session-state.service.js";

function sealProgressKey(sessionId: string): string {
  return `s:${sessionId}:seal`;
}

async function getCompletedStep(sessionId: string): Promise<number> {
  const raw = await redis.hget(sealProgressKey(sessionId), "step");
  return raw ? Number(raw) : 1; // being in SEALING at all implies step 1 (the CAS) already happened
}

async function markStepDone(sessionId: string, step: number): Promise<void> {
  await redis.hset(sealProgressKey(sessionId), "step", step);
  await redis.expire(sealProgressKey(sessionId), SEAL_PROGRESS_TTL_SECONDS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Seal step 4: stop egress via the media provider. No-op if this session was never recording. */
async function finalizeRecording(sessionId: string): Promise<void> {
  const recording = await prisma.recording.findUnique({ where: { sessionId } });
  if (!recording || !recording.egressId) return;
  if (recording.status === "READY" || recording.status === "FAILED") return; // already finalised (resumed)

  await prisma.recording.update({ where: { sessionId }, data: { status: "FINALIZING" } });

  try {
    const result = await Promise.race([
      getMedia().stopRecording(recording.egressId),
      sleep(RECORDING_FINALIZE_TIMEOUT_MS).then((): never => {
        throw new Error("recording finalize timed out");
      }),
    ]);
    await prisma.recording.update({
      where: { sessionId },
      data: { status: "READY", compositeUri: result.compositeKey, hlsUri: result.hlsKey, endedAt: new Date() },
    });
  } catch (err) {
    logger.warn({ err, sessionId }, "recording finalize failed or timed out; continuing seal");
    await prisma.recording.update({ where: { sessionId }, data: { status: "FAILED", endedAt: new Date() } });
  }
}

/**
 * The real seal sequence (Architecture.md §6.7), numbered and idempotent so a crash resumes at the next
 * step instead of redoing everything. Progress is a single integer in Redis `s:{sid}:seal`; each step is
 * safe to skip on resume (already-finalised recording, existing manifest row, etc.) and safe to re-run
 * from scratch when a fresh session reaches SEALING for the first time.
 *
 * Steps 2/3/6's live-runtime work (draining the write queue, emitting `session.ended`, a final
 * `IntegritySnapshot`) is best-effort: after a real process crash the in-memory `SessionRuntime` and any
 * connected sockets are gone too, so `resumeStuckSeals()` on the next boot simply skips what a live
 * runtime would have done and continues with the DB-only steps (4, 5, 7, 8, 9), which are what actually
 * matter for the signed evidence.
 */
export async function sealSession(orgId: string, sessionId: string, reason: EndReason, actorId?: string): Promise<void> {
  const runtime = registry.get(sessionId);
  const session = await prisma.interviewSession.findFirstOrThrow({ where: { id: sessionId, orgId } });

  if (session.status === "LIVE") {
    const sealing = await transition(sessionId, ["LIVE"], "SEALING", {
      orgId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      extra: { endReason: reason },
    });
    await broadcastSessionState(sessionId, "SEALING", sealing.startedAt, sealing.endedAt, reason);
    await markStepDone(sessionId, 1);
  }

  try {
    let completed = await getCompletedStep(sessionId);
    let chain: ChainVerification | undefined;

    if (completed < 2) {
      if (runtime) await Promise.race([runtime.flush(), sleep(SEAL_DRAIN_TIMEOUT_MS)]);
      await markStepDone(sessionId, (completed = 2));
    }

    if (completed < 3) {
      if (runtime) {
        await runtime.destroy(); // stops timers/lease and emits the candidate session.ended thank-you
        registry.delete(sessionId);
      }
      await markStepDone(sessionId, (completed = 3));
    }

    if (completed < 4) {
      await finalizeRecording(sessionId);
      await markStepDone(sessionId, (completed = 4));
    }

    if (completed < 5) {
      // Producer ingest already checks session.status === "LIVE" (internal.service.ts), so once this
      // session left LIVE at step 1 further producer input is already rejected; nothing else to detach.
      await log({ orgId, sessionId, actorType: "SYSTEM", action: "seal.producers_detached" });
      await markStepDone(sessionId, (completed = 5));
    }

    if (completed < 6) {
      if (runtime) {
        await prisma.integritySnapshot.create({ data: { sessionId, ts: new Date(), score: runtime.snapshotIntegrity(), channels: {} } });
      }
      await closeAllOpenUnscoredWindows(sessionId, new Date());
      await markStepDone(sessionId, (completed = 6));
    }

    if (completed < 7) {
      chain = await verifyChain(sessionId);
      if (!chain.valid) {
        throw new Error(`Evidence chain is broken at seq ${chain.firstBrokenSeq}; refusing to seal`);
      }
      await exportEvidenceLog(orgId, sessionId);
      await markStepDone(sessionId, (completed = 7));
    }

    if (completed < 8) {
      chain ??= await verifyChain(sessionId);
      await buildAndSignManifest(orgId, sessionId, chain);
      await markStepDone(sessionId, (completed = 8));
    }

    if (completed < 9) {
      const processing = await transition(sessionId, ["SEALING"], "PROCESSING", { orgId, actorType: "SYSTEM" });
      await broadcastSessionState(sessionId, "PROCESSING", processing.startedAt, processing.endedAt, reason);
      await enqueuePipeline(orgId, sessionId);
      await markStepDone(sessionId, (completed = 9));
    }
  } catch (err) {
    logger.error({ err, sessionId }, "seal sequence failed; aborting session");
    await log({
      orgId,
      sessionId,
      actorType: "SYSTEM",
      action: "seal.failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    const aborted = await transition(sessionId, ["SEALING"], "ABORTED", { orgId, actorType: "SYSTEM", extra: { endReason: "fatal" } });
    await broadcastSessionState(sessionId, "ABORTED", aborted.startedAt, aborted.endedAt, "fatal");
    throw err;
  }
}

/** Called once at API boot: any session still SEALING means the process died mid-seal last time. */
export async function resumeStuckSeals(): Promise<void> {
  const stuck = await prisma.interviewSession.findMany({ where: { status: "SEALING" } });
  for (const session of stuck) {
    logger.warn({ sessionId: session.id }, "resuming seal sequence after restart");
    const reason = (session.endReason as EndReason | null) ?? "fatal";
    await sealSession(session.orgId, session.id, reason).catch((err: unknown) => {
      logger.error({ err, sessionId: session.id }, "seal resume failed");
    });
  }
}
