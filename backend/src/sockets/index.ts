import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { registry } from "../live/registry.js";
import { acknowledgeWarning } from "../live/warden.js";
import * as noteService from "../services/note.service.js";
import { ingestExternalObservations, ingestHeartbeat } from "../services/internal.service.js";
import { verifyAccessToken, verifyCandidateToken } from "../utils/jwt.js";
import { handleCandidateViolation } from "../services/lifecycle.service.js";
import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { bindSocketServer, replayFrom } from "./emitter.js";
import {
  clockOffsetSchema,
  clockSyncSchema,
  cvBatchSchema,
  cvHeartbeatSchema,
  cvStatusSchema,
  rtcSignalSchema,
  violationSchema,
  editorDeltaSchema,
  editorSnapshotSchema,
  noteAddSchema,
  sessionJoinSchema,
  telemetryBatchSchema,
  warnAckSchema,
} from "./events.js";

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
  const candidateNsp = io.of("/candidate");
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

    socket.on("rtc.signal", (raw: unknown) => {
      const parsed = rtcSignalSchema.safeParse(raw);
      if (!parsed.success) return;
      for (const room of socket.rooms) {
        if (!room.startsWith("session:")) continue;
        candidateNsp.to(room).emit("rtc.signal", { ...parsed.data, from: socket.id });
        return;
      }
    });

    socket.on("note.add", (raw: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = noteAddSchema.safeParse(raw);
        if (!parsed.success) {
          ack?.({ ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid note.add payload." } });
          return;
        }
        for (const room of socket.rooms) {
          if (!room.startsWith("session:")) continue;
          const sessionId = room.slice("session:".length);
          const user = socket.data.user as { sub: string };
          const note = await noteService.addNote(sessionId, user.sub, parsed.data.body);
          ack?.({ ok: true, note });
          return;
        }
        ack?.({ ok: false, error: { code: "FORBIDDEN", message: "Join a session first." } });
      })().catch((err: unknown) => {
        logger.error({ err }, "note.add failed");
        ack?.({ ok: false, error: { code: "INTERNAL", message: "Something went wrong." } });
      });
    });
  });

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
      void redis.hset(`s:${sessionId}:state`, "telemetrySeen", "1").catch(() => undefined);
      const offsetMs = (socket.data.clockOffsetMs as number | undefined) ?? 0;
      registry.get(sessionId)?.handleTelemetryBatch(parsed.data.connId, parsed.data.seq, parsed.data.events, offsetMs);
    });

    socket.on("editor.delta", (raw: unknown) => {
      const parsed = editorDeltaSchema.safeParse(raw);
      if (!parsed.success) return;
      const offsetMs = (socket.data.clockOffsetMs as number | undefined) ?? 0;
      registry.get(sessionId)?.handleEditorDelta(parsed.data.taskId, parsed.data.seq, parsed.data.changes, offsetMs);
    });

    socket.on("editor.snapshot", (raw: unknown) => {
      const parsed = editorSnapshotSchema.safeParse(raw);
      if (!parsed.success) return;
      registry.get(sessionId)?.handleEditorSnapshot(parsed.data.taskId, parsed.data.language, parsed.data.content);
    });

    // Signalling only: the media itself flows peer-to-peer between the two browsers.
    socket.on("rtc.signal", (raw: unknown) => {
      const parsed = rtcSignalSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = `session:${sessionId}`;
      const payload = { ...parsed.data, from: socket.id };
      if (parsed.data.to) {
        const target = interviewerNsp.sockets.get(parsed.data.to);
        if (target?.rooms.has(room)) target.emit("rtc.signal", payload);
        return;
      }
      interviewerNsp.to(room).emit("rtc.signal", payload);
    });

    // Camera-derived signals (face presence / count / gaze) computed in the candidate's browser.
    socket.on("session.violation", (raw: unknown) => {
      const parsed = violationSchema.safeParse(raw);
      if (!parsed.success) return;
      void handleCandidateViolation(sessionId, parsed.data.kind).catch((err: unknown) => {
        logger.error({ err, sessionId }, "session.violation failed");
      });
    });

    socket.on("cv.batch", (raw: unknown) => {
      const parsed = cvBatchSchema.safeParse(raw);
      if (!parsed.success || !registry.get(sessionId)) return;
      const offsetMs = (socket.data.clockOffsetMs as number | undefined) ?? 0;
      const channelFor = { face_absent: "FACE", multiple_faces: "FACE", gaze_away: "GAZE", foreign_object: "SCENE" } as const;
      const items = parsed.data.items.map((item) => ({
        channel: channelFor[item.type],
        type: item.type,
        ts: new Date(item.ts + offsetMs).toISOString(),
        strength: item.strength,
        payload: item.payload,
      }));
      void ingestExternalObservations(sessionId, "cv", items).catch((err: unknown) => {
        logger.error({ err, sessionId }, "cv.batch failed");
      });
    });

    socket.on("cv.status", (raw: unknown) => {
      const parsed = cvStatusSchema.safeParse(raw);
      if (!parsed.success) return;
      interviewerNsp.to(`session:${sessionId}`).emit("cv.status", parsed.data);
    });

    socket.on("cv.heartbeat", (raw: unknown) => {
      const parsed = cvHeartbeatSchema.safeParse(raw);
      if (!parsed.success || !registry.get(sessionId)) return;
      void ingestHeartbeat(sessionId, "cv", ["FACE", "GAZE"], parsed.data.status).catch((err: unknown) => {
        logger.error({ err, sessionId }, "cv.heartbeat failed");
      });
    });

    socket.on("warn.ack", (raw: unknown) => {
      const parsed = warnAckSchema.safeParse(raw);
      if (!parsed.success) return;
      void acknowledgeWarning(sessionId, parsed.data.warningId, parsed.data.ackedAt).catch((err: unknown) => {
        logger.error({ err, sessionId }, "warn.ack failed");
      });
    });

    socket.on("disconnect", () => {
      registry.get(sessionId)?.onCandidateDisconnected();
    });
  });

  return io;
}
