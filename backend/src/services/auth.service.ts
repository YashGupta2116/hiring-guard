import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { env } from "../config/env.js";
import type { OrgRole } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { sha256Hex } from "../utils/hash.js";
import { signAccessToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";

const REFRESH_TTL_MS = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

export type AuthenticatedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type RegisterInput = { name: string; email: string; password: string; orgName: string };
export type LoginInput = { email: string; password: string };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "org"}-${randomBytes(3).toString("hex")}`;
}

function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

async function issueTokens(userId: string, orgId: string, role: OrgRole, familyId?: string): Promise<AuthenticatedTokens> {
  const accessToken = await signAccessToken({ sub: userId, orgId, role });
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      userId,
      familyId: familyId ?? randomBytes(16).toString("hex"),
      tokenHash: sha256Hex(refreshToken),
      expiresAt,
    },
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
}

export async function register(input: RegisterInput): Promise<{
  user: { id: string; name: string; email: string };
  org: { id: string; name: string };
  tokens: AuthenticatedTokens;
}> {
  const passwordHash = await argon2.hash(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: input.orgName, slug: slugify(input.orgName) } });
    const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
    await tx.orgMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
    return { org, user };
  });

  await log({
    orgId: result.org.id,
    actorType: "USER",
    actorId: result.user.id,
    action: "auth.registered",
    metadata: { email: result.user.email },
  });

  const tokens = await issueTokens(result.user.id, result.org.id, "OWNER");

  return {
    user: { id: result.user.id, name: result.user.name, email: result.user.email },
    org: { id: result.org.id, name: result.org.name },
    tokens,
  };
}

export async function login(input: LoginInput): Promise<{
  user: { id: string; name: string; email: string };
  activeOrgId: string | null;
  tokens: AuthenticatedTokens;
}> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const validPassword = await argon2.verify(user.passwordHash, input.password);
  if (!validPassword) {
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    throw new AppError("FORBIDDEN", "User has no organisation membership.");
  }

  await log({ orgId: membership.orgId, actorType: "USER", actorId: user.id, action: "auth.logged_in" });

  const tokens = await issueTokens(user.id, membership.orgId, membership.role);

  return {
    user: { id: user.id, name: user.name, email: user.email },
    activeOrgId: membership.orgId,
    tokens,
  };
}

export async function refresh(rawToken: string): Promise<AuthenticatedTokens> {
  const tokenHash = sha256Hex(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new AppError("UNAUTHENTICATED", "Invalid refresh token.");
  }

  if (existing.revokedAt || existing.expiresAt < new Date()) {
    // Reuse of an already-rotated (or expired) token: revoke the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError("REFRESH_TOKEN_REUSED", "Refresh token has already been used. Please log in again.");
  }

  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: existing.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    throw new AppError("UNAUTHENTICATED", "User has no organisation membership.");
  }

  return issueTokens(existing.userId, membership.orgId, membership.role, existing.familyId);
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function getMe(userId: string): Promise<{
  user: { id: string; name: string; email: string };
  memberships: { orgId: string; orgName: string; role: OrgRole }[];
  activeOrgId: string | null;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "User no longer exists.");
  }

  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email },
    memberships: memberships.map((m) => ({ orgId: m.orgId, orgName: m.org.name, role: m.role })),
    activeOrgId: memberships[0]?.orgId ?? null,
  };
}

/** Updates the caller's own display name. The email is the login identity and is not editable here. */
export async function updateProfile(userId: string, orgId: string, name: string): Promise<{ id: string; name: string; email: string }> {
  const user = await prisma.user.update({ where: { id: userId }, data: { name } });
  await log({ orgId, actorType: "USER", actorId: userId, action: "auth.profile_updated" });
  return { id: user.id, name: user.name, email: user.email };
}

export async function switchOrg(userId: string, orgId: string): Promise<{ accessToken: string }> {
  const membership = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (!membership) {
    throw new AppError("FORBIDDEN", "You are not a member of this organisation.");
  }
  const accessToken = await signAccessToken({ sub: userId, orgId: membership.orgId, role: membership.role });
  return { accessToken };
}
