import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "@/lib/api/client";

/** The Socket.IO server shares an origin with the REST API, minus the /api/v1 prefix. */
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

export type CandidateSocket = Socket;

/** Everything the server is allowed to send a candidate (an allow-list; never scores or flags). */
export type CandidateServerEvents = {
  "session.state": { status: "WAITING" | "LIVE" | "ENDED" };
  "time.remaining": { remainingMs: number };
  "warn.show": { warningId: string; tier: "NOTICE" | "WARNING" | "INTERRUPT"; message: string; displayMs?: number };
  "task.frozen": { taskId: string };
  "session.ended": { message: string };
};

export function connectCandidateSocket(candidateToken: string): CandidateSocket {
  return io(`${API_ORIGIN}/candidate`, { auth: { token: candidateToken }, reconnection: true });
}

type ClockSample = { offsetMs: number; rttMs: number };

/**
 * NTP-style clock sync (Design.md §5.4): three round trips, keep the one with the lowest RTT, and tell the
 * server the offset so it can place telemetry on the server timeline.
 */
export async function syncClock(socket: CandidateSocket): Promise<ClockSample | null> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < 3; i++) {
    const sample = await new Promise<ClockSample | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2000);
      const clientSentAt = Date.now();
      socket.emit("clock.sync", { clientSentAt }, (res: { serverReceivedAt: number; serverSentAt: number } | undefined) => {
        clearTimeout(timeout);
        if (!res) return resolve(null);
        const clientReceivedAt = Date.now();
        resolve({
          offsetMs: (res.serverReceivedAt - clientSentAt + (res.serverSentAt - clientReceivedAt)) / 2,
          rttMs: Math.max(0, clientReceivedAt - clientSentAt - (res.serverSentAt - res.serverReceivedAt)),
        });
      });
    });
    if (sample) samples.push(sample);
  }
  if (samples.length === 0) return null;
  const best = samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
  socket.emit("clock.offset", best);
  return best;
}
