import { emitToInterviewers } from "../sockets/emitter.js";
import { INTERVIEWER_EVENTS } from "../sockets/events.js";
import { prisma } from "../utils/prisma.js";

function toNoteDto(note: { id: string; sessionId: string; authorId: string; body: string; ts: Date; mediaOffsetMs: number | null }) {
  return { id: note.id, sessionId: note.sessionId, authorId: note.authorId, body: note.body, ts: note.ts.toISOString(), mediaOffsetMs: note.mediaOffsetMs };
}

export async function listNotes(sessionId: string) {
  const notes = await prisma.note.findMany({ where: { sessionId }, orderBy: { ts: "asc" } });
  return notes.map(toNoteDto);
}

/**
 * `mediaOffsetMs` needs the recording's `egressStartedAt` anchor (Design.md "media offsets from
 * startedAt"), which doesn't exist until a real media provider records something (Phase 9). Left `null`
 * until then rather than guessing from `InterviewSession.startedAt`.
 */
export async function addNote(sessionId: string, authorId: string, body: string) {
  const note = await prisma.note.create({ data: { sessionId, authorId, body, mediaOffsetMs: null } });
  const dto = toNoteDto(note);
  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.NOTE_ADDED, dto);
  return dto;
}
