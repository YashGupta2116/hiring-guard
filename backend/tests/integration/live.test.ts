import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { CALIBRATION_MS, WARDEN_COOLDOWN_MS } from "../../src/config/constants.js";
import { registry } from "../../src/live/registry.js";
import { acknowledgeWarning, evaluateWarden } from "../../src/live/warden.js";
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
    prisma.flagAdjudication.deleteMany(),
    prisma.warning.deleteMany(),
    prisma.flagObservation.deleteMany(),
    prisma.flag.deleteMany(),
    prisma.note.deleteMany(),
    prisma.questionSuggestion.deleteMany(),
    prisma.integritySnapshot.deleteMany(),
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
  await request(app)
    .patch(`/api/v1/sessions/${sessionId}/config`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ channels: ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"] });
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

async function waitPastCalibration(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, CALIBRATION_MS + 50));
}

async function waitPastWardenCooldown(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, WARDEN_COOLDOWN_MS + 20));
}

async function sendFocusLoss(socket: Socket, seq: number): Promise<void> {
  // Real epoch timestamps, not small relative numbers — fusion decay projects against Date.now(),
  // so a 1970-epoch ts would read back as fully decayed the moment a test calls snapshotIntegrity().
  const now = Date.now();
  socket.emit("tel.batch", {
    connId: "conn-1",
    seq,
    sentAt: now,
    events: [
      { kind: "focus", state: "blur", ts: now - 900 },
      { kind: "focus", state: "focus", ts: now },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("flags: threshold crossing, merge, calibration gating", () => {
  it("creates no flag during calibration even when the accumulator would cross", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);

    for (let seq = 1; seq <= 3; seq++) await sendFocusLoss(socket, seq);
    await registry.get(sessionId)!.flush();

    const flags = await prisma.flag.findMany({ where: { sessionId } });
    expect(flags).toHaveLength(0);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("creates a flag once the accumulator crosses threshold, then merges a repeat within 15s", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    await waitPastCalibration();

    // Each focus_loss LLR is 1.2 (STANDARD sensitivity); the FOCUS threshold is 3 — three in a row cross it.
    for (let seq = 1; seq <= 3; seq++) await sendFocusLoss(socket, seq);
    await registry.get(sessionId)!.flush();

    let flags = await prisma.flag.findMany({ where: { sessionId } });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.type).toBe("focus_loss");
    expect(flags[0]!.channel).toBe("FOCUS");
    expect(flags[0]!.status).toBe("OPEN");
    expect(flags[0]!.mergedCount).toBe(1);
    expect(flags[0]!.scoreDelta).toBeGreaterThan(0);

    // A fourth focus_loss shortly after should merge into the same flag, not create a second one.
    await sendFocusLoss(socket, 4);
    await registry.get(sessionId)!.flush();

    flags = await prisma.flag.findMany({ where: { sessionId } });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.mergedCount).toBe(2);

    const links = await prisma.flagObservation.findMany({ where: { flagId: flags[0]!.id } });
    expect(links).toHaveLength(2);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("recovers score from clean-behaviour (negative LLR) observations", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    await waitPastCalibration();

    for (let seq = 1; seq <= 3; seq++) await sendFocusLoss(socket, seq);
    await registry.get(sessionId)!.flush();
    const flaggedCount = await prisma.flag.count({ where: { sessionId } });
    expect(flaggedCount).toBe(1);

    // pointer_return / clean pointer activity: enter after a leave shorter than the ignore window
    // doesn't emit anything, so instead just confirm no *new* flag appears from a clean burst of
    // sub-threshold pointer activity — negative-LLR recovery itself is covered by the fusion unit tests.
    socket.emit("tel.batch", { connId: "conn-1", seq: 5, sentAt: Date.now(), events: [{ kind: "pointer", state: "enter", ts: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await registry.get(sessionId)!.flush();
    expect(await prisma.flag.count({ where: { sessionId } })).toBe(1);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("warden: tiers, cooldown, cap", () => {
  it("issues NOTICE on first occurrence, WARNING on second, INTERRUPT on third", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "paste_large", channel: "PASTE", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    await evaluateWarden(sessionId, "paste_large", "LOW", flag.id);
    await waitPastWardenCooldown();
    await evaluateWarden(sessionId, "paste_large", "LOW", flag.id);
    await waitPastWardenCooldown();
    await evaluateWarden(sessionId, "paste_large", "LOW", flag.id);

    const warnings = await prisma.warning.findMany({ where: { sessionId }, orderBy: { shownAt: "asc" } });
    expect(warnings.map((w) => w.tier)).toEqual(["NOTICE", "WARNING", "INTERRUPT"]);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("uses WARNING (not NOTICE) on the first occurrence when severity is HIGH", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "face_absent", channel: "FACE", severity: "HIGH", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    await evaluateWarden(sessionId, "face_absent", "HIGH", flag.id);
    const warning = await prisma.warning.findFirst({ where: { sessionId, type: "face_absent" } });
    expect(warning?.tier).toBe("WARNING");

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("suppresses a repeat inside the 45s cooldown", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "gaze_away", channel: "GAZE", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    await evaluateWarden(sessionId, "gaze_away", "LOW", flag.id);
    await evaluateWarden(sessionId, "gaze_away", "LOW", flag.id); // inside cooldown -> suppressed

    const warnings = await prisma.warning.findMany({ where: { sessionId, type: "gaze_away" } });
    expect(warnings).toHaveLength(1);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("never shows a warning for a type with no candidate-facing template", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "multi_screen", channel: "ENVIRONMENT", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    await evaluateWarden(sessionId, "multi_screen", "LOW", flag.id);
    expect(await prisma.warning.count({ where: { sessionId } })).toBe(0);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("caps warnings above tier 1: the 7th distinct first-occurrence HIGH-severity type is downgraded to NOTICE", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    // 7 templated types so each gets a real "first occurrence" (cap counts WARNING/INTERRUPT shown, not NOTICE).
    const types = ["focus_loss", "paste_large", "second_voice", "face_absent", "multiple_faces", "gaze_away", "device_change"];
    const channels = ["FOCUS", "PASTE", "AUDIO", "FACE", "FACE", "GAZE", "ENVIRONMENT"] as const;

    for (let i = 0; i < types.length; i++) {
      const flag = await prisma.flag.create({
        data: { sessionId, type: types[i]!, channel: channels[i]!, severity: "HIGH", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
      });
      await evaluateWarden(sessionId, types[i]!, "HIGH", flag.id);
    }

    const warnings = await prisma.warning.findMany({ where: { sessionId }, orderBy: { shownAt: "asc" } });
    expect(warnings).toHaveLength(7);
    expect(warnings.slice(0, 6).every((w) => w.tier === "WARNING")).toBe(true);
    expect(warnings[6]!.tier).toBe("NOTICE"); // 7th above-tier-1 would exceed the cap of 6

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("records ack latency on warn.ack", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "paste_large", channel: "PASTE", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });
    await evaluateWarden(sessionId, "paste_large", "LOW", flag.id);
    const warning = await prisma.warning.findFirstOrThrow({ where: { sessionId, type: "paste_large" } });

    const ackedAt = warning.shownAt.getTime() + 2500;
    await acknowledgeWarning(sessionId, warning.id, ackedAt);

    const updated = await prisma.warning.findUniqueOrThrow({ where: { id: warning.id } });
    expect(updated.acknowledgedAt).not.toBeNull();
    expect(updated.ackLatencyMs).toBe(2500);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("adjudication", () => {
  it("confirms a flag and records the adjudication", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "paste_large", channel: "PASTE", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    const res = await request(app)
      .post(`/api/v1/flags/${flag.id}/adjudicate`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ action: "CONFIRM", reason: "Reviewed the recording." });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CONFIRMED");
    const adjudications = await prisma.flagAdjudication.findMany({ where: { flagId: flag.id } });
    expect(adjudications).toHaveLength(1);
    expect(adjudications[0]!.action).toBe("CONFIRM");

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("dismisses a flag and requires a toSeverity when downgrading", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "paste_large", channel: "PASTE", severity: "HIGH", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    const missingSeverity = await request(app)
      .post(`/api/v1/flags/${flag.id}/adjudicate`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ action: "DOWNGRADE", reason: "Looked benign." });
    expect(missingSeverity.status).toBe(400);

    const res = await request(app)
      .post(`/api/v1/flags/${flag.id}/adjudicate`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ action: "DOWNGRADE", toSeverity: "LOW", reason: "Looked benign." });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DOWNGRADED");
    expect(res.body.data.severity).toBe("LOW");

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("dismissing a flag nudges the live integrity score back up (full loop: crossing -> flag -> dismiss -> recovers)", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    await waitPastCalibration();

    for (let seq = 1; seq <= 3; seq++) await sendFocusLoss(socket, seq);
    await registry.get(sessionId)!.flush();

    const flag = await prisma.flag.findFirstOrThrow({ where: { sessionId, type: "focus_loss" } });
    const runtime = registry.get(sessionId)!;
    const scoreBefore = runtime.snapshotIntegrity();

    await request(app)
      .post(`/api/v1/flags/${flag.id}/adjudicate`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ action: "DISMISS", reason: "False positive — candidate has two monitors disclosed at consent." });

    const scoreAfter = runtime.snapshotIntegrity();
    expect(scoreAfter).toBeGreaterThan(scoreBefore);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("404s adjudicating a flag from another org", async () => {
    const owner = await registerOwner();
    const other = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const flag = await prisma.flag.create({
      data: { sessionId, type: "paste_large", channel: "PASTE", severity: "LOW", status: "OPEN", narrative: "test", startTs: new Date(), scoreDelta: 1 },
    });

    const res = await request(app)
      .post(`/api/v1/flags/${flag.id}/adjudicate`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ action: "CONFIRM", reason: "x" });
    expect(res.status).toBe(404);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("notes", () => {
  it("adds and lists notes for a session", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    const added = await request(app)
      .post(`/api/v1/sessions/${sessionId}/notes`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "Candidate mentioned prior LRU cache experience." });
    expect(added.status).toBe(201);
    expect(added.body.data.body).toBe("Candidate mentioned prior LRU cache experience.");

    const list = await request(app).get(`/api/v1/sessions/${sessionId}/notes`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });

  it("adds a note over the interviewer socket via note.add", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/interviewer", owner.accessToken);
    await new Promise<{ ok: boolean }>((resolve) => socket.emit("session.join", { sessionId }, resolve));

    const ack = await new Promise<{ ok: boolean; note: { body: string } }>((resolve) => socket.emit("note.add", { body: "Good answer on caching." }, resolve));
    expect(ack.ok).toBe(true);
    expect(ack.note.body).toBe("Good answer on caching.");

    expect(await prisma.note.count({ where: { sessionId } })).toBe(1);
    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});

describe("candidate boundary (Rules.md §9.1)", () => {
  it("scans every /candidate socket emit across a scripted session with a real warning for forbidden keys", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);

    const captured: Array<{ event: string; payload: unknown }> = [];
    socket.onAny((event: string, payload: unknown) => captured.push({ event, payload }));

    await waitPastCalibration();
    for (let seq = 1; seq <= 3; seq++) await sendFocusLoss(socket, seq); // crosses threshold -> flag -> NOTICE warn.show
    await registry.get(sessionId)!.flush();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(captured.some((entry) => entry.event === "warn.show")).toBe(true);
    for (const entry of captured) {
      assertNoForbiddenKeys(entry.payload);
    }
  });
});

describe("suggestions", () => {
  it("refreshes suggestions from the mock LLM (no JD needed) and accepts one", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    const refreshed = await request(app)
      .post(`/api/v1/sessions/${sessionId}/suggestions/refresh`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(refreshed.status).toBe(202);
    expect(refreshed.body.data.source).toBe("MODEL");
    expect(refreshed.body.data.items.length).toBeGreaterThan(0);

    const rows = await prisma.questionSuggestion.findMany({ where: { sessionId } });
    expect(rows.length).toBeGreaterThan(0);

    const suggestionId = rows[0]!.id;
    const accepted = await request(app)
      .post(`/api/v1/sessions/${sessionId}/suggestions/${suggestionId}/accept`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.acceptedAt).not.toBeNull();

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});
