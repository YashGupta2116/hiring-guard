import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.answerGrade.deleteMany(),
    prisma.qAPair.deleteMany(),
    prisma.report.deleteMany(),
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function addCandidate(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/v1/candidates").set(auth(token)).send(body);
}

describe("candidate directory", () => {
  it("creates a candidate with a full profile and defaults status to UNDER_REVIEW", async () => {
    const owner = await registerOwner();
    const res = await addCandidate(owner.accessToken, {
      email: "Jordan@Example.com",
      name: "Jordan Miller",
      appliedRole: "Backend Engineer",
      location: "Berlin",
      experienceYears: 6,
      skills: ["Go", "Postgres"],
      bio: "Ten years of services work.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: "jordan@example.com",
      name: "Jordan Miller",
      appliedRole: "Backend Engineer",
      experienceYears: 6,
      skills: ["Go", "Postgres"],
      status: "UNDER_REVIEW",
      interviewsTaken: 0,
      lastInterviewAt: null,
      averageScore: null,
    });
  });

  it("rejects an invalid email and a bad status", async () => {
    const owner = await registerOwner();
    expect((await addCandidate(owner.accessToken, { email: "nope" })).status).toBe(400);
    expect((await addCandidate(owner.accessToken, { email: "a@b.co", status: "MAYBE" })).status).toBe(400);
  });

  it("lists newest first, filters by q / status / role, and paginates with a cursor", async () => {
    const owner = await registerOwner();
    await addCandidate(owner.accessToken, { email: "a@x.co", name: "Alice", appliedRole: "Frontend", skills: ["React"] });
    await addCandidate(owner.accessToken, { email: "b@x.co", name: "Bob", appliedRole: "Backend", skills: ["Go"], status: "HIRED" });
    await addCandidate(owner.accessToken, { email: "c@x.co", name: "Cara", appliedRole: "Backend" });

    const all = await request(app).get("/api/v1/candidates").set(auth(owner.accessToken));
    expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(["Cara", "Bob", "Alice"]);

    const byRole = await request(app).get("/api/v1/candidates?appliedRole=Backend").set(auth(owner.accessToken));
    expect(byRole.body.data).toHaveLength(2);

    const byStatus = await request(app).get("/api/v1/candidates?status=HIRED").set(auth(owner.accessToken));
    expect(byStatus.body.data.map((c: { name: string }) => c.name)).toEqual(["Bob"]);

    const bySkill = await request(app).get("/api/v1/candidates?q=React").set(auth(owner.accessToken));
    expect(bySkill.body.data.map((c: { name: string }) => c.name)).toEqual(["Alice"]);

    // Skill search is case-insensitive and matches substrings ("eac" -> React); a stray "%" must not break the query.
    const lower = await request(app).get("/api/v1/candidates?q=react").set(auth(owner.accessToken));
    expect(lower.body.data.map((c: { name: string }) => c.name)).toEqual(["Alice"]);
    const partial = await request(app).get("/api/v1/candidates?q=eac").set(auth(owner.accessToken));
    expect(partial.body.data.map((c: { name: string }) => c.name)).toEqual(["Alice"]);
    const wildcard = await request(app).get("/api/v1/candidates?q=%25").set(auth(owner.accessToken));
    expect(wildcard.status).toBe(200);

    const page1 = await request(app).get("/api/v1/candidates?limit=2").set(auth(owner.accessToken));
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.nextCursor).not.toBeNull();
    const page2 = await request(app).get(`/api/v1/candidates?limit=2&cursor=${page1.body.meta.nextCursor}`).set(auth(owner.accessToken));
    expect(page2.body.data.map((c: { name: string }) => c.name)).toEqual(["Alice"]);
    expect(page2.body.meta.nextCursor).toBeNull();
  });

  it("summarises the whole directory (counts by status and distinct roles)", async () => {
    const owner = await registerOwner();
    await addCandidate(owner.accessToken, { email: "a@x.co", appliedRole: "Frontend" });
    await addCandidate(owner.accessToken, { email: "b@x.co", appliedRole: "Backend", status: "HIRED" });
    await addCandidate(owner.accessToken, { email: "c@x.co", appliedRole: "Backend", status: "HIRED" });

    const res = await request(app).get("/api/v1/candidates/summary").set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byStatus).toMatchObject({ UNDER_REVIEW: 1, HIRED: 2, REJECTED: 0 });
    expect(res.body.data.roles).toEqual(["Backend", "Frontend"]);
  });

  it("updates status and notes, and clears a nullable field", async () => {
    const owner = await registerOwner();
    const created = await addCandidate(owner.accessToken, { email: "a@x.co", name: "Alice", phone: "123" });
    const id = created.body.data.id as string;

    const res = await request(app)
      .patch(`/api/v1/candidates/${id}`)
      .set(auth(owner.accessToken))
      .send({ status: "SHORTLISTED", notes: "Strong on systems.", phone: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "SHORTLISTED", notes: "Strong on systems.", phone: null });

    const empty = await request(app).patch(`/api/v1/candidates/${id}`).set(auth(owner.accessToken)).send({});
    expect(empty.status).toBe(400);
  });

  it("derives interview count, last interview and average score from real sessions and reports", async () => {
    const owner = await registerOwner();
    const created = await addCandidate(owner.accessToken, { email: "a@x.co", name: "Alice" });
    const candidateId = created.body.data.id as string;
    const startedAt = new Date("2026-09-10T10:00:00Z");

    const make = async (sid: string, composite: number | null, started: boolean) => {
      await prisma.interviewSession.create({
        data: {
          id: sid,
          orgId: owner.orgId,
          createdById: owner.userId,
          candidateId,
          mode: "DIRECT_LINK",
          status: started ? "COMPLETE" : "DRAFT",
          startedAt: started ? startedAt : null,
        },
      });
      await prisma.sessionInterviewer.create({ data: { sessionId: sid, userId: owner.userId, isPrimary: true } });
      if (started) {
        await prisma.report.create({ data: { sessionId: sid, compositeScore: composite, integrityScore: 90, model: {}, methodology: {} } });
      }
    };
    await make("ses_test0000000000000000a01", 80, true);
    await make("ses_test0000000000000000a02", 70, true);
    await make("ses_test0000000000000000a03", null, false);

    const list = await request(app).get("/api/v1/candidates").set(auth(owner.accessToken));
    expect(list.body.data[0]).toMatchObject({ interviewsTaken: 2, averageScore: 75 });
    expect(new Date(list.body.data[0].lastInterviewAt).toISOString()).toBe(startedAt.toISOString());
  });

  it("returns session history, real competencies vs the org benchmark, and graded strengths", async () => {
    const owner = await registerOwner();
    const alice = (await addCandidate(owner.accessToken, { email: "a@x.co", name: "Alice" })).body.data.id as string;
    const bob = (await addCandidate(owner.accessToken, { email: "b@x.co", name: "Bob" })).body.data.id as string;

    const grade = async (sid: string, candidateId: string, score: number, strengths: string[]) => {
      await prisma.interviewSession.create({
        data: { id: sid, orgId: owner.orgId, createdById: owner.userId, candidateId, mode: "DIRECT_LINK", status: "COMPLETE", startedAt: new Date() },
      });
      await prisma.sessionInterviewer.create({ data: { sessionId: sid, userId: owner.userId, isPrimary: true } });
      const qa = await prisma.qAPair.create({
        data: { sessionId: sid, position: 1, questionText: "q", answerText: "a", questionStartMs: 0, answerEndMs: 1000 },
      });
      await prisma.answerGrade.create({
        data: {
          qaPairId: qa.id,
          correctness: score,
          depth: score,
          specificity: score,
          structure: score,
          handsOn: score,
          strengths,
          concerns: ["Vague on trade-offs"],
          positiveSignals: [],
        },
      });
    };
    await grade("ses_test0000000000000000b01", alice, 90, ["Clear structure"]);
    await grade("ses_test0000000000000000b02", bob, 50, ["Clear structure"]);

    const res = await request(app).get(`/api/v1/candidates/${alice}`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0]).toMatchObject({ id: "ses_test0000000000000000b01", interviewerName: "Owner" });
    expect(res.body.data.competencies).toHaveLength(5);
    expect(res.body.data.competencies[0]).toMatchObject({ skill: "correctness", score: 90, benchmark: 70 });
    expect(res.body.data.strengths).toEqual(["Clear structure"]);
    expect(res.body.data.concerns).toEqual(["Vague on trade-offs"]);
  });

  it("returns no competencies for a candidate with nothing graded", async () => {
    const owner = await registerOwner();
    const id = (await addCandidate(owner.accessToken, { email: "a@x.co" })).body.data.id as string;
    const res = await request(app).get(`/api/v1/candidates/${id}`).set(auth(owner.accessToken));
    expect(res.body.data).toMatchObject({ competencies: [], strengths: [], concerns: [], sessions: [] });
  });

  it("is read-only for a REVIEWER and isolated per organisation", async () => {
    const owner = await registerOwner();
    const id = (await addCandidate(owner.accessToken, { email: "a@x.co" })).body.data.id as string;

    const reviewer = await registerOwner({ email: "reviewer@example.com", orgName: "Reviewer Org" });
    await request(app)
      .post("/api/v1/org/members")
      .set(auth(owner.accessToken))
      .send({ email: "reviewer@example.com", role: "REVIEWER" });
    const switched = await request(app).post("/api/v1/auth/switch-org").set(auth(reviewer.accessToken)).send({ orgId: owner.orgId });
    const reviewerToken = switched.body.data.accessToken as string;

    expect((await request(app).get("/api/v1/candidates").set(auth(reviewerToken))).status).toBe(200);
    expect((await addCandidate(reviewerToken, { email: "z@x.co" })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/candidates/${id}`).set(auth(reviewerToken)).send({ status: "HIRED" })).status).toBe(403);

    // The reviewer's own org must not see the owner org's candidate.
    const other = await request(app).get(`/api/v1/candidates/${id}`).set(auth(reviewer.accessToken));
    expect(other.status).toBe(404);
    const otherPatch = await request(app).patch(`/api/v1/candidates/${id}`).set(auth(reviewer.accessToken)).send({ notes: "x" });
    expect(otherPatch.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/candidates")).status).toBe(401);
    expect((await request(app).get("/api/v1/candidates/summary")).status).toBe(401);
  });
});
