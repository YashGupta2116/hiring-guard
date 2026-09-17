import type { Server } from "socket.io";
import { DASHBOARD_FRAME_BUFFER_SIZE } from "../config/constants.js";
import { redis } from "../utils/redis.js";

export type DashboardFrame = { frameSeq: number; sessionId: string; ts: string; data: unknown };

let io: Server | undefined;

/** Called once from sockets/index.ts after the Socket.IO server is created. */
export function bindSocketServer(server: Server): void {
  io = server;
}

const bufferKey = (sessionId: string) => `s:${sessionId}:buf`;
const seqKey = (sessionId: string) => `s:${sessionId}:frameseq`;

/**
 * Wraps `data` in the frame envelope (Design.md §5.1), appends it to the 2000-frame replay
 * buffer, and emits it to every socket in `session:{sid}` on the /interviewer namespace.
 */
export async function emitToInterviewers(sessionId: string, event: string, data: unknown): Promise<DashboardFrame> {
  const frameSeq = await redis.incr(seqKey(sessionId));
  const frame: DashboardFrame = { frameSeq, sessionId, ts: new Date().toISOString(), data };

  await redis.lpush(bufferKey(sessionId), JSON.stringify({ event, frame }));
  await redis.ltrim(bufferKey(sessionId), 0, DASHBOARD_FRAME_BUFFER_SIZE - 1);

  io?.of("/interviewer").to(`session:${sessionId}`).emit(event, frame);
  return frame;
}

/** Server -> candidate events are not buffered or frame-sequenced (Design.md §5.5). */
export function emitToCandidate(sessionId: string, event: string, data: unknown): void {
  io?.of("/candidate").to(`session:${sessionId}`).emit(event, data);
}

/** Replays buffered frames with `frameSeq > afterSeq`, oldest first (used by `session.join`). */
export async function replayFrom(sessionId: string, afterSeq: number): Promise<{ event: string; frame: DashboardFrame }[]> {
  const raw = await redis.lrange(bufferKey(sessionId), 0, -1); // newest first (LPUSH)
  const entries = raw.map((item) => JSON.parse(item) as { event: string; frame: DashboardFrame });
  return entries.filter((entry) => entry.frame.frameSeq > afterSeq).sort((a, b) => a.frame.frameSeq - b.frame.frameSeq);
}
