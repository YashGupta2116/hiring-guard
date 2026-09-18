import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { getMail } from "../../src/providers/index.js";
import { prisma } from "../../src/utils/prisma.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.note.deleteMany(),
    prisma.joinToken.deleteMany(),
    prisma.report.deleteMany(),
    prisma.sessionCodingTask.deleteMany(),
    prisma.sessionInterviewer.deleteMany(),
    prisma.interviewSession.deleteMany(),
    prisma.codingTask.deleteMany(),
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerOwner(overrides: Partial<Record<string, string>> = {}) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: "owner@example.com", password: "correct-horse-battery", orgName: "Acme", ...overrides });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

/** Registers a user in its own org, adds it to `owner`'s org with `role`, and returns a token scoped to that org. */
async function memberToken(owner: { accessToken: string; orgId: string }, email: string, role: "REVIEWER" | "INTERVIEWER") {
  const own = await registerOwner({ email, orgName: `${email} org` });
  await request(app).post("/api/v1/org/members").set(auth(owner.accessToken)).send({ email, role });
  const switched = await request(app).post("/api/v1/auth/switch-org").set(auth(own.accessToken)).send({ orgId: owner.orgId });
  return { accessToken: switched.body.data.accessToken as string, userId: own.userId };
}

async function createSession(token: string) {
  const res = await request(app)
    .post("/api/v1/sessions")
    .set(auth(token))
    .send({ mode: "SCHEDULED", title: "Backend Engineer", candidateEmail: "cand@example.com", candidateName: "Cand", durationMinutes: 60 });
  return res;
}

async function configuredSession(token: string): Promise<string> {
  const created = await createSession(token);
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  const cfg = await request(app).patch(`/api/v1/sessions/${id}/config`).set(auth(token)).send({ interviewType: "TECHNICAL" });
  expect(cfg.status).toBe(200);
  return id;
}

describe("POST /sessions permissions", () => {
  it("lets an INTERVIEWER create a session but not a REVIEWER", async () => {
    const owner = await registerOwner();
    const interviewer = await memberToken(owner, "int@example.com", "INTERVIEWER");
    const reviewer = await memberToken(owner, "rev@example.com", "REVIEWER");

    expect((await createSession(interviewer.accessToken)).status).toBe(201);
    const denied = await createSession(reviewer.accessToken);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

describe("session DTO", () => {
  it("exposes lifecycle timestamps and reportId for the detail timeline / list actions", async () => {
    const owner = await registerOwner();
    const id = await configuredSession(owner.accessToken);

    const before = await request(app).get(`/api/v1/sessions/${id}`).set(auth(owner.accessToken));
    expect(before.body.data).toMatchObject({ status: "CONFIGURED", armedAt: null, admittedAt: null, sealedAt: null, reportId: null });

    await request(app)
      .post(`/api/v1/sessions/${id}/links`)
      .set(auth(owner.accessToken))
      .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    const armed = await request(app).get(`/api/v1/sessions/${id}`).set(auth(owner.accessToken));
    expect(armed.body.data.status).toBe("ARMED");
    expect(armed.body.data.armedAt).not.toBeNull();

    const report = await prisma.report.create({ data: { sessionId: id, compositeScore: 80, model: {}, methodology: {} } });
    const withReport = await request(app).get(`/api/v1/sessions`).set(auth(owner.accessToken));
    expect(withReport.body.data[0].reportId).toBe(report.id);
  });
});

describe("GET /sessions/:id/links", () => {
  it("returns a working join URL to a writer, hides it from a read-only reviewer, and drops it once revoked", async () => {
    const owner = await registerOwner();
    const reviewer = await memberToken(owner, "rev@example.com", "REVIEWER");
    const id = await configuredSession(owner.accessToken);

    const created = await request(app)
      .post(`/api/v1/sessions/${id}/links`)
      .set(auth(owner.accessToken))
      .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const linkId = created.body.data.linkId as string;

    const asOwner = await request(app).get(`/api/v1/sessions/${id}/links`).set(auth(owner.accessToken));
    expect(asOwner.status).toBe(200);
    const url = asOwner.body.data[0].url as string;
    expect(url).toContain("/join/");

    // The re-signed token must actually be accepted by the join flow.
    const summary = await request(app).get(`/api/v1/join/${url.split("/join/")[1]}`);
    expect(summary.status).toBe(200);

    const asReviewer = await request(app).get(`/api/v1/sessions/${id}/links`).set(auth(reviewer.accessToken));
    expect(asReviewer.status).toBe(200);
    expect(asReviewer.body.data[0].url).toBeNull();
    expect(asReviewer.body.data[0].linkId).toBe(linkId);

    await request(app).post(`/api/v1/sessions/${id}/links/${linkId}/revoke`).set(auth(owner.accessToken));
    const afterRevoke = await request(app).get(`/api/v1/sessions/${id}/links`).set(auth(owner.accessToken));
    expect(afterRevoke.body.data[0].url).toBeNull();
    expect(afterRevoke.body.data[0].revokedAt).not.toBeNull();
  });

  it("lets the bound interviewer who created the session see the URL, but not an unrelated interviewer", async () => {
    const owner = await registerOwner();
    const creator = await memberToken(owner, "creator@example.com", "INTERVIEWER");
    const other = await memberToken(owner, "other@example.com", "INTERVIEWER");
    const id = await configuredSession(creator.accessToken);
    await request(app)
      .post(`/api/v1/sessions/${id}/links`)
      .set(auth(creator.accessToken))
      .send({ kind: "REUSABLE", expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    const asCreator = await request(app).get(`/api/v1/sessions/${id}/links`).set(auth(creator.accessToken));
    expect(asCreator.body.data[0].url).toContain("/join/");

    const asOther = await request(app).get(`/api/v1/sessions/${id}/links`).set(auth(other.accessToken));
    expect(asOther.status).toBe(403);
  });
});

describe("POST /sessions/:id/links sendInvite", () => {
  it("emails the candidate the same URL it returns, and only when asked", async () => {
    const owner = await registerOwner();
    const mail = getMail() as unknown as { sent: { to: string; text: string }[] };
    const before = mail.sent.length;

    const withInvite = await configuredSession(owner.accessToken);
    const created = await request(app)
      .post(`/api/v1/sessions/${withInvite}/links`)
      .set(auth(owner.accessToken))
      .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString(), sendInvite: true });
    expect(created.status).toBe(201);
    expect(mail.sent).toHaveLength(before + 1);
    expect(mail.sent[before]!.to).toBe("cand@example.com");
    expect(mail.sent[before]!.text).toContain(created.body.data.url);

    const withoutInvite = await configuredSession(owner.accessToken);
    await request(app)
      .post(`/api/v1/sessions/${withoutInvite}/links`)
      .set(auth(owner.accessToken))
      .send({ kind: "ONE_TIME", expiresAt: new Date(Date.now() + 3600_000).toISOString(), sendInvite: false });
    expect(mail.sent).toHaveLength(before + 1);
  });
});
