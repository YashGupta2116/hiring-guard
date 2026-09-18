import { getLlr } from "../config/detection.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { MonitoringChannel } from "../generated/prisma/enums.js";
import { registry } from "../live/registry.js";
import type { ProducerStatus } from "../live/producer-health.js";
import type { PendingObservation } from "./evidence.service.js";
import { emitToInterviewers } from "../sockets/emitter.js";
import { INTERVIEWER_EVENTS } from "../sockets/events.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

type ObservationItem = {
  channel: MonitoringChannel;
  type: string;
  ts: string;
  strength: number;
  payload: Record<string, unknown>;
};

const PRODUCER_SOURCE = { cv: "CV", asr: "ASR" } as const;

function requireRuntime(sessionId: string) {
  const runtime = registry.get(sessionId);
  if (!runtime) {
    throw new AppError("INVALID_STATE_TRANSITION", "Session is not LIVE.");
  }
  return runtime;
}

/** Producers send `strength` only; the backend assigns LLR (Design.md §4.12). */
export async function ingestExternalObservations(sessionId: string, producer: "cv" | "asr", items: ObservationItem[]): Promise<void> {
  const runtime = requireRuntime(sessionId);
  const session = await prisma.interviewSession.findUnique({ where: { id: sessionId }, select: { sensitivity: true } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const entries: PendingObservation[] = items.map((item) => ({
    source: PRODUCER_SOURCE[producer],
    channel: item.channel,
    type: item.type,
    clientTs: null,
    ts: new Date(item.ts),
    llr: getLlr(item.type, session.sensitivity),
    payload: item.payload,
  }));

  runtime.appendExternalObservations(entries);
  await runtime.flush();
}

type TranscriptSegmentInput = {
  speaker: "INTERVIEWER" | "CANDIDATE" | "UNKNOWN";
  speakerLabel?: string;
  text: string;
  startMs: number;
  endMs: number;
  isFinal: boolean;
  words?: unknown;
};

export async function ingestTranscript(sessionId: string, segments: TranscriptSegmentInput[]): Promise<void> {
  requireRuntime(sessionId);

  for (const segment of segments) {
    if (segment.isFinal) {
      await prisma.transcriptSegment.updateMany({
        where: { sessionId, speaker: segment.speaker, isFinal: false, supersededAt: null, startMs: { lt: segment.endMs }, endMs: { gt: segment.startMs } },
        data: { supersededAt: new Date() },
      });
    }

    const row = await prisma.transcriptSegment.create({
      data: {
        sessionId,
        speaker: segment.speaker,
        speakerLabel: segment.speakerLabel,
        text: segment.text,
        startMs: segment.startMs,
        endMs: segment.endMs,
        isFinal: segment.isFinal,
        words: segment.words as Prisma.InputJsonValue | undefined,
      },
    });

    await emitToInterviewers(sessionId, segment.isFinal ? INTERVIEWER_EVENTS.TRANSCRIPT_FINAL : INTERVIEWER_EVENTS.TRANSCRIPT_PARTIAL, {
      segmentId: row.id,
      speaker: row.speaker,
      text: row.text,
      startMs: row.startMs,
      ...(segment.isFinal ? { endMs: row.endMs } : {}),
    });
  }
}

export async function ingestHeartbeat(sessionId: string, producer: string, channels: MonitoringChannel[], status: ProducerStatus): Promise<void> {
  const runtime = requireRuntime(sessionId);
  runtime.recordProducerHeartbeat(producer, channels, status);
  await runtime.flush();
}
