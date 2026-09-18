import { prisma } from "../../utils/prisma.js";

export type MediaIndexOutput = { anchored: boolean; markerCount: number };

type Marker = { ts: number; type: "flag" | "note"; refId: string; label: string };

/**
 * Resolves the `mediaOffsetMs` TODO left open in Phase 7/9: `flag-builder.ts` and
 * `note.service.ts` both persist `mediaOffsetMs: null` because, at the time either row is
 * created, "`mediaOffsetMs` needs the recording's `egressStartedAt` anchor... which doesn't exist
 * until a real media provider records something" (note.service.ts). That anchor exists now — the
 * seal sequence (Phase 9) always finalises `Recording.egressStartedAt` before a session reaches
 * PROCESSING. This step computes every flag's and note's offset from it, and builds the
 * `Recording.mediaIndex` marker table a report/dashboard scrubber reads (PRD: "every flag jumps
 * to its exact moment in the recording").
 */
export async function computeMediaIndex(sessionId: string): Promise<MediaIndexOutput> {
  const recording = await prisma.recording.findUnique({ where: { sessionId } });
  if (!recording?.egressStartedAt) {
    return { anchored: false, markerCount: 0 };
  }
  const anchorMs = recording.egressStartedAt.getTime();
  const offsetOf = (ts: Date): number => Math.max(0, ts.getTime() - anchorMs);

  const [flags, notes] = await Promise.all([
    prisma.flag.findMany({ where: { sessionId } }),
    prisma.note.findMany({ where: { sessionId } }),
  ]);

  await prisma.$transaction([
    ...flags.map((flag) => prisma.flag.update({ where: { id: flag.id }, data: { mediaOffsetMs: offsetOf(flag.startTs) } })),
    ...notes.map((note) => prisma.note.update({ where: { id: note.id }, data: { mediaOffsetMs: offsetOf(note.ts) } })),
  ]);

  const markers: Marker[] = [
    ...flags.map((f): Marker => ({ ts: offsetOf(f.startTs), type: "flag", refId: f.id, label: `${f.severity} ${f.type}` })),
    ...notes.map((n): Marker => ({ ts: offsetOf(n.ts), type: "note", refId: n.id, label: n.body.slice(0, 80) })),
  ].sort((a, b) => a.ts - b.ts);

  await prisma.recording.update({ where: { sessionId }, data: { mediaIndex: markers } });

  return { anchored: true, markerCount: markers.length };
}
