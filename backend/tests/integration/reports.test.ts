import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerOwner(overrides: Partial<Record<string, string>> = {}) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Owner", email: "owner@example.com", password: "correct-horse-battery", orgName: "Acme", ...overrides });
  return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string, userId: res.body.data.user.id as string };
}

async function memberToken(owner: { accessToken: string; orgId: string }, email: string, role: "INTERVIEWER" | "REVIEWER") {
  const own = await registerOwner({ email, orgName: `${email} org` });
  await request(app).post("/api/v1/org/members").set(auth(owner.accessToken)).send({ email, role });
  const switched = await request(app).post("/api/v1/auth/switch-org").set(auth(own.accessToken)).send({ orgId: owner.orgId });
  return { accessToken: switched.body.data.accessToken as string, userId: own.userId };
}

let seq = 0;
async function makeReport(
  owner: { orgId: string; userId: string },
  opts: { title: string; candidateName: string; integrity: number | null; composite?: number | null; interviewerIds?: string[] },
) {
  seq += 1;
  const id = `ses_test00000000000000r${String(seq).padStart(3, "0")}`;
  const candidate = await prisma.candidate.create({ data: { orgId: owner.orgId, email: `c${seq}@x.co`, name: opts.candidateName } });
  await prisma.interviewSession.create({
    data: { id, orgId: owner.orgId, createdById: owner.userId, candidateId: candidate.id, mode: "DIRECT_LINK", status: "COMPLETE", title: opts.title, startedAt: new Date() },
  });
  await prisma.sessionInterviewer.create({ data: { sessionId: id, userId: owner.userId, isPrimary: true } });
  for (const userId of opts.interviewerIds ?? []) {
    await prisma.sessionInterviewer.create({ data: { sessionId: id, userId } });
  }
  const report = await prisma.report.create({
    data: {
      sessionId: id,
      integrityScore: opts.integrity,
      compositeScore: opts.composite ?? null,
      reviewRequired: opts.integrity !== null && opts.integrity < 70,
      model: { flags: [], qaPairs: [], codeEvaluations: [] },
      methodology: { detectorVersion: "t", weightsVersion: "t", unscoredWindows: [], supersededFlags: [], chainHead: null, lastSeq: null },
    },
  });
  return { sessionId: id, reportId: report.id };
}

describe("GET /reports", () => {
  it("lists newest first with a total, and filters by search text and integrity band", async () => {
    const owner = await registerOwner();
    await makeReport(owner, { title: "Backend Engineer", candidateName: "Alice", integrity: 92, composite: 88 });
    await makeReport(owner, { title: "Frontend Engineer", candidateName: "Bob", integrity: 75 });
    await makeReport(owner, { title: "Backend Engineer", candidateName: "Cara", integrity: 40 });

    const all = await request(app).get("/api/v1/reports").set(auth(owner.accessToken));
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data.map((r: { session: { candidate: { name: string } } }) => r.session.candidate.name)).toEqual(["Cara", "Bob", "Alice"]);
    expect(all.body.data[0]).toMatchObject({ scores: { integrity: 40, reviewRequired: true }, session: { interviewerName: "Owner" } });

    const high = await request(app).get("/api/v1/reports?band=HIGH").set(auth(owner.accessToken));
    expect(high.body.data).toHaveLength(1);
    expect(high.body.data[0].scores.integrity).toBe(92);
    expect((await request(app).get("/api/v1/reports?band=MODERATE").set(auth(owner.accessToken))).body.data).toHaveLength(1);
    expect((await request(app).get("/api/v1/reports?band=REVIEW").set(auth(owner.accessToken))).body.data).toHaveLength(1);

    const bySearch = await request(app).get("/api/v1/reports?q=frontend").set(auth(owner.accessToken));
    expect(bySearch.body.data).toHaveLength(1);
    const byCandidate = await request(app).get("/api/v1/reports?q=cara").set(auth(owner.accessToken));
    expect(byCandidate.body.data).toHaveLength(1);
  });

  it("paginates with a cursor", async () => {
    const owner = await registerOwner();
    for (const name of ["A", "B", "C"]) await makeReport(owner, { title: "T", candidateName: name, integrity: 90 });
    const p1 = await request(app).get("/api/v1/reports?limit=2").set(auth(owner.accessToken));
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.meta.nextCursor).not.toBeNull();
    const p2 = await request(app).get(`/api/v1/reports?limit=2&cursor=${p1.body.meta.nextCursor}`).set(auth(owner.accessToken));
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.meta.nextCursor).toBeNull();
  });

  it("shows an interviewer only the reports of sessions they are bound to, but a reviewer everything", async () => {
    const owner = await registerOwner();
    const interviewer = await memberToken(owner, "int@example.com", "INTERVIEWER");
    const reviewer = await memberToken(owner, "rev@example.com", "REVIEWER");
    await makeReport(owner, { title: "Mine", candidateName: "A", integrity: 90, interviewerIds: [interviewer.userId] });
    await makeReport(owner, { title: "Not mine", candidateName: "B", integrity: 90 });

    const asInterviewer = await request(app).get("/api/v1/reports").set(auth(interviewer.accessToken));
    expect(asInterviewer.body.data.map((r: { session: { title: string } }) => r.session.title)).toEqual(["Mine"]);
    expect(asInterviewer.body.meta.total).toBe(1);

    const asReviewer = await request(app).get("/api/v1/reports").set(auth(reviewer.accessToken));
    expect(asReviewer.body.meta.total).toBe(2);
  });

  it("requires authentication and never leaks another organisation's reports", async () => {
    const owner = await registerOwner();
    await makeReport(owner, { title: "Secret", candidateName: "A", integrity: 90 });
    const other = await registerOwner({ email: "other@example.com", orgName: "Other" });

    expect((await request(app).get("/api/v1/reports")).status).toBe(401);
    const res = await request(app).get("/api/v1/reports").set(auth(other.accessToken));
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});

describe("GET /reports/:reportId", () => {
  it("returns the report with its session summary, and enforces org and binding", async () => {
    const owner = await registerOwner();
    const interviewer = await memberToken(owner, "int@example.com", "INTERVIEWER");
    const { reportId } = await makeReport(owner, { title: "Backend Engineer", candidateName: "Alice", integrity: 92, composite: 88 });

    const res = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: reportId,
      scores: { integrity: 92, composite: 88, reviewRequired: false },
      session: { title: "Backend Engineer", candidate: { name: "Alice" }, interviewerName: "Owner" },
    });
    expect(res.body.data.model).toMatchObject({ flags: [] });

    // An interviewer who isn't bound to the session can't read it.
    expect((await request(app).get(`/api/v1/reports/${reportId}`).set(auth(interviewer.accessToken))).status).toBe(403);

    const other = await registerOwner({ email: "other@example.com", orgName: "Other" });
    expect((await request(app).get(`/api/v1/reports/${reportId}`).set(auth(other.accessToken))).status).toBe(404);
    expect((await request(app).get("/api/v1/reports/does-not-exist").set(auth(owner.accessToken))).status).toBe(404);
  });
});
