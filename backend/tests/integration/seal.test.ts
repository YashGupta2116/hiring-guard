import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { registry } from "../../src/live/registry.js";
import { getMedia, getStorage } from "../../src/providers/index.js";
import { appendObservations } from "../../src/services/evidence.service.js";
import { resumeStuckSeals } from "../../src/services/seal.service.js";
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
    prisma.evidenceManifest.deleteMany(),
    prisma.recording.deleteMany(),
    prisma.flagObservation.deleteMany(),
    prisma.flag.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.unscoredWindow.deleteMany(),
    prisma.integritySnapshot.deleteMany(),
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

async function registerOwner() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: `owner-${Date.now()}-${Math.random()}@example.com`, password: "correct-horse-battery", orgName: "Acme" });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

async function startLiveSession(accessToken: string) {
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
  const candidateToken = consent.body.data.candidateToken as string;

  await request(app)
    .post("/api/v1/candidate/media-ready")
    .set("Authorization", `Bearer ${candidateToken}`)
    .send({ tracks: { camera: true, microphone: true, screen: true } });

  await request(app).post(`/api/v1/sessions/${sessionId}/start`).set("Authorization", `Bearer ${accessToken}`);

  return { sessionId, candidateToken };
}

async function seedObservation(sessionId: string) {
  const [row] = await appendObservations(sessionId, [
    {
      source: "CLIENT",
      channel: "FOCUS",
      type: "focus_loss",
      clientTs: null,
      ts: new Date(),
      llr: 1.2,
      payload: { durationMs: 5000 },
    },
  ]);
  return row!;
}

describe("seal sequence", () => {
  it("ends a LIVE session into PROCESSING with a signed manifest that verifies", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    await seedObservation(sessionId);

    const ended = await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe("PROCESSING");

    const manifest = await prisma.evidenceManifest.findUnique({ where: { sessionId } });
    expect(manifest).not.toBeNull();
    expect(manifest?.lastSeq).toBe(1);

    // The record flags default to on, but the mock media provider cannot record: no egress starts and
    // no Recording row exists, so nothing can report a recording that was never made.
    expect(await prisma.recording.findUnique({ where: { sessionId } })).toBeNull();
    const session = await request(app).get(`/api/v1/sessions/${sessionId}`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(session.body.data.config).toMatchObject({ recordVideo: true, recordingAvailable: false });

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data).toMatchObject({ valid: true, chainValid: true, signatureValid: true, lastSeq: 1, firstBrokenSeq: null });
  });

  it("marks a recording FAILED, not READY, when a recording-capable provider hands back no artifact", async () => {
    Object.assign(getMedia(), { canRecord: true }); // the mock's stopRecording returns null keys
    try {
      const owner = await registerOwner();
      const { sessionId } = await startLiveSession(owner.accessToken);
      expect((await prisma.recording.findUnique({ where: { sessionId } }))?.status).toBe("RECORDING");

      const ended = await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
      expect(ended.body.data.status).toBe("PROCESSING"); // a failed recording never blocks the seal

      const recording = await prisma.recording.findUnique({ where: { sessionId } });
      expect(recording?.status).toBe("FAILED");
      expect(recording?.compositeUri).toBeNull();
      expect(recording?.hlsUri).toBeNull();
    } finally {
      Object.assign(getMedia(), { canRecord: false });
    }
  });

  it("detects a tampered observation on the next verify call", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const observation = await seedObservation(sessionId);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);

    await prisma.observation.update({ where: { id: observation.id }, data: { payload: { durationMs: 999999 } } });

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.valid).toBe(false);
    expect(verify.body.data.chainValid).toBe(false);
    expect(verify.body.data.firstBrokenSeq).toBe(1);
    expect(verify.body.data.signatureValid).toBe(true);
  });

  it("detects a tampered manifest signature on the next verify call", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    await seedObservation(sessionId);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);

    const manifest = await prisma.evidenceManifest.findUniqueOrThrow({ where: { sessionId } });
    const sigKey = manifest.manifestUri.replace(/\.json$/, ".sig");
    await getStorage().put(sigKey, Buffer.from("not-a-real-signature"));

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.valid).toBe(false);
    expect(verify.body.data.signatureValid).toBe(false);
    expect(verify.body.data.chainValid).toBe(true);
  });

  // Regression test for a fixed vulnerability: verification used to compare the recomputed chain
  // against the mutable EvidenceManifest database row instead of the signed manifest.json bytes, so
  // an attacker with database write access could rewrite an observation, recompute a self-consistent
  // hash chain from it, and update the DB row's chainHead/lastSeq to match — all without the signing
  // key — and verification would report valid. It must now compare against the *signed* content.
  it("detects a database-only rewrite that recomputes a self-consistent chain and updates the manifest row to match, without touching the signed files", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    const observation = await seedObservation(sessionId);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);

    const originalManifest = await prisma.evidenceManifest.findUniqueOrThrow({ where: { sessionId } });

    // Rewrite the observation and recompute a self-consistent chain from it, exactly as an attacker
    // with database access (but not the signing key) could.
    const forgedPayload = { durationMs: 1 };
    const genesis = sha256Hex(`veritrust:${sessionId}`);
    const forgedHash = sha256Hex(
      genesis +
        canonicalJson({
          sessionId,
          seq: 1,
          source: observation.source,
          channel: observation.channel,
          type: observation.type,
          ts: observation.ts,
          payload: forgedPayload,
        }),
    );
    await prisma.observation.update({
      where: { id: observation.id },
      data: { payload: forgedPayload, prevHash: genesis, hash: forgedHash },
    });
    // ...and "fix up" the manifest row so the old (pre-fix) DB-row comparison would have matched.
    await prisma.evidenceManifest.update({ where: { sessionId }, data: { chainHead: forgedHash, lastSeq: 1 } });

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.status).toBe(200);
    // The recomputed chain is internally self-consistent (chain.valid), but it no longer matches what
    // was actually signed at seal time, so this must still be reported as invalid.
    expect(verify.body.data.signatureValid).toBe(true);
    expect(verify.body.data.chainValid).toBe(false);
    expect(verify.body.data.valid).toBe(false);
    expect(verify.body.data.chainHead).toBe(forgedHash);
    expect(verify.body.data.chainHead).not.toBe(originalManifest.chainHead);
  });

  it("resumes and completes a seal left stuck in SEALING after a simulated crash", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);
    await seedObservation(sessionId);

    // Simulate a process crash right after the CAS to SEALING (step 1): the in-memory runtime and its
    // socket connections are gone, but the DB/Redis state a resumed seal would see is exactly this.
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: "SEALING", endedAt: new Date(), endReason: "interviewer" },
    });
    await redis.hset(`s:${sessionId}:seal`, "step", "1");
    registry.delete(sessionId);

    await resumeStuckSeals();

    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("PROCESSING");

    const manifest = await prisma.evidenceManifest.findUnique({ where: { sessionId } });
    expect(manifest).not.toBeNull();

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.body.data).toMatchObject({ valid: true, chainValid: true, signatureValid: true });
  });

  it("404s evidence/verify for a session that hasn't been sealed yet", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startLiveSession(owner.accessToken);

    const verify = await request(app).get(`/api/v1/sessions/${sessionId}/evidence/verify`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(verify.status).toBe(404);

    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${owner.accessToken}`);
  });
});
