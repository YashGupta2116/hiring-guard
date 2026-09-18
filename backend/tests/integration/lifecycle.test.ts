import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
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
    .send({ name: "Owner", email: "owner@example.com", password: "correct-horse-battery", orgName: "Acme" });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

async function admitSession(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" });
  const sessionId = created.body.data.id as string;
  await request(app).patch(`/api/v1/sessions/${sessionId}/config`).set("Authorization", `Bearer ${accessToken}`).send({ channels: ["FOCUS"] });
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
  const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
    preflightId: preflight.body.data.preflightId,
    policyHash: policy.body.data.policyHash,
    accepted: true,
    scrolledToEnd: true,
  });

  return { sessionId, candidateToken: consent.body.data.candidateToken as string };
}

describe("POST /sessions/:id/start guards", () => {
  it("blocks start with MEDIA_NOT_READY before media-ready is confirmed", async () => {
    const owner = await registerOwner();
    const { sessionId } = await admitSession(owner.accessToken);

    const res = await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MEDIA_NOT_READY");
  });

  it("blocks start with RECONSENT_REQUIRED when needsReconsent is set", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await admitSession(owner.accessToken);
    await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });

    await prisma.interviewSession.update({ where: { id: sessionId }, data: { needsReconsent: true } });

    const res = await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RECONSENT_REQUIRED");
  });
});

describe("full lifecycle: start -> LIVE -> end -> PROCESSING", () => {
  it("starts, hydrates a live snapshot, and ends into PROCESSING via the real seal sequence", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await admitSession(owner.accessToken);
    await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });

    const started = await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe("LIVE");

    const live = await request(app).get(`/api/v1/sessions/${sessionId}/live`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(live.status).toBe(200);
    expect(live.body.data.status).toBe("LIVE");
    expect(live.body.data.mediaReady).toBe(true);

    const ended = await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe("PROCESSING");

    // Ending an already-ended session is idempotent, not an error.
    const endedAgain = await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(endedAgain.status).toBe(200);
    expect(endedAgain.body.data.status).toBe("PROCESSING");
  });
});

describe("/interviewer socket", () => {
  it("rejects a connection with a missing or invalid token", async () => {
    await expect(connectSocket("/interviewer", "")).rejects.toBeTruthy();
    await expect(connectSocket("/interviewer", "not-a-real-token")).rejects.toBeTruthy();
  });

  it("rejects session.join for a session the user cannot access, and allows it for the owner", async () => {
    const owner = await registerOwner();
    const { sessionId } = await admitSession(owner.accessToken);

    const otherOwnerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Other", email: "other@example.com", password: "correct-horse-battery", orgName: "Other Org" });
    const otherSocket = await connectSocket("/interviewer", otherOwnerRes.body.data.accessToken);
    const forbiddenAck = await new Promise((resolve) => otherSocket.emit("session.join", { sessionId }, resolve));
    expect(forbiddenAck).toMatchObject({ ok: false });

    const ownerSocket = await connectSocket("/interviewer", owner.accessToken);
    const allowedAck = await new Promise((resolve) => ownerSocket.emit("session.join", { sessionId }, resolve));
    expect(allowedAck).toMatchObject({ ok: true });
  });

  it("replays buffered frames after lastFrameSeq on session.join", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await admitSession(owner.accessToken);
    await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });
    await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);

    // Timer ticks are already buffering frames every second; wait for at least one.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const socket = await connectSocket("/interviewer", owner.accessToken);
    const ack = await new Promise<{ ok: boolean; replayed: number }>((resolve) =>
      socket.emit("session.join", { sessionId, lastFrameSeq: 0 }, resolve),
    );
    expect(ack.ok).toBe(true);
    expect(ack.replayed).toBeGreaterThan(0);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("/candidate socket", () => {
  it("rejects a connection with an invalid candidate token", async () => {
    await expect(connectSocket("/candidate", "not-a-real-token")).rejects.toBeTruthy();
  });

  it("accepts a valid candidate token and auto-joins its session room", async () => {
    const owner = await registerOwner();
    const { candidateToken } = await admitSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    expect(socket.connected).toBe(true);
  });
});

describe("candidate presence for the interviewer", () => {
  it("tells the interviewer a candidate who was already waiting is connected, and reports it on hydrate", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await admitSession(owner.accessToken);
    await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });

    // The candidate connects in the waiting room, before the runtime exists.
    await connectSocket("/candidate", candidateToken);

    const interviewer = await connectSocket("/interviewer", owner.accessToken);
    const joined = await new Promise<{ ok: boolean }>((resolve) => interviewer.emit("session.join", { sessionId }, resolve));
    expect(joined.ok).toBe(true);
    const presence = new Promise<{ data: { connected: boolean } }>((resolve) => interviewer.once("candidate.presence", resolve));

    const started = await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(started.status).toBe(200);
    expect((await presence).data.connected).toBe(true);

    const live = await request(app).get(`/api/v1/sessions/${sessionId}/live`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(live.body.data.candidateConnected).toBe(true);
  });

  it("reports candidateConnected false when nobody is connected", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await admitSession(owner.accessToken);
    await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });
    await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${owner.accessToken}`);

    const live = await request(app).get(`/api/v1/sessions/${sessionId}/live`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(live.body.data.candidateConnected).toBe(false);
  });
});
