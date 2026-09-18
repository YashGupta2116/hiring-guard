import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";

const app = createApp();

async function resetDb(): Promise<void> {
  await prisma.$transaction([
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

function registerPayload(overrides: Partial<Record<string, string>> = {}) {
  return {
    name: "Asha Rao",
    email: "asha@example.com",
    password: "correct-horse-battery",
    orgName: "Acme Interviews",
    ...overrides,
  };
}

describe("POST /auth/register", () => {
  it("creates a user, org and OWNER membership, returns access token and sets the refresh cookie", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(registerPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("asha@example.com");
    expect(res.body.data.org.name).toBe("Acme Interviews");
    expect(typeof res.body.data.accessToken).toBe("string");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("vt_rt="))).toBe(true);

    const membership = await prisma.orgMember.findFirstOrThrow({ where: { user: { email: "asha@example.com" } } });
    expect(membership.role).toBe("OWNER");
  });

  it("rejects a duplicate email with CONFLICT", async () => {
    await request(app).post("/api/v1/auth/register").send(registerPayload());
    const res = await request(app).post("/api/v1/auth/register").send(registerPayload({ orgName: "Other Org" }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a short password with VALIDATION_FAILED", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(registerPayload({ password: "short" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/v1/auth/register").send(registerPayload());
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "asha@example.com", password: "correct-horse-battery" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("asha@example.com");
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.activeOrgId).toBe("string");
  });

  it("rejects wrong password with INVALID_CREDENTIALS", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "asha@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects unknown email with INVALID_CREDENTIALS (no user enumeration)", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "whatever12345" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /auth/me", () => {
  it("returns memberships for the authenticated user", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const accessToken = register.body.data.accessToken as string;

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.memberships).toHaveLength(1);
    expect(res.body.data.memberships[0].role).toBe("OWNER");
  });

  it("rejects a missing token with UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("PATCH /auth/me", () => {
  it("updates the caller's own display name and leaves the email alone", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const accessToken = register.body.data.accessToken as string;

    const res = await request(app).patch("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`).send({ name: "  Asha R. Rao  ", email: "hijack@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Asha R. Rao", email: "asha@example.com" });

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.body.data.user.name).toBe("Asha R. Rao");
  });

  it("rejects an empty name and an unauthenticated call", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const accessToken = register.body.data.accessToken as string;

    const empty = await request(app).patch("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`).send({ name: "   " });
    expect(empty.status).toBe(400);
    await request(app).patch("/api/v1/auth/me").send({ name: "X" }).expect(401);
  });
});

describe("refresh token rotation and reuse detection", () => {
  it("rotates the refresh cookie on every /auth/refresh call", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const firstCookie = (register.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("vt_rt="))!;

    const refreshed = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.data.accessToken).toBe("string");
    const secondCookie = (refreshed.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("vt_rt="))!;
    expect(secondCookie).not.toBe(firstCookie);
  });

  it("revokes the whole family and rejects further use when a rotated token is reused", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const firstCookie = (register.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("vt_rt="))!;

    const refreshed = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    const secondCookie = (refreshed.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("vt_rt="))!;

    // Reusing the already-rotated first token must fail and revoke the family.
    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // The second (legitimately rotated) token is now revoked too, since it's in the same family.
    const afterReuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", secondCookie);
    expect(afterReuse.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const register = await request(app).post("/api/v1/auth/register").send(registerPayload());
    const cookie = (register.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("vt_rt="))!;

    const logout = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});

describe("role guard and org isolation", () => {
  async function registerAndLogin(overrides: Partial<Record<string, string>>) {
    const res = await request(app).post("/api/v1/auth/register").send(registerPayload(overrides));
    return { accessToken: res.body.data.accessToken as string, orgId: res.body.data.org.id as string };
  }

  it("blocks an INTERVIEWER from adding org members", async () => {
    const owner = await registerAndLogin({ email: "owner@example.com" });
    const ravi = await request(app)
      .post("/api/v1/auth/register")
      .send(registerPayload({ email: "ravi@example.com", orgName: "Ravi's Solo Org" }));

    await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "ravi@example.com", role: "INTERVIEWER" })
      .expect(200);

    // Ravi's access token still points at his own org (OWNER there); switch to owner's org where he is INTERVIEWER.
    const raviInOwnerOrg = await request(app)
      .post("/api/v1/auth/switch-org")
      .set("Authorization", `Bearer ${ravi.body.data.accessToken}`)
      .send({ orgId: owner.orgId });

    const forbidden = await request(app)
      .post("/api/v1/org/members")
      .set("Authorization", `Bearer ${raviInOwnerOrg.body.data.accessToken}`)
      .send({ email: "someone-else@example.com", role: "ADMIN" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
  });

  it("never lets a user from org A read org B's data", async () => {
    const orgA = await registerAndLogin({ email: "a-owner@example.com", orgName: "Org A" });
    await registerAndLogin({ email: "b-owner@example.com", orgName: "Org B" });

    const candidate = await prisma.candidate.create({ data: { orgId: orgA.orgId, email: "candidate@example.com" } });

    const orgB = await request(app).post("/api/v1/auth/login").send({ email: "b-owner@example.com", password: "correct-horse-battery" });

    const res = await request(app)
      .get(`/api/v1/candidates/${candidate.id}`)
      .set("Authorization", `Bearer ${orgB.body.data.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("cannot remove or demote the last owner", async () => {
    const owner = await registerAndLogin({ email: "solo-owner@example.com" });
    const membership = await prisma.orgMember.findFirstOrThrow({ where: { orgId: owner.orgId } });

    const res = await request(app)
      .delete(`/api/v1/org/members/${membership.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_OWNER");
  });

  it("only an owner can grant, change or remove the owner role", async () => {
    const owner = await registerAndLogin({ email: "boss@example.com" });
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

    // An admin in the owner's org.
    const adminReg = await request(app).post("/api/v1/auth/register").send(registerPayload({ email: "admin@example.com", orgName: "Admin Solo Org" }));
    await request(app).post("/api/v1/org/members").set(bearer(owner.accessToken)).send({ email: "admin@example.com", role: "ADMIN" }).expect(200);
    const adminToken = (await request(app).post("/api/v1/auth/switch-org").set(bearer(adminReg.body.data.accessToken)).send({ orgId: owner.orgId })).body.data.accessToken as string;

    // Cannot add an owner, and cannot promote themselves.
    const otherReg = await request(app).post("/api/v1/auth/register").send(registerPayload({ email: "other@example.com", orgName: "Other Org" }));
    expect(otherReg.status).toBe(201);
    const addOwner = await request(app).post("/api/v1/org/members").set(bearer(adminToken)).send({ email: "other@example.com", role: "OWNER" });
    expect(addOwner.status).toBe(403);

    const adminMember = await prisma.orgMember.findFirstOrThrow({ where: { orgId: owner.orgId, user: { email: "admin@example.com" } } });
    const selfPromote = await request(app).patch(`/api/v1/org/members/${adminMember.id}`).set(bearer(adminToken)).send({ role: "OWNER" });
    expect(selfPromote.status).toBe(403);

    // Cannot touch the existing owner.
    const ownerMember = await prisma.orgMember.findFirstOrThrow({ where: { orgId: owner.orgId, user: { email: "boss@example.com" } } });
    await request(app).patch(`/api/v1/org/members/${ownerMember.id}`).set(bearer(adminToken)).send({ role: "ADMIN" }).expect(403);
    await request(app).delete(`/api/v1/org/members/${ownerMember.id}`).set(bearer(adminToken)).expect(403);

    // The owner still can, and admins can manage non-owners.
    await request(app).post("/api/v1/org/members").set(bearer(owner.accessToken)).send({ email: "other@example.com", role: "OWNER" }).expect(200);
    await request(app).patch(`/api/v1/org/members/${adminMember.id}`).set(bearer(owner.accessToken)).send({ role: "REVIEWER" }).expect(200);
  });

  it("rejects adding someone who is already a member", async () => {
    const owner = await registerAndLogin({ email: "dup-owner@example.com" });
    const res = await request(app).post("/api/v1/org/members").set("Authorization", `Bearer ${owner.accessToken}`).send({ email: "dup-owner@example.com", role: "INTERVIEWER" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});
