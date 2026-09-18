import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { registry } from "../../src/live/registry.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { canonicalJson, sha256Hex } from "../../src/utils/hash.js";
import { prisma } from "../../src/utils/prisma.js";
import { redis } from "../../src/utils/redis.js";

const app = createApp();
const httpServer = createServer(app);
createSocketServer(httpServer);

let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.observation.deleteMany(),
    prisma.unscoredWindow.deleteMany(),
    prisma.transcriptSegment.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.preflightCheck.deleteMany(),
    prisma.joinToken.deleteMany(),
    prisma.sessionInterviewer.deleteMany(),
    prisma.interviewSession.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.orgMember.deleteMany(),
    prisma.candidate.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  await redis.quit();
});

const openSockets: Socket[] = [];
afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
});

function connectSocket(namespace: string, token: string): Promise<Socket> {
  const socket = ioClient(`${baseUrl}${namespace}`, { auth: { token }, transports: ["websocket"], forceNew: true });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

async function registerOwner() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: `owner-${Date.now()}-${Math.random()}@example.com`, password: "correct-horse-battery", orgName: "Acme" });
  return { accessToken: res.body.data.accessToken as string };
}

async function startLiveSession(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" });
  const sessionId = created.body.data.id as string;
  await request(app).patch(`/api/v1/sessions/${sessionId}/config`).set("Authorization", `Bearer ${accessToken}`).send({ channels: ["FOCUS", "PASTE"] });
  const link = await request(app)
    .post(`/api/v1/sessions/${sessionId}/links`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const rawToken = (link.body.data.url as string).split("/join/")[1]!;

  const probe = {
    webrtc: true,
    getDisplayMedia: true,
    camera: "granted",
    microphone: "granted",
    screenCount: 1,
    isExtended: false,
    downlinkMbps: 20,
    hardwareConcurrency: 8,
    userAgent: "vitest",
  };
  const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(probe);
  const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);
  const consent = await request(app)
    .post(`/api/v1/join/${rawToken}/consent`)
    .send({ preflightId: preflight.body.data.preflightId, policyHash: policy.body.data.policyHash, accepted: true, scrolledToEnd: true });
  const candidateToken = consent.body.data.candidateToken as string;

  await request(app)
    .post("/api/v1/candidate/media-ready")
    .set("Authorization", `Bearer ${candidateToken}`)
    .send({ tracks: { camera: true, microphone: true, screen: true } });

  await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${accessToken}`);
  return { sessionId, candidateToken, accessToken };
}

function recomputeChain(sessionId: string, rows: Array<{ seq: number; source: string; channel: string; type: string; ts: Date; payload: unknown }>) {
  let prevHash = sha256Hex(`veritrust:${sessionId}`);
  const hashes: string[] = [];
  for (const row of rows) {
    const hash = sha256Hex(
      prevHash + canonicalJson({ sessionId, seq: row.seq, source: row.source, channel: row.channel, type: row.type, ts: row.ts, payload: row.payload }),
    );
    hashes.push(hash);
    prevHash = hash;
  }
  return hashes;
}

describe("candidate telemetry -> evidence hash chain", () => {
  it("chains observations with correct seq/prevHash/hash and assigns an LLR", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);

    const socket = await connectSocket("/candidate", candidateToken);
    socket.emit("tel.batch", {
      connId: "conn-1",
      seq: 1,
      sentAt: Date.now(),
      events: [
        { kind: "focus", state: "blur", ts: 1000 },
        { kind: "focus", state: "focus", ts: 2000 },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await registry.get(sessionId)!.flush();

    const rows = await prisma.observation.findMany({ where: { sessionId }, orderBy: { seq: "asc" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seq).toBe(1);
    expect(rows[0]!.type).toBe("focus_loss");
    expect(rows[0]!.source).toBe("CLIENT");
    expect(typeof rows[0]!.llr).toBe("number");
    expect(rows[0]!.llr).toBeGreaterThan(0);

    const [expectedHash] = recomputeChain(sessionId, rows);
    expect(rows[0]!.hash).toBe(expectedHash);
    expect(rows[0]!.prevHash).toBe(sha256Hex(`veritrust:${sessionId}`));

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("drops a duplicate seq without creating a second observation", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);

    const batch = { connId: "conn-dup", seq: 1, sentAt: Date.now(), events: [{ kind: "focus", state: "blur", ts: 0 }, { kind: "focus", state: "focus", ts: 900 }] };
    socket.emit("tel.batch", batch);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await registry.get(sessionId)!.flush();
    socket.emit("tel.batch", batch);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await registry.get(sessionId)!.flush();

    const rows = await prisma.observation.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("opens an unscored window for every client channel on a sequence gap", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);

    socket.emit("tel.batch", { connId: "conn-gap", seq: 1, sentAt: Date.now(), events: [{ kind: "focus", state: "blur", ts: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // seq jumps from 1 to 3: an unreplayable gap (FR-TEL-2).
    socket.emit("tel.batch", { connId: "conn-gap", seq: 3, sentAt: Date.now(), events: [{ kind: "focus", state: "blur", ts: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await registry.get(sessionId)!.flush();

    const windows = await prisma.unscoredWindow.findMany({ where: { sessionId, reason: "SEQUENCE_GAP" } });
    expect(windows).toHaveLength(5);
    expect(new Set(windows.map((w) => w.channel))).toEqual(new Set(["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"]));

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("internal API (CV/ASR producers)", () => {
  function auth() {
    return `Bearer ${env.INTERNAL_SERVICE_TOKEN}`;
  }

  it("rejects a missing or wrong service token", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    const res = await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/observations`)
      .send({ producer: "cv", items: [{ channel: "GAZE", type: "gaze_away", ts: new Date().toISOString(), strength: 0.5, payload: {} }] });
    expect(res.status).toBe(401);

    const wrong = await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/observations`)
      .set("Authorization", "Bearer not-the-token-not-the-token-not-the-token")
      .send({ producer: "cv", items: [{ channel: "GAZE", type: "gaze_away", ts: new Date().toISOString(), strength: 0.5, payload: {} }] });
    expect(wrong.status).toBe(401);
  });

  it("appends CV observations onto the same session hash chain, continuing seq", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    socket.emit("tel.batch", { connId: "conn-mix", seq: 1, sentAt: Date.now(), events: [{ kind: "focus", state: "blur", ts: 0 }, { kind: "focus", state: "focus", ts: 900 }] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await registry.get(sessionId)!.flush();

    const res = await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/observations`)
      .set("Authorization", auth())
      .send({ producer: "cv", items: [{ channel: "GAZE", type: "gaze_away", ts: new Date().toISOString(), strength: 0.7, payload: { note: "test" } }] });
    expect(res.status).toBe(202);

    const rows = await prisma.observation.findMany({ where: { sessionId }, orderBy: { seq: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.seq).toBe(2);
    expect(rows[1]!.source).toBe("CV");
    expect(rows[1]!.prevHash).toBe(rows[0]!.hash);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("rejects observations for a session that is not LIVE", async () => {
    const owner = await registerOwner();
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" });
    const sessionId = created.body.data.id as string;

    const res = await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/observations`)
      .set("Authorization", auth())
      .send({ producer: "cv", items: [{ channel: "GAZE", type: "gaze_away", ts: new Date().toISOString(), strength: 0.5, payload: {} }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("stores transcript segments and marks earlier partials for the same span superseded on a final", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/transcript`)
      .set("Authorization", auth())
      .send({ segments: [{ speaker: "CANDIDATE", text: "partial words", startMs: 0, endMs: 1000, isFinal: false }] });

    await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/transcript`)
      .set("Authorization", auth())
      .send({ segments: [{ speaker: "CANDIDATE", text: "final words", startMs: 0, endMs: 1200, isFinal: true }] });

    const segments = await prisma.transcriptSegment.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.isFinal).toBe(false);
    expect(segments[0]!.supersededAt).not.toBeNull();
    expect(segments[1]!.isFinal).toBe(true);
    expect(segments[1]!.supersededAt).toBeNull();

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("opens a DETECTOR_DOWN unscored window when a producer reports DEGRADED and closes it on recovery", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/heartbeat`)
      .set("Authorization", auth())
      .send({ producer: "cv", channels: ["GAZE", "FACE"], status: "DEGRADED" });

    let windows = await prisma.unscoredWindow.findMany({ where: { sessionId, reason: "DETECTOR_DOWN" } });
    expect(windows).toHaveLength(2);
    expect(windows.every((w) => w.endTs === null)).toBe(true);

    await request(app)
      .post(`/api/v1/internal/sessions/${sessionId}/heartbeat`)
      .set("Authorization", auth())
      .send({ producer: "cv", channels: ["GAZE", "FACE"], status: "OK" });

    windows = await prisma.unscoredWindow.findMany({ where: { sessionId, reason: "DETECTOR_DOWN" } });
    expect(windows.every((w) => w.endTs !== null)).toBe(true);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});
