/**
 * `CALIBRATED_WEIGHTS_ENABLED=true`, through a real session, end to end.
 *
 * `tests/unit/calibrated-weights.test.ts` covers the report-building logic by calling
 * `buildCalibrationReport()` with `enabled = true` passed as an argument. That never touches the
 * environment and never reaches scoring, so the thing the flag exists to do -- change the LLR a
 * live observation is actually scored with -- was untested: every other suite runs with the flag
 * off, which is the default. This file turns the real env flag on, drives a real session over the
 * real candidate socket and the real internal producer API, and reads back what Postgres stored.
 *
 * The expected numbers are computed from `ml/weights/weights.json` here rather than written in as
 * literals. A hardcoded 1.042 would keep passing if the loader silently stopped reading the
 * artifact and something else happened to produce the same value, and would have to be re-typed
 * every time the lab refits. Reading the curve and evaluating it is the same arithmetic the
 * backend does, from the same file, so the assertion is "the backend used this artifact".
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `src/config/env.ts` parses `process.env` once at import time, and every module below reaches it
// transitively, so by the time a normal statement in this file runs the flag has already been
// read as false. `vi.hoisted` is lifted above this file's imports, which is the only place left
// where setting it still changes what `env` parses. `tests/setup.ts` has already run by then; it
// does not set this variable, so there is nothing here to fight with.
vi.hoisted(() => {
  process.env.CALIBRATED_WEIGHTS_ENABLED = "true";
});

import { createApp } from "../../src/app.js";
import {
  buildCalibrationReport,
  getCalibratedLlr,
  getCalibrationReport,
} from "../../src/config/calibrated-weights.js";
import { CALIBRATION_MS } from "../../src/config/constants.js";
import { getLlr, LLR_TABLE } from "../../src/config/detection.js";
import { env } from "../../src/config/env.js";
import { registry } from "../../src/live/registry.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { prisma } from "../../src/utils/prisma.js";
import { redis } from "../../src/utils/redis.js";

const here = dirname(fileURLToPath(import.meta.url));
/** `backend/tests/integration` -> repo root, the same way `calibrated-weights.ts` resolves it. */
const repoRoot = resolve(here, "..", "..", "..");
const ARTIFACT_PATH = join(repoRoot, "ml", "weights", "weights.json");

type Curve = { intercept: number; slope: number; positive_confidence_median: number };
type Artifact = {
  version: string;
  dataset: { kind: string };
  detectors: Record<string, { source: string; curve: Curve | null }>;
};

const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as Artifact;

/** The LLR the lab's curve gives for a typical true detection — what the backend adopts. */
function referenceLlr(mlType: string): number {
  const entry = artifact.detectors[mlType];
  if (entry?.curve == null) throw new Error(`${mlType} is not fitted in ${ARTIFACT_PATH}`);
  return entry.curve.intercept + entry.curve.slope * entry.curve.positive_confidence_median;
}

const app = createApp();
const httpServer = createServer(app);
createSocketServer(httpServer);

let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.flagAdjudication.deleteMany(),
    prisma.warning.deleteMany(),
    prisma.flagObservation.deleteMany(),
    prisma.flag.deleteMany(),
    prisma.integritySnapshot.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.unscoredWindow.deleteMany(),
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

const openSockets: Socket[] = [];
afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await resetDb();
  await prisma.$disconnect();
  await redis.quit();
});

function connectSocket(namespace: string, token: string): Promise<Socket> {
  const socket = ioClient(`${baseUrl}${namespace}`, {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
  });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

async function registerOwner() {
  const res = await request(app).post("/api/v1/auth/register").send({
    name: "Owner",
    email: `owner-${Date.now()}-${Math.random()}@example.com`,
    password: "correct-horse-battery",
    orgName: "Acme",
  });
  return { accessToken: res.body.data.accessToken as string };
}

/** FACE is enabled alongside the client channels so the CV producer's rows are scored, not just stored. */
async function startLiveSession(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" });
  const sessionId = created.body.data.id as string;
  await request(app)
    .patch(`/api/v1/sessions/${sessionId}/config`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ channels: ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT", "FACE"] });
  const link = await request(app)
    .post(`/api/v1/sessions/${sessionId}/links`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const rawToken = (link.body.data.url as string).split("/join/")[1]!;

  const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send({
    webrtc: true,
    getDisplayMedia: true,
    camera: "granted",
    microphone: "granted",
    screenCount: 1,
    isExtended: false,
    downlinkMbps: 20,
    hardwareConcurrency: 8,
    userAgent: "vitest",
  });
  const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);
  const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
    preflightId: preflight.body.data.preflightId,
    policyHash: policy.body.data.policyHash,
    accepted: true,
    scrolledToEnd: true,
  });
  const candidateToken = consent.body.data.candidateToken as string;

  await request(app)
    .post("/api/v1/candidate/media-ready")
    .set("Authorization", `Bearer ${candidateToken}`)
    .send({ tracks: { camera: true, microphone: true, screen: true } });

  await request(app)
    .post(`/api/v1/sessions/${sessionId}/start`)
    .set("Authorization", `Bearer ${accessToken}`);
  return { sessionId, candidateToken };
}

async function endSession(sessionId: string, accessToken: string): Promise<void> {
  await request(app)
    .post(`/api/v1/sessions/${sessionId}/end`)
    .set("Authorization", `Bearer ${accessToken}`);
}

async function waitPastCalibration(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, CALIBRATION_MS + 50));
}

/** One focus_loss: a blur followed by a focus 900ms later, on real epoch timestamps (fusion decays against `Date.now()`). */
async function sendFocusLoss(socket: Socket, seq: number): Promise<void> {
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

async function postCvObservation(
  sessionId: string,
  type: string,
  channel: string,
): Promise<number> {
  const res = await request(app)
    .post(`/api/v1/internal/sessions/${sessionId}/observations`)
    .set("Authorization", `Bearer ${env.INTERNAL_SERVICE_TOKEN}`)
    .send({
      producer: "cv",
      items: [{ channel, type, ts: new Date().toISOString(), strength: 0.8, payload: {} }],
    });
  return res.status;
}

describe("calibrated weights: the env flag, on, end to end", () => {
  it("the committed artifact is present (every assertion below reads it)", () => {
    expect(existsSync(ARTIFACT_PATH)).toBe(true);
  });

  it("the env flag alone switches calibration on — no argument passed anywhere", () => {
    // The unit suite proves `buildCalibrationReport(path, true)` works. This proves the wiring
    // that suite skips: the default-argument read of `env.CALIBRATED_WEIGHTS_ENABLED`.
    expect(env.CALIBRATED_WEIGHTS_ENABLED).toBe(true);
    expect(buildCalibrationReport().enabled).toBe(true);

    const report = getCalibrationReport();
    expect(report.enabled).toBe(true);
    expect(report.weightsVersion).toBe(artifact.version);
    expect(report.datasetKind).toBe(artifact.dataset.kind);
    expect(report.adopted.map((entry) => entry.backendType).sort()).toEqual([
      "focus_loss",
      "gaze_away",
      "multiple_faces",
      "paste_large",
    ]);
  });

  it("getLlr returns the artifact's curve value instead of the hand-set row", () => {
    const calibrated = referenceLlr("focus.tab_hidden");
    expect(getCalibratedLlr("focus_loss", "STANDARD")).toBeCloseTo(calibrated, 10);
    expect(getLlr("focus_loss", "STANDARD")).toBeCloseTo(calibrated, 10);
    // The override is real, not a no-op that happens to agree with the hand-set table.
    expect(getLlr("focus_loss", "STANDARD")).not.toBeCloseTo(LLR_TABLE.focus_loss!.STANDARD, 3);
  });

  it("LOW and HIGH keep their hand-set ratio to the adopted STANDARD", () => {
    const row = LLR_TABLE.focus_loss!;
    const factor = getLlr("focus_loss", "STANDARD")! / row.STANDARD;
    expect(getLlr("focus_loss", "LOW")).toBeCloseTo(row.LOW * factor, 10);
    expect(getLlr("focus_loss", "HIGH")).toBeCloseTo(row.HIGH * factor, 10);
  });

  it("a type with no fitted curve still reads the hand-set table", () => {
    // Nothing in the artifact maps to face_absent, so it must be untouched — the override is
    // per-detector, not a global replacement of the table.
    expect(getCalibratedLlr("face_absent", "STANDARD")).toBeNull();
    expect(getLlr("face_absent", "STANDARD")).toBe(LLR_TABLE.face_absent!.STANDARD);
  });

  it("stores the calibrated LLR on a client-telemetry observation", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);

    await sendFocusLoss(socket, 1);
    await registry.get(sessionId)!.flush();

    const rows = await prisma.observation.findMany({ where: { sessionId, type: "focus_loss" } });
    expect(rows).toHaveLength(1);
    // `session-runtime.ts` passes this exact column into `applyObservation`, so what is stored
    // here is what live fusion scored with.
    expect(rows[0]!.llr).toBeCloseTo(referenceLlr("focus.tab_hidden"), 10);
    expect(rows[0]!.llr).not.toBeCloseTo(LLR_TABLE.focus_loss!.STANDARD, 3);

    await endSession(sessionId, owner.accessToken);
  });

  it("stores the calibrated LLR on an external producer's observation", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    expect(await postCvObservation(sessionId, "multiple_faces", "FACE")).toBe(202);
    await registry.get(sessionId)!.flush();

    const rows = await prisma.observation.findMany({ where: { sessionId, type: "multiple_faces" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("CV");
    // The CV path assigns its LLR in `internal.service.ts`, a different call site from the socket
    // path above; both must go through the calibrated table.
    expect(rows[0]!.llr).toBeCloseTo(referenceLlr("scene.multiple_faces"), 10);
    expect(rows[0]!.llr).not.toBeCloseTo(LLR_TABLE.multiple_faces!.STANDARD, 3);

    await endSession(sessionId, owner.accessToken);
  });

  it("an unfitted type keeps its hand-set LLR in the same live session", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    expect(await postCvObservation(sessionId, "face_absent", "FACE")).toBe(202);
    await registry.get(sessionId)!.flush();

    const rows = await prisma.observation.findMany({ where: { sessionId, type: "face_absent" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.llr).toBe(LLR_TABLE.face_absent!.STANDARD);

    await endSession(sessionId, owner.accessToken);
  });

  it("the calibrated LLR reaches fusion: it accumulates to a flag with a real score delta", async () => {
    const owner = await registerOwner();
    const { sessionId, candidateToken } = await startLiveSession(owner.accessToken);
    const socket = await connectSocket("/candidate", candidateToken);
    await waitPastCalibration();

    // The FOCUS threshold is 3. The calibrated focus_loss LLR is lower than the hand-set 1.2, so
    // the three events live.test.ts uses would clear it by ~0.1 here — margin thin enough that
    // decay between batches could decide it. Four keeps this test about calibration reaching
    // fusion rather than about where the crossing point happens to land.
    for (let seq = 1; seq <= 4; seq++) await sendFocusLoss(socket, seq);
    await registry.get(sessionId)!.flush();

    const flags = await prisma.flag.findMany({ where: { sessionId } });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.type).toBe("focus_loss");
    expect(flags[0]!.channel).toBe("FOCUS");
    expect(flags[0]!.scoreDelta).toBeGreaterThan(0);

    const scored = await prisma.observation.findMany({
      where: { sessionId, type: "focus_loss" },
      select: { llr: true },
    });
    expect(scored).toHaveLength(4);
    for (const row of scored) {
      expect(row.llr).toBeCloseTo(referenceLlr("focus.tab_hidden"), 10);
    }

    await endSession(sessionId, owner.accessToken);
  });
});
