import { env } from "../config/env.js";
import { getStorage } from "../providers/index.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../utils/prisma.js";
import * as auditService from "./audit.service.js";

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function storagePrefix(orgId: string, sessionId: string, category: string): string {
  return `orgs/${orgId}/sessions/${sessionId}/${category}`;
}

export type RetentionSummary = {
  mediaSessionsPurged: number;
  observationsDeleted: number;
  eventLogsPurged: number;
  reportsDeleted: number;
  transcriptSegmentsDeleted: number;
};

/**
 * Recordings + evidence frames: media bytes and the frame/thumbnail index are heavy and the
 * least reusable after the fact, so they go first (PRD FR-RET-1: 90 days). The `Recording` row
 * itself stays — egressId/timestamps/checksum are cheap provenance the audit trail can still
 * point to — only the media pointers are cleared.
 */
async function purgeMedia(now: Date): Promise<number> {
  const cutoff = daysAgo(now, env.RETENTION_MEDIA_DAYS);
  const recordings = await prisma.recording.findMany({
    where: {
      endedAt: { lte: cutoff },
      OR: [{ compositeUri: { not: null } }, { hlsUri: { not: null } }],
    },
    include: { session: { select: { orgId: true } } },
  });

  for (const recording of recordings) {
    await getStorage().deletePrefix(storagePrefix(recording.session.orgId, recording.sessionId, "recordings"));
    await prisma.recording.update({
      where: { sessionId: recording.sessionId },
      data: { compositeUri: null, hlsUri: null, checksum: null, mediaIndex: Prisma.JsonNull },
    });
    await auditService.log({
      orgId: recording.session.orgId,
      sessionId: recording.sessionId,
      actorType: "SYSTEM",
      action: "retention.deleted",
      metadata: { category: "media", cutoff: cutoff.toISOString() },
    });
  }

  return recordings.length;
}

/** Raw observations: the largest table by row count, and the source data behind every score. */
async function purgeObservations(now: Date): Promise<number> {
  const cutoff = daysAgo(now, env.RETENTION_OBSERVATIONS_DAYS);
  const sessions = await prisma.interviewSession.findMany({
    where: { endedAt: { lte: cutoff }, observations: { some: {} } },
    select: { id: true, orgId: true },
  });

  let deleted = 0;
  for (const session of sessions) {
    const { count } = await prisma.observation.deleteMany({ where: { sessionId: session.id } });
    if (count === 0) continue;
    deleted += count;
    await auditService.log({
      orgId: session.orgId,
      sessionId: session.id,
      actorType: "SYSTEM",
      action: "retention.deleted",
      metadata: { category: "observations", cutoff: cutoff.toISOString(), count },
    });
  }

  return deleted;
}

/**
 * Evidence log floor: Phases.md ties this to the observations window but guarantees it never
 * disappears before `RETENTION_EVIDENCE_LOG_FLOOR_DAYS`, so the cutoff is whichever window is
 * longer. Only the raw ndjson event log is removed — `manifestUri`/signature stay, since the
 * chain head hash must stay independently verifiable for the full report retention window.
 */
async function purgeEventLogs(now: Date): Promise<number> {
  const cutoffDays = Math.max(env.RETENTION_OBSERVATIONS_DAYS, env.RETENTION_EVIDENCE_LOG_FLOOR_DAYS);
  const cutoff = daysAgo(now, cutoffDays);
  const manifests = await prisma.evidenceManifest.findMany({
    where: { sealedAt: { lte: cutoff } },
    include: { session: { select: { orgId: true } } },
  });

  let purged = 0;
  for (const manifest of manifests) {
    if (!(await getStorage().exists(manifest.eventLogUri))) continue;
    await getStorage().delete(manifest.eventLogUri);
    purged += 1;
    await auditService.log({
      orgId: manifest.session.orgId,
      sessionId: manifest.sessionId,
      actorType: "SYSTEM",
      action: "retention.deleted",
      metadata: { category: "event_log", cutoff: cutoff.toISOString() },
    });
  }

  return purged;
}

/** Reports + transcripts: neither is in the append-only set, so rows are hard-deleted outright. */
async function purgeReportsAndTranscripts(now: Date): Promise<{ reports: number; transcriptSegments: number }> {
  const cutoff = daysAgo(now, env.RETENTION_REPORTS_DAYS);
  const sessions = await prisma.interviewSession.findMany({
    where: { endedAt: { lte: cutoff }, OR: [{ report: { isNot: null } }, { transcript: { some: {} } }] },
    select: { id: true, orgId: true, report: { select: { htmlUri: true, pdfUri: true } } },
  });

  let reports = 0;
  let transcriptSegments = 0;
  for (const session of sessions) {
    if (session.report) {
      if (session.report.htmlUri) await getStorage().delete(session.report.htmlUri).catch(() => undefined);
      if (session.report.pdfUri) await getStorage().delete(session.report.pdfUri).catch(() => undefined);
      await prisma.report.delete({ where: { sessionId: session.id } });
      reports += 1;
    }

    const { count } = await prisma.transcriptSegment.deleteMany({ where: { sessionId: session.id } });
    transcriptSegments += count;

    if (session.report || count > 0) {
      await auditService.log({
        orgId: session.orgId,
        sessionId: session.id,
        actorType: "SYSTEM",
        action: "retention.deleted",
        metadata: { category: "report_and_transcript", cutoff: cutoff.toISOString(), transcriptSegments: count },
      });
    }
  }

  return { reports, transcriptSegments };
}

/**
 * Runs every retention window once. `now` is injectable so tests can seed fixtures at fixed
 * offsets in the past and assert deterministically instead of racing real wall-clock time.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionSummary> {
  const mediaSessionsPurged = await purgeMedia(now);
  const observationsDeleted = await purgeObservations(now);
  const eventLogsPurged = await purgeEventLogs(now);
  const { reports: reportsDeleted, transcriptSegments: transcriptSegmentsDeleted } = await purgeReportsAndTranscripts(now);

  return { mediaSessionsPurged, observationsDeleted, eventLogsPurged, reportsDeleted, transcriptSegmentsDeleted };
}
