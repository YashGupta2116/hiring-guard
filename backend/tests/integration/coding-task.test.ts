import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.questionBankItem.deleteMany(),
    prisma.sessionCodingTask.deleteMany(),
    prisma.codingTask.deleteMany(),
    prisma.interviewSession.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.orgMember.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
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

function taskPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Two Sum",
    statement: "Return indices of the two numbers that add up to target.",
    difficulty: "EASY",
    languages: ["javascript"],
    visibleTests: [{ input: "[2,7,11,15], 9", expectedOutput: "[0,1]" }],
    hiddenTests: [{ input: "[3,3], 6", expectedOutput: "[0,1]" }],
    timeLimitMs: 5000,
    ...overrides,
  };
}

describe("coding tasks", () => {
  it("OWNER can create a task; hiddenTests are excluded from the list view", async () => {
    const owner = await registerOwner();
    const create = await request(app)
      .post("/api/v1/coding-tasks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(taskPayload());
    expect(create.status).toBe(201);
    expect(create.body.data.hiddenTests).toBeDefined();

    const list = await request(app).get("/api/v1/coding-tasks").set("Authorization", `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].hiddenTests).toBeUndefined();
  });

  it("blocks an INTERVIEWER from creating a task but allows read", async () => {
    const owner = await registerOwner();
    const interviewer = await registerOwner({ email: "interviewer@example.com", orgName: "Interviewer Org" });
    await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "interviewer@example.com", role: "INTERVIEWER" });
    const switched = await request(app)
      .post("/api/v1/auth/switch-org")
      .set("Authorization", `Bearer ${interviewer.accessToken}`)
      .send({ orgId: owner.orgId });
    const bearer = `Bearer ${switched.body.data.accessToken}`;

    const forbidden = await request(app).post("/api/v1/coding-tasks").set("Authorization", bearer).send(taskPayload());
    expect(forbidden.status).toBe(403);

    const created = await request(app).post("/api/v1/coding-tasks").set("Authorization", `Bearer ${owner.accessToken}`).send(taskPayload());
    const single = await request(app).get(`/api/v1/coding-tasks/${created.body.data.id}`).set("Authorization", bearer);
    expect(single.status).toBe(200);
    expect(single.body.data.hiddenTests).toBeUndefined();

    const singleAsOwner = await request(app)
      .get(`/api/v1/coding-tasks/${created.body.data.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(singleAsOwner.body.data.hiddenTests).toBeDefined();
  });

  it("refuses to delete a task attached to a session", async () => {
    const owner = await registerOwner();
    const created = await request(app).post("/api/v1/coding-tasks").set("Authorization", `Bearer ${owner.accessToken}`).send(taskPayload());
    const session = await request(app).post("/api/v1/sessions").set("Authorization", `Bearer ${owner.accessToken}`).send({ mode: "DIRECT_LINK" });

    await request(app)
      .patch(`/api/v1/sessions/${session.body.data.id}/config`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ taskIds: [created.body.data.id] });

    const del = await request(app).delete(`/api/v1/coding-tasks/${created.body.data.id}`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(409);
  });
});

describe("question bank", () => {
  it("creates and filters by topic and difficulty", async () => {
    const owner = await registerOwner();
    await request(app)
      .post("/api/v1/question-bank")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ text: "Explain CAP theorem.", topic: "System design", skills: ["distributed systems"], difficulty: "HARD" });
    await request(app)
      .post("/api/v1/question-bank")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ text: "What is a closure?", topic: "Language fundamentals", skills: ["javascript"], difficulty: "EASY" });

    const filtered = await request(app)
      .get("/api/v1/question-bank")
      .query({ topic: "System design" })
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].topic).toBe("System design");
  });

  it("blocks an INTERVIEWER from deleting a question", async () => {
    const owner = await registerOwner();
    const interviewer = await registerOwner({ email: "interviewer2@example.com", orgName: "Interviewer Org 2" });
    await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "interviewer2@example.com", role: "INTERVIEWER" });
    const switched = await request(app)
      .post("/api/v1/auth/switch-org")
      .set("Authorization", `Bearer ${interviewer.accessToken}`)
      .send({ orgId: owner.orgId });

    const created = await request(app)
      .post("/api/v1/question-bank")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ text: "Explain indexes.", topic: "Databases", skills: ["sql"], difficulty: "MEDIUM" });

    const res = await request(app)
      .delete(`/api/v1/question-bank/${created.body.data.id}`)
      .set("Authorization", `Bearer ${switched.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });
});
