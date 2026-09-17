import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";
import type { OrgRole } from "../generated/prisma/enums.js";

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
