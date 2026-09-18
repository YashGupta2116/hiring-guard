import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { runPipelineInline } from "../../src/pipeline/flow.js";
import { getMail, getStorage } from "../../src/providers/index.js";
import type { LogMailProvider } from "../../src/providers/mail/log.mail.js";
import { appendObservations } from "../../src/services/evidence.service.js";
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
    prisma.report.deleteMany(),
    prisma.pipelineStepRun.deleteMany(),
    prisma.pipelineRun.deleteMany(),
    prisma.answerGrade.deleteMany(),
    prisma.qAPair.deleteMany(),
    prisma.codeEvaluation.deleteMany(),
    prisma.codeExecution.deleteMany(),
    prisma.editorDelta.deleteMany(),
    prisma.codeSnapshot.deleteMany(),
    prisma.sessionCodingTask.deleteMany(),
    prisma.codingTask.deleteMany(),
    prisma.transcriptSegment.deleteMany(),
    prisma.evidenceManifest.deleteMany(),
    prisma.recording.deleteMany(),
    prisma.flagAdjudication.deleteMany(),
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
  const email = `owner-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email, password: "correct-horse-battery", orgName: "Acme" });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string, email };
}

async function startAndEndLiveSession(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com", title: "Backend Engineer Interview" });
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

  await appendObservations(sessionId, [
    { source: "CLIENT", channel: "FOCUS", type: "focus_loss", clientTs: null, ts: new Date(), llr: 0.5, payload: {} },
  ]);

  await prisma.transcriptSegment.createMany({
    data: [
      { sessionId, speaker: "INTERVIEWER", text: "Tell me about a time you optimized a slow query.", startMs: 1000, endMs: 5000, isFinal: true },
      { sessionId, speaker: "CANDIDATE", text: "mhm", startMs: 5100, endMs: 5300, isFinal: true },
      {
        sessionId,
        speaker: "CANDIDATE",
        text: "At my last job we had a report endpoint doing a full table scan, so I added a composite index and it dropped from 4s to 40ms.",
        startMs: 5400,
        endMs: 12000,
        isFinal: true,
      },
    ],
  });

  const ended = await request(app).post(`/api/v1/sessions/${sessionId}/end`).set("Authorization", `Bearer ${accessToken}`);
  expect(ended.status).toBe(200);
  expect(ended.body.data.status).toBe("PROCESSING");

  return { sessionId, candidateToken };
}

describe("pipeline (Phase 10)", () => {
  it("happy path: produces a scored, non-degraded report and transitions to COMPLETE", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startAndEndLiveSession(owner.accessToken);

    await runPipelineInline(owner.orgId, sessionId);

    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("COMPLETE");

    const reportRes = await request(app).get(`/api/v1/sessions/${sessionId}/report`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.degraded).toBe(false);
    expect(reportRes.body.data.scores.integrity).toBeGreaterThan(0);
    expect(reportRes.body.data.htmlAvailable).toBe(true);

    const pairs = await prisma.qAPair.findMany({ where: { sessionId } });
    expect(pairs).toHaveLength(1); // the back-channel "mhm" must not have opened its own pair
    expect(pairs[0]!.answerText).toContain("composite index");

    const grades = await prisma.answerGrade.findMany({ where: { qaPair: { sessionId } } });
    expect(grades).toHaveLength(1);

    const pipelineRes = await request(app).get(`/api/v1/sessions/${sessionId}/pipeline`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(pipelineRes.status).toBe(200);
    expect(pipelineRes.body.data.status).toBe("SUCCEEDED");
    expect(pipelineRes.body.data.steps).toHaveLength(8);
    expect(pipelineRes.body.data.steps.every((s: { status: string }) => s.status === "SUCCEEDED")).toBe(true);

    const htmlRes = await request(app)
      .get(`/api/v1/reports/${reportRes.body.data.id}/html`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.type).toBe("text/html");
    expect(htmlRes.text).toContain("Interview report");
  });

  it("a broken evidence chain fails only SealVerify and still delivers a degraded report", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startAndEndLiveSession(owner.accessToken);

    const observation = await prisma.observation.findFirstOrThrow({ where: { sessionId } });
    await prisma.observation.update({ where: { id: observation.id }, data: { payload: { tampered: true } } });

    await runPipelineInline(owner.orgId, sessionId);

    const pipelineRes = await request(app).get(`/api/v1/sessions/${sessionId}/pipeline`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(pipelineRes.body.data.status).toBe("DEGRADED");
    const sealStep = pipelineRes.body.data.steps.find((s: { step: string }) => s.step === "SEAL_VERIFY");
    expect(sealStep.status).toBe("FAILED");
    const otherSteps = pipelineRes.body.data.steps.filter((s: { step: string }) => s.step !== "SEAL_VERIFY");
    expect(otherSteps.every((s: { status: string }) => s.status === "SUCCEEDED")).toBe(true);

    const reportRes = await request(app).get(`/api/v1/sessions/${sessionId}/report`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(reportRes.body.data.degraded).toBe(true);
    expect(reportRes.body.data.lostSteps).toEqual(["SEAL_VERIFY"]);

    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("COMPLETE"); // degraded still delivers, per Phases.md §10
  });

  it("a low integrity score forces composite null and reviewRequired true, without touching the fixed formula", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startAndEndLiveSession(owner.accessToken);

    // One strong FOCUS observation is enough to push the replayed integrity score under 70 at
    // STANDARD sensitivity (weight 0.7, sigma 4): 200/(1+exp(0.7*5/4)) ≈ 58.8.
    await appendObservations(sessionId, [
      { source: "CLIENT", channel: "FOCUS", type: "focus_loss", clientTs: null, ts: new Date(), llr: 5, payload: {} },
    ]);

    await runPipelineInline(owner.orgId, sessionId);

    const reportRes = await request(app).get(`/api/v1/sessions/${sessionId}/report`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(reportRes.body.data.scores.integrity).toBeLessThan(70);
    expect(reportRes.body.data.scores.composite).toBeNull();
    expect(reportRes.body.data.scores.reviewRequired).toBe(true);
  });

  it("the summary email names only scores, never transcript text or a flag narrative", async () => {
    const owner = await registerOwner();
    const { sessionId } = await startAndEndLiveSession(owner.accessToken);

    await runPipelineInline(owner.orgId, sessionId);

    const storage = getStorage();
    const key = `orgs/${owner.orgId}/sessions/${sessionId}/reports/report.html`;
    const html = (await storage.getBuffer(key)).toString("utf8");
    // The flag narrative and the transcript's actual words belong in the *report* (evidence-backed,
    // Design.md) — confirm the report has them, so the email test below is a meaningful contrast.
    expect(html).toContain("composite index");

    const report = await prisma.report.findUniqueOrThrow({ where: { sessionId } });
    expect(report.emailSentAt).not.toBeNull();

    // MAIL_PROVIDER is forced to "log" in tests (tests/setup.ts) so no real SMTP server is needed;
    // LogMailProvider keeps every sent message in memory, which is what's asserted on here.
    const mail = getMail() as LogMailProvider;
    const sent = mail.sent.find((m) => m.to === owner.email);
    expect(sent).toBeDefined();
    expect(sent!.text).toContain("Technical:");
    expect(sent!.text).toContain("Integrity:");
    // Never the candidate's actual words, and never a flag's narrative text — summary only (Rules.md).
    expect(sent!.text).not.toContain("composite index");
    expect(sent!.text).not.toContain("query");
  });
});
