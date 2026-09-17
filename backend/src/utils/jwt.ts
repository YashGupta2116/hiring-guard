import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";
import type { JoinLinkKind, OrgRole } from "../generated/prisma/enums.js";

const ACCESS_TOKEN_TTL = "15m";

export type AccessTokenPayload = {
  sub: string;
  orgId: string;
  role: OrgRole;
};

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ orgId: payload.orgId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret());
  return {
    sub: payload.sub as string,
    orgId: payload.orgId as string,
    role: payload.role as OrgRole,
  };
}

export type JoinTokenPayload = { jti: string; sid: string; kind: JoinLinkKind };

function joinSecret(): Uint8Array {
  return new TextEncoder().encode(env.JOIN_TOKEN_SECRET);
}

/**
 * No expiry claim on purpose: expiry, revocation and one-time consumption are enforced from
 * `join_tokens` in the database on every request (middlewares/join-token.ts), not from the JWT itself.
 */
export async function signJoinToken(payload: JoinTokenPayload): Promise<string> {
  return new SignJWT({ sid: payload.sid, kind: payload.kind })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(payload.jti)
    .setIssuedAt()
    .sign(joinSecret());
}

export async function verifyJoinToken(token: string): Promise<JoinTokenPayload> {
  const { payload } = await jwtVerify(token, joinSecret());
  return {
    jti: payload.jti as string,
    sid: payload.sid as string,
    kind: payload.kind as JoinLinkKind,
  };
}

export type CandidateTokenPayload = { sid: string; consentId: string };

function candidateSecret(): Uint8Array {
  return new TextEncoder().encode(env.CANDIDATE_TOKEN_SECRET);
}

export async function signCandidateToken(payload: CandidateTokenPayload, ttlSeconds: number): Promise<string> {
  return new SignJWT({ sid: payload.sid, consentId: payload.consentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .setAudience("candidate")
    .sign(candidateSecret());
}

export async function verifyCandidateToken(token: string): Promise<CandidateTokenPayload> {
  const { payload } = await jwtVerify(token, candidateSecret(), { audience: "candidate" });
  return {
    sid: payload.sid as string,
    consentId: payload.consentId as string,
  };
}
