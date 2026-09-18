import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { signJoinToken } from "../../src/utils/jwt.js";
import { ulid } from "ulid";
import { assertNoForbiddenKeys } from "../helpers/candidate-boundary.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.consent.deleteMany(),
    prisma.preflightCheck.deleteMany(),
    prisma.joinToken.deleteMany(),
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

async function registerOwner() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: "owner@example.com", password: "correct-horse-battery", orgName: "Acme" });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

async function createConfiguredSession(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ mode: "DIRECT_LINK", candidateEmail: "candidate@example.com", candidateName: "Cand Idate" });
  const sessionId = created.body.data.id as string;
  await request(app)
    .patch(`/api/v1/sessions/${sessionId}/config`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ channels: ["FOCUS", "PASTE"] });
  return sessionId;
}

function passingProbe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    webrtc: true,
    getDisplayMedia: true,
    camera: "granted",
    microphone: "granted",
    screenCount: 1,
    isExtended: false,
    downlinkMbps: 20,
    hardwareConcurrency: 8,
    userAgent: "vitest",
    ...overrides,
  };
}

async function createLink(accessToken: string, sessionId: string, kind: "ONE_TIME" | "REUSABLE" = "ONE_TIME") {
  const res = await request(app)
    .post(`/api/v1/sessions/${sessionId}/links`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ kind, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  expect(res.status).toBe(201);
  const rawToken = (res.body.data.url as string).split("/join/")[1]!;
  return { rawToken, linkId: res.body.data.linkId as string };
}

describe("POST /sessions/:id/links", () => {
  it("mints a link and transitions CONFIGURED -> ARMED", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);

    const { rawToken } = await createLink(owner.accessToken, sessionId);
    expect(typeof rawToken).toBe("string");

    const session = await request(app).get(`/api/v1/sessions/${sessionId}`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(session.body.data.status).toBe("ARMED");
  });
});

describe("full join -> preflight -> policy -> consent -> ADMITTED", () => {
  it("accepts consent and returns a candidate token; the link is then consumed", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);

    const summary = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.status).toBe("READY");
    assertNoForbiddenKeys(summary.body.data);

    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe());
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.passed).toBe(true);

    const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);
    expect(policy.status).toBe(200);
    assertNoForbiddenKeys(policy.body.data);

    const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
      preflightId: preflight.body.data.preflightId,
      policyHash: policy.body.data.policyHash,
      accepted: true,
      scrolledToEnd: true,
    });
    expect(consent.status).toBe(200);
    expect(typeof consent.body.data.candidateToken).toBe("string");
    assertNoForbiddenKeys(consent.body.data);

    const session = await request(app).get(`/api/v1/sessions/${sessionId}`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(session.body.data.status).toBe("ADMITTED");

    // ONE_TIME link is now consumed.
    const reuse = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(reuse.status).toBe(410);
    expect(reuse.body.error.code).toBe("LINK_CONSUMED");
  });

  it("rejects consent with a stale policyHash after the session config changes", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);

    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe());
    const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);

    await request(app)
      .patch(`/api/v1/sessions/${sessionId}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ channels: ["FOCUS", "PASTE", "POINTER"] });

    const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
      preflightId: preflight.body.data.preflightId,
      policyHash: policy.body.data.policyHash,
      accepted: true,
      scrolledToEnd: true,
    });
    expect(consent.status).toBe(409);
    expect(consent.body.error.code).toBe("POLICY_CHANGED");
  });

  it("declining consent aborts the session with candidate_declined", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);

    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe());
    const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);

    const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
      preflightId: preflight.body.data.preflightId,
      policyHash: policy.body.data.policyHash,
      accepted: false,
      scrolledToEnd: true,
    });
    expect(consent.status).toBe(200);
    expect(consent.body.data.ended).toBe(true);

    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("ABORTED");
    expect(session.endReason).toBe("candidate_declined");
  });

  it("rejects a failing preflight and blocks consent without one", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);

    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe({ camera: "denied" }));
    expect(preflight.body.data.passed).toBe(false);
    expect(preflight.body.data.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NO_CAMERA" })]));

    const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);
    const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
      preflightId: preflight.body.data.preflightId,
      policyHash: policy.body.data.policyHash,
      accepted: true,
      scrolledToEnd: true,
    });
    expect(consent.status).toBe(409);
    expect(consent.body.error.code).toBe("PREFLIGHT_REQUIRED");
  });
});

describe("join window", () => {
  async function scheduledSession(accessToken: string, scheduledAt: Date) {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mode: "SCHEDULED", candidateEmail: "candidate@example.com", scheduledAt: scheduledAt.toISOString(), durationMinutes: 60 });
    expect(created.status).toBe(201);
    const sessionId = created.body.data.id as string;
    await request(app).patch(`/api/v1/sessions/${sessionId}/config`).set("Authorization", `Bearer ${accessToken}`).send({ channels: ["FOCUS", "PASTE"] }).expect(200);
    return sessionId;
  }

  it("keeps a candidate out of the waiting room until 15 minutes before the start, then lets them in", async () => {
    const owner = await registerOwner();
    const sessionId = await scheduledSession(owner.accessToken, new Date(Date.now() + 3 * 3600_000));
    const { rawToken } = await createLink(owner.accessToken, sessionId, "REUSABLE");

    const summary = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.status).toBe("NOT_YET_OPEN");
    expect(new Date(summary.body.data.opensAt).getTime()).toBeGreaterThan(Date.now() + 2 * 3600_000);

    for (const res of [
      await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe()),
      await request(app).get(`/api/v1/join/${rawToken}/policy`),
      await request(app).post(`/api/v1/join/${rawToken}/consent`).send({ preflightId: "x", policyHash: "x", accepted: true, scrolledToEnd: true }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("INTERVIEW_NOT_OPEN");
    }

    // Moving the start to 10 minutes from now puts "now" inside the 15-minute window.
    await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString() })
      .expect(200);
    const open = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(open.body.data.status).toBe("READY");
    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe());
    expect(preflight.status).toBe(200);
  });

  it("does not restrict a link for a session with no scheduled time", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);
    const summary = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(summary.body.data.status).toBe("READY");
    expect(summary.body.data.opensAt).toBeNull();
  });
});

describe("changing the candidate on a session", () => {
  it("assigns the new candidate and revokes links issued for the previous one", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken } = await createLink(owner.accessToken, sessionId);

    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ candidateEmail: "new.candidate@example.com", candidateName: "New Candidate" });
    expect(res.status).toBe(200);
    expect(res.body.data.candidate.email).toBe("new.candidate@example.com");

    const old = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe("LINK_REVOKED");

    // Re-saving the same candidate is not a change and revokes nothing.
    const fresh = await createLink(owner.accessToken, sessionId);
    await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ candidateEmail: "new.candidate@example.com" })
      .expect(200);
    await request(app).get(`/api/v1/join/${fresh.rawToken}`).expect(200);
  });
});

describe("join link error states", () => {
  it("returns LINK_REVOKED for a revoked link", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const { rawToken, linkId } = await createLink(owner.accessToken, sessionId);

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/links/${linkId}/revoke`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);

    const res = await request(app).get(`/api/v1/join/${rawToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("LINK_REVOKED");
  });

  it("returns LINK_EXPIRED for an expired link", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);

    const jti = ulid();
    const token = await signJoinToken({ jti, sid: sessionId, kind: "ONE_TIME" });
    await prisma.joinToken.create({
      data: { jti, sessionId, kind: "ONE_TIME", expiresAt: new Date(Date.now() - 1000), createdById: owner.userId },
    });

    const res = await request(app).get(`/api/v1/join/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("LINK_EXPIRED");
  });

  it("returns UNAUTHENTICATED for a token with an unknown jti", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const token = await signJoinToken({ jti: "unknown-jti", sid: sessionId, kind: "ONE_TIME" });

    const res = await request(app).get(`/api/v1/join/${token}`);
    expect(res.status).toBe(401);
  });
});

describe("candidate endpoints", () => {
  async function admitCandidate(accessToken: string, sessionId: string) {
    const { rawToken } = await createLink(accessToken, sessionId);
    const preflight = await request(app).post(`/api/v1/join/${rawToken}/preflight`).send(passingProbe());
    const policy = await request(app).get(`/api/v1/join/${rawToken}/policy`);
    const consent = await request(app).post(`/api/v1/join/${rawToken}/consent`).send({
      preflightId: preflight.body.data.preflightId,
      policyHash: policy.body.data.policyHash,
      accepted: true,
      scrolledToEnd: true,
    });
    return consent.body.data.candidateToken as string;
  }

  it("returns an allow-list session DTO and confirms media readiness", async () => {
    const owner = await registerOwner();
    const sessionId = await createConfiguredSession(owner.accessToken);
    const candidateToken = await admitCandidate(owner.accessToken, sessionId);

    const session = await request(app).get("/api/v1/candidate/session").set("Authorization", `Bearer ${candidateToken}`);
    expect(session.status).toBe(200);
    assertNoForbiddenKeys(session.body.data);

    const ready = await request(app)
      .post("/api/v1/candidate/media-ready")
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({ tracks: { camera: true, microphone: true, screen: true } });
    expect(ready.status).toBe(200);
    expect(ready.body.data.ready).toBe(true);
  });

  it("rejects a missing or invalid candidate token", async () => {
    const res = await request(app).get("/api/v1/candidate/session");
    expect(res.status).toBe(401);

    const bad = await request(app).get("/api/v1/candidate/session").set("Authorization", "Bearer not-a-real-token");
    expect(bad.status).toBe(401);
  });
});
