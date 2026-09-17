import type { Job } from "bullmq";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { transition } from "../../src/services/session-state.service.js";
import { prisma } from "../../src/utils/prisma.js";
import type { JdParseJobData } from "../../src/utils/queues.js";
import { processJdParse } from "../../src/workers/jd-parse.worker.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.jobDescription.deleteMany(),
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
});

async function registerOwner(overrides: Partial<Record<string, string>> = {}) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: "owner@example.com", password: "correct-horse-battery", orgName: "Acme", ...overrides });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

describe("session state machine", () => {
  it("allows DRAFT -> CONFIGURED -> ARMED -> ADMITTED -> ABORTED and rejects reversed transitions", async () => {
    const owner = await registerOwner();
    const session = await prisma.interviewSession.create({
      data: { id: "ses_test0000000000000000001", orgId: owner.orgId, createdById: owner.userId, mode: "DIRECT_LINK" },
    });

    const ctx = { orgId: owner.orgId, actorType: "USER" as const, actorId: owner.userId };

    await expect(transition(session.id, ["CONFIGURED"], "ARMED", ctx)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    const configured = await transition(session.id, ["DRAFT"], "CONFIGURED", ctx);
    expect(configured.status).toBe("CONFIGURED");

    const armed = await transition(session.id, ["CONFIGURED"], "ARMED", ctx);
    expect(armed.status).toBe("ARMED");
    expect(armed.armedAt).not.toBeNull();

    const admitted = await transition(session.id, ["ARMED"], "ADMITTED", ctx);
    expect(admitted.status).toBe("ADMITTED");

    const aborted = await transition(session.id, ["ADMITTED"], "ABORTED", ctx);
    expect(aborted.status).toBe("ABORTED");
    expect(aborted.endedAt).not.toBeNull();

    // Session is ABORTED now; a transition gated on a stale "from" status must be rejected.
    await expect(transition(session.id, ["CONFIGURED"], "LIVE", ctx)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("404s a transition on a session from another org", async () => {
    const owner = await registerOwner();
    const other = await prisma.organization.create({ data: { name: "Other", slug: "other-org" } });
    const session = await prisma.interviewSession.create({
      data: { id: "ses_test0000000000000000002", orgId: other.id, createdById: owner.userId, mode: "DIRECT_LINK" },
    });

    await expect(
      transition(session.id, ["DRAFT"], "CONFIGURED", { orgId: owner.orgId, actorType: "USER", actorId: owner.userId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("POST /sessions and GET /sessions", () => {
  it("creates a session with the creator as primary interviewer", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ mode: "DIRECT_LINK", title: "Backend Round 1", durationMinutes: 45 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.interviewers).toEqual([{ userId: owner.userId, name: "Owner", isPrimary: true }]);
  });

  it("lists only sessions in the caller's org", async () => {
    const owner = await registerOwner();
    await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });

    const otherOwner = await registerOwner({ email: "other@example.com", orgName: "Other Org" });
    await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${otherOwner.accessToken}`).send({ mode: "DIRECT_LINK" });

    const res = await request(app).get("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("session access control", () => {
  async function createSessionAs(accessToken: string) {
    const res = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${accessToken}`).send({ mode: "DIRECT_LINK" });
    return res.body.data.id as string;
  }

  it("404s GET for a session in another org", async () => {
    const owner = await registerOwner();
    const sessionId = await createSessionAs(owner.accessToken);

    const otherOwner = await registerOwner({ email: "other@example.com", orgName: "Other Org" });
    const res = await request(app).get(`/api/v1/sessions/${sessionId}`).set("Authorization", `Bearer ${otherOwner.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("blocks an unbound INTERVIEWER in the same org from reading the session", async () => {
    const owner = await registerOwner();
    const sessionId = await createSessionAs(owner.accessToken);

    const interviewer = await registerOwner({ email: "interviewer@example.com", orgName: "Interviewer's Own Org" });
    await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "interviewer@example.com", role: "INTERVIEWER" });
    const switched = await request(app)
      .post("/api/v1/auth/switch-org")
      .set("Authorization", `Bearer ${interviewer.accessToken}`)
      .send({ orgId: owner.orgId });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${switched.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows an INTERVIEWER bound to the session to read it", async () => {
    const owner = await registerOwner();
    const sessionId = await createSessionAs(owner.accessToken);

    const interviewer = await registerOwner({ email: "interviewer2@example.com", orgName: "Interviewer's Own Org 2" });
    await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "interviewer2@example.com", role: "INTERVIEWER" });
    const switched = await request(app)
      .post("/api/v1/auth/switch-org")
      .set("Authorization", `Bearer ${interviewer.accessToken}`)
      .send({ orgId: owner.orgId });
    const bearer = `Bearer ${switched.body.data.accessToken}`;

    await request(app).post(`/api/v1/sessions/${sessionId}/interviewers`).set("Authorization", `Bearer ${owner.accessToken}`).send({
      userId: interviewer.userId,
    });

    const res = await request(app).get(`/api/v1/sessions/${sessionId}`).set("Authorization", bearer);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /sessions/:id and cancel", () => {
  it("rejects editing basic fields once LIVE", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    await transition(sessionId, ["DRAFT"], "LIVE", { orgId: owner.orgId, actorType: "USER" });

    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "New title" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("cancels a DRAFT session to ABORTED", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    const res = await request(app).post(`/api/v1/sessions/${sessionId}/cancel`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ABORTED");
  });
});

describe("interviewer management", () => {
  it("cannot remove the primary interviewer", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    const res = await request(app)
      .delete(`/api/v1/sessions/${sessionId}/interviewers/${owner.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("PATCH /sessions/:id/config", () => {
  it("transitions DRAFT to CONFIGURED and validates taskIds belong to the org", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    const bad = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ taskIds: ["does-not-exist"] });
    expect(bad.status).toBe(400);

    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ interviewType: "CODING", channels: ["FOCUS", "PASTE"], sensitivity: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CONFIGURED");
    expect(res.body.data.config.channels).toEqual(["FOCUS", "PASTE"]);
    expect(res.body.data.config.configVersion).toBe(1);
  });

  it("sets needsReconsent when a channel is added after a consent already exists", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/sessions/${sessionId}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ channels: ["FOCUS"] });

    const joinToken = await prisma.joinToken.create({
      data: { jti: "jti-test-1", sessionId, kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000), createdById: owner.userId },
    });
    await prisma.consent.create({
      data: {
        sessionId,
        joinTokenId: joinToken.id,
        accepted: true,
        channels: ["FOCUS"],
        scopeDisplayed: { bullets: ["We monitor focus."] },
        policyHash: "z".repeat(64),
        configVersion: 1,
        retentionDays: 90,
        ipHash: "x".repeat(64),
        uaHash: "y".repeat(64),
      },
    });

    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ channels: ["FOCUS", "PASTE"] });

    expect(res.status).toBe(200);
    expect(res.body.data.config.needsReconsent).toBe(true);
  });
});

describe("job description upload and parse", () => {
  it("uploads JD text, enqueues parsing, and the worker parses it deterministically", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    const upload = await request(app)
      .post(`/api/v1/sessions/${sessionId}/jd`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ text: "Senior Backend Engineer. Node.js, PostgreSQL, system design." });
    expect(upload.status).toBe(202);
    expect(upload.body.data.parseStatus).toBe("PENDING");

    await processJdParse({ data: { sessionId } } as unknown as Job<JdParseJobData>);

    const res = await request(app).get(`/api/v1/sessions/${sessionId}/jd`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.parseStatus).toBe("PARSED");
    expect(res.body.data.parsed.skills.length).toBeGreaterThan(0);
  });

  it("rejects a PATCH with an invalid ParsedJD shape", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });
    const sessionId = created.body.data.id as string;

    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/jd`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ parsed: { role: "x" } });
    expect(res.status).toBe(400);
  });
});
