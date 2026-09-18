import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { registry } from "../../src/live/registry.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { prisma } from "../../src/utils/prisma.js";
import { redis } from "../../src/utils/redis.js";
import { assertNoForbiddenKeys } from "../helpers/candidate-boundary.js";

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
    prisma.codeExecution.deleteMany(),
    prisma.codeSnapshot.deleteMany(),
    prisma.editorDelta.deleteMany(),
    prisma.flagObservation.deleteMany(),
    prisma.flag.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.unscoredWindow.deleteMany(),
    prisma.sessionCodingTask.deleteMany(),
    prisma.codingTask.deleteMany(),
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

function taskPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Two Sum",
    statement: "Return indices of the two numbers that add up to target.",
    difficulty: "EASY",
    languages: ["javascript"],
    visibleTests: [{ input: "[2,7,11,15], 9", expectedOutput: "[0,1]" }],
    hiddenTests: [{ input: "[3,3], 6", expectedOutput: "[0,1]" }],
    timeLimitMs: 5000,
    ...overrides,
  };
}

async function startLiveSessionWithTask(accessToken: string) {
  const task = await request(app).post("/api/v1/coding-tasks").set("Authorization", `Bearer ${accessToken}`).send(taskPayload());
  const codingTaskId = task.body.data.id as string;

  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" });
  const sessionId = created.body.data.id as string;
  await request(app)
    .patch(`/api/v1/sessions/${sessionId}/config`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ channels: ["FOCUS", "PASTE", "RHYTHM"], taskIds: [codingTaskId] });

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

async function getSoleSessionTaskId(candidateToken: string): Promise<string> {
  const tasks = await request(app).get("/api/v1/candidate/tasks").set("Authorization", `Bearer ${candidateToken}`);
  return tasks.body.data[0].taskId as string;
}

describe("candidate tasks", () => {
  it("lists tasks without hidden tests, not frozen before submit", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);

    const res = await request(app).get("/api/v1/candidate/tasks").set("Authorization", `Bearer ${candidateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].hiddenTests).toBeUndefined();
    expect(res.body.data[0].frozen).toBe(false);
    assertNoForbiddenKeys(res.body.data);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });

  it("runs visible tests only, rate-limited to 1 per 3s per task", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);
    const taskId = await getSoleSessionTaskId(candidateToken);

    const first = await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/run`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });
    expect(first.status).toBe(201);
    expect(first.body.data.results).toHaveLength(1); // visible tests only
    expect(first.body.data.hiddenResults).toBeUndefined();
    assertNoForbiddenKeys(first.body.data);

    const second = await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/run`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });
    expect(second.status).toBe(429);

    expect(await prisma.codeExecution.count({ where: { sessionId, kind: "RUN" } })).toBe(1);
    expect(await prisma.codeSnapshot.count({ where: { sessionId, reason: "RUN" } })).toBe(1);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });

  it("submit runs hidden tests, freezes the task, never leaks hidden results to the candidate", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);
    const taskId = await getSoleSessionTaskId(candidateToken);
    const socket = await connectSocket("/candidate", candidateToken);
    const frozenEvents: unknown[] = [];
    socket.on("task.frozen", (data: unknown) => frozenEvents.push(data));

    const submit = await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });
    expect(submit.status).toBe(200);
    expect(submit.body.data.submitted).toBe(true);
    expect(submit.body.data.visibleResults).toHaveLength(1);
    expect(submit.body.data.hiddenResults).toBeUndefined();
    assertNoForbiddenKeys(submit.body.data);

    const execution = await prisma.codeExecution.findFirstOrThrow({ where: { sessionId, kind: "SUBMIT" } });
    expect(execution.hiddenResults).not.toBeNull();
    expect((execution.hiddenResults as unknown[]).length).toBe(1);

    const sessionTask = await prisma.sessionCodingTask.findFirstOrThrow({ where: { sessionId } });
    expect(sessionTask.submittedAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(frozenEvents).toHaveLength(1);
    expect(frozenEvents[0]).toEqual({ taskId });

    // Editing/running again after submit is rejected.
    const rerun = await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/run`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });
    expect(rerun.status).toBe(409);

    const resubmit = await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });
    expect(resubmit.status).toBe(409);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });

  it("interviewer GET /sessions/:id/code sees hidden results; a stranger org gets 404", async () => {
    const owner = await registerOwner();
    const other = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);
    const taskId = await getSoleSessionTaskId(candidateToken);

    await request(app)
      .post(`/api/v1/candidate/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ language: "javascript", code: "solve()" });

    const res = await request(app).get(`/api/v1/sessions/${sessionId}/code`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].frozen).toBe(true);
    expect(res.body.data[0].executions[0].hiddenResults).not.toBeNull();

    const stranger = await request(app).get(`/api/v1/sessions/${sessionId}/code`).set("Authorization", `Bearer ${other.accessToken}`);
    expect(stranger.status).toBe(404);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });

  it("editor.snapshot persists a CodeSnapshot with reason INTERVAL", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);
    const taskId = await getSoleSessionTaskId(candidateToken);
    const socket = await connectSocket("/candidate", candidateToken);

    socket.emit("editor.snapshot", { taskId, language: "javascript", content: "function solve() {}", reason: "INTERVAL" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await registry.get(sessionId)!.flush();

    const snapshot = await prisma.codeSnapshot.findFirstOrThrow({ where: { sessionId, reason: "INTERVAL" } });
    expect(snapshot.content).toBe("function solve() {}");

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });

  it("large editor pastes over the socket create a paste_large flag via the authorship detector", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken, accessToken } = await startLiveSessionWithTask(owner.accessToken);
    const taskId = await getSoleSessionTaskId(candidateToken);
    const socket = await connectSocket("/candidate", candidateToken);

    // FOCUS/PASTE threshold crossing needs to be past calibration; large-paste LLR alone (1.6) is
    // below the PASTE threshold (2.5) so send two to cross it, well past calibration's 200ms in tests.
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (let seq = 1; seq <= 2; seq++) {
      socket.emit("editor.delta", {
        taskId,
        seq,
        changes: [{ changeType: "PASTE", rangeOffset: 0, insertedChars: 500, deletedChars: 0, ts: Date.now() }],
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    await registry.get(sessionId)!.flush();

    const deltas = await prisma.editorDelta.findMany({ where: { sessionId } });
    expect(deltas).toHaveLength(2);

    const flags = await prisma.flag.findMany({ where: { sessionId, type: "paste_large" } });
    expect(flags.length).toBeGreaterThan(0);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  });
});
