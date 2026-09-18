/**
 * Phases.md §11: "Load test telemetry ingest (target: 1 session × 4 events/s × 60 min without
 * lag)". Drives one live session's candidate socket at the target rate against a running server
 * (`npm run dev`) and polls Postgres directly to see whether persisted observations keep pace
 * with what was sent, instead of trusting client-side latency alone.
 *
 * Usage:
 *   npm run dev                                  # separate terminal
 *   tsx scripts/load-test-telemetry.ts            # full 60 min spec
 *   LOAD_TEST_DURATION_SECONDS=120 tsx scripts/load-test-telemetry.ts   # shorter smoke run
 */
import { io as ioClient } from "socket.io-client";
import { prisma } from "../src/utils/prisma.js";

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:9000";
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 60 * 60);
const BATCH_INTERVAL_MS = 250; // FR-TEL-1: telemetry arrives in 250ms batches -> 4 events/s
const REPORT_INTERVAL_MS = 10_000;
const FOCUS_EVENT_STEP_MS = 2000; // > FOCUS_IGNORE_MS(800ms), so every blur/focus pair scores

async function api(method: string, path: string, body?: unknown, token?: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json.data;
}

async function setUpLiveSession() {
  const email = `load-test-${Date.now()}@example.com`;
  const owner = await api("POST", "/api/v1/auth/register", {
    name: "Load Test",
    email,
    password: "correct-horse-battery",
    orgName: `Load Test ${Date.now()}`,
  });
  const accessToken = owner.accessToken as string;

  const session = await api("POST", "/api/v1/sessions", { mode: "DIRECT_LINK", candidateEmail: "candidate@example.com" }, accessToken);
  const sessionId = session.id as string;
  await api("PATCH", `/api/v1/sessions/${sessionId}/config`, { channels: ["FOCUS"] }, accessToken);
  const link = await api(
    "POST",
    `/api/v1/sessions/${sessionId}/links`,
    { kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    accessToken,
  );
  const rawToken = (link.url as string).split("/join/")[1]!;

  const probe = {
    webrtc: true,
    getDisplayMedia: true,
    camera: "granted",
    microphone: "granted",
    screenCount: 1,
    isExtended: false,
    downlinkMbps: 20,
    hardwareConcurrency: 8,
    userAgent: "load-test-script",
  };
  const preflight = await api("POST", `/api/v1/join/${rawToken}/preflight`, probe);
  const policy = await api("GET", `/api/v1/join/${rawToken}/policy`);
  const consent = await api("POST", `/api/v1/join/${rawToken}/consent`, {
    preflightId: preflight.preflightId,
    policyHash: policy.policyHash,
    accepted: true,
    scrolledToEnd: true,
  });
  const candidateToken = consent.candidateToken as string;

  await api("POST", "/api/v1/candidate/media-ready", { tracks: { camera: true, microphone: true, screen: true } }, candidateToken);
  await api("POST", `/api/v1/sessions/${sessionId}/start`, undefined, accessToken);

  return { sessionId, accessToken, candidateToken };
}

async function main(): Promise<void> {
  console.log(`Setting up a live session against ${BASE_URL} ...`);
  const { sessionId, accessToken, candidateToken } = await setUpLiveSession();
  console.log(`Session ${sessionId} is LIVE. Running ${DURATION_SECONDS}s at 4 events/s (1 batch/${BATCH_INTERVAL_MS}ms).`);

  const socket = ioClient(`${BASE_URL}/candidate`, { auth: { token: candidateToken }, transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });

  let seq = 0;
  let sent = 0;
  let ts = 0;
  let blurring = true;
  let maxBacklog = 0;
  const startedAt = Date.now();

  const sendTimer = setInterval(() => {
    seq += 1;
    ts += FOCUS_EVENT_STEP_MS;
    socket.emit("tel.batch", {
      connId: "load-test",
      seq,
      sentAt: Date.now(),
      events: [{ kind: "focus", state: blurring ? "blur" : "focus", ts }],
    });
    blurring = !blurring;
    sent += 1;
  }, BATCH_INTERVAL_MS);

  const reportTimer = setInterval(() => {
    void (async () => {
      const persisted = await prisma.observation.count({ where: { sessionId } });
      const expected = Math.floor(sent / 2);
      const backlog = expected - persisted;
      maxBacklog = Math.max(maxBacklog, backlog);
      const elapsedS = Math.round((Date.now() - startedAt) / 1000);
      console.log(`[${elapsedS}s] sent=${sent} expectedObservations=${expected} persisted=${persisted} backlog=${backlog}`);
    })().catch((err: unknown) => console.error("report tick failed", err));
  }, REPORT_INTERVAL_MS);

  await new Promise((resolve) => setTimeout(resolve, DURATION_SECONDS * 1000));
  clearInterval(sendTimer);
  clearInterval(reportTimer);

  console.log("Send loop stopped. Waiting 5s grace period for the write queue to drain ...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const expected = Math.floor(sent / 2);
  const finalPersisted = await prisma.observation.count({ where: { sessionId } });
  const finalBacklog = expected - finalPersisted;

  socket.disconnect();
  await api("POST", `/api/v1/sessions/${sessionId}/end`, undefined, accessToken).catch(() => undefined);
  await prisma.$disconnect();

  console.log("\n=== Result ===");
  console.log(`batches sent: ${sent}`);
  console.log(`expected observations: ${expected}`);
  console.log(`persisted observations: ${finalPersisted}`);
  console.log(`max backlog during run: ${maxBacklog}`);
  console.log(`final backlog after grace period: ${finalBacklog}`);
  const pass = finalBacklog === 0 && maxBacklog < 20; // < 5s worth of expected observations
  console.log(pass ? "PASS: ingest kept pace, no growing lag." : "FAIL: ingest fell behind — see backlog above.");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
