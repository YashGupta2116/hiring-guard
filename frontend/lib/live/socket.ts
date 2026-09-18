import { io, type Socket } from "socket.io-client";
import { API_BASE_URL, getAccessToken, refreshAccessToken } from "@/lib/api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

/** Every server -> interviewer event arrives wrapped in this envelope (Design.md §5.1). */
export type Frame<T> = { frameSeq: number; sessionId: string; ts: string; data: T };

export type IntegrityTick = {
  score: number;
  calibrating: boolean;
  channels: { channel: string; contribution: number; scored: boolean }[];
};

export type TimerTick = { elapsedMs: number; remainingMs: number; frozen: boolean };
export type SessionState = { status: string; startedAt: string | null; endedAt: string | null; endReason: string | null };
export type Presence = { connected: boolean; since: string; graceEndsAt?: string };
export type WarnIssued = { warningId: string; flagId: string; type: string; tier: string; message: string; shownAt: string };
export type SystemDegraded = { producer: string; channels?: string[]; since?: string; recoveredAt?: string };
export type TranscriptFinal = { segmentId: string; speaker: string; text: string; startMs: number; endMs?: number };
export type ReportReady = { reportId: string; degraded: boolean };

export type InterviewerSocket = Socket;

/**
 * The access token is only checked at handshake and expires after 15 minutes, so the auth callback gets
 * a fresh one every time the socket (re)connects, otherwise a reconnect mid-interview would be rejected.
 */
export function connectInterviewerSocket(): InterviewerSocket {
  return io(`${API_ORIGIN}/interviewer`, {
    reconnection: true,
    auth: (cb) => {
      void refreshAccessToken()
        .catch(() => null)
        .then((fresh) => cb({ token: fresh ?? getAccessToken() ?? "" }));
    },
  });
}

export function joinSession(socket: InterviewerSocket, sessionId: string, lastFrameSeq: number): Promise<{ ok: boolean; replayed?: number; error?: { code: string; message: string } }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: { code: "TIMEOUT", message: "The live connection did not respond." } }), 8000);
    socket.emit("session.join", { sessionId, lastFrameSeq }, (res: { ok: boolean; replayed?: number; error?: { code: string; message: string } }) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}
