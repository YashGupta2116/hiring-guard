import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { registry } from "../live/registry.js";
import { verifyAccessToken, verifyCandidateToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { bindSocketServer, replayFrom } from "./emitter.js";
import { clockOffsetSchema, clockSyncSchema, sessionJoinSchema, telemetryBatchSchema } from "./events.js";

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN", "REVIEWER"]);

async function hasSessionAccess(orgId: string, userId: string, role: string, sessionId: string): Promise<boolean> {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) return false;
  if (PRIVILEGED_ROLES.has(role)) return true;
  const bound = await prisma.sessionInterviewer.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  return Boolean(bound);
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false, credentials: true },
  });
  bindSocketServer(io);

  const interviewerNsp = io.of("/interviewer");
  interviewerNsp.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    verifyAccessToken(token)
      .then((payload) => {
        socket.data.user = payload;
        next();
      })
      .catch(() => next(new Error("UNAUTHENTICATED")));
  });

  interviewerNsp.on("connection", (socket) => {
    socket.on("session.join", (raw: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = sessionJoinSchema.safeParse(raw);
        if (!parsed.success) {
          ack?.({ ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid session.join payload." } });
          return;
        }
        const user = socket.data.user as { sub: string; orgId: string; role: string };
        const allowed = await hasSessionAccess(user.orgId, user.sub, user.role, parsed.data.sessionId);
        if (!allowed) {
          ack?.({ ok: false, error: { code: "FORBIDDEN", message: "Not assigned to this session." } });
          return;
        }

        await socket.join(`session:${parsed.data.sessionId}`);
        const replayed = parsed.data.lastFrameSeq !== undefined ? await replayFrom(parsed.data.sessionId, parsed.data.lastFrameSeq) : [];
        for (const entry of replayed) {
          socket.emit(entry.event, entry.frame);
        }
        ack?.({ ok: true, replayed: replayed.length });
      })().catch((err: unknown) => {
        logger.error({ err }, "session.join failed");
        ack?.({ ok: false, error: { code: "INTERNAL", message: "Something went wrong." } });
      });
    });
  });

  const candidateNsp = io.of("/candidate");
  candidateNsp.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    verifyCandidateToken(token)
      .then(async (payload) => {
        const consent = await prisma.consent.findUnique({ where: { id: payload.consentId } });
        if (!consent || consent.sessionId !== payload.sid) {
          next(new Error("UNAUTHENTICATED"));
          return;
        }
        socket.data.sessionId = payload.sid;
        next();
      })
      .catch(() => next(new Error("UNAUTHENTICATED")));
  });

  candidateNsp.on("connection", (socket) => {
    const sessionId = socket.data.sessionId as string;
    socket.data.clockOffsetMs = 0;
    void socket.join(`session:${sessionId}`);
    registry.get(sessionId)?.onCandidateConnected();

    // Clock sync/offset and telemetry batches never disconnect the socket on a bad payload
    // (Rules.md §6) — invalid payloads are just dropped.
    socket.on("clock.sync", (raw: unknown, ack?: (res: unknown) => void) => {
      const parsed = clockSyncSchema.safeParse(raw);
      if (!parsed.success) return;
      ack?.({ serverReceivedAt: Date.now(), serverSentAt: Date.now() });
    });

    socket.on("clock.offset", (raw: unknown) => {
      const parsed = clockOffsetSchema.safeParse(raw);
      if (!parsed.success) return;
      socket.data.clockOffsetMs = parsed.data.offsetMs;
    });

    socket.on("tel.batch", (raw: unknown) => {
      const parsed = telemetryBatchSchema.safeParse(raw);
      if (!parsed.success) return;
      const offsetMs = (socket.data.clockOffsetMs as number | undefined) ?? 0;
      registry.get(sessionId)?.handleTelemetryBatch(parsed.data.connId, parsed.data.seq, parsed.data.events, offsetMs);
    });

    socket.on("disconnect", () => {
      registry.get(sessionId)?.onCandidateDisconnected();
    });
  });

  return io;
}
