import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import { verifyJoinToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

/**
 * Verifies the join JWT's signature, then re-checks live state from `join_tokens` on every call
 * (Rules.md §9: "verify signature and DB state ... on every call"). The JWT carries no expiry —
 * revocation, consumption and expiry are all DB-driven so they take effect immediately.
 */
export const requireJoinToken: RequestHandler = async (req, _res, next) => {
  const rawToken = req.params.token as string;

  let payload;
  try {
    payload = await verifyJoinToken(rawToken);
  } catch {
    next(new AppError("UNAUTHENTICATED", "Invalid join link."));
    return;
  }

  const record = await prisma.joinToken.findUnique({ where: { jti: payload.jti } });
  if (!record || record.sessionId !== payload.sid) {
    next(new AppError("UNAUTHENTICATED", "Invalid join link."));
    return;
  }
  if (record.revokedAt) {
    next(new AppError("LINK_REVOKED", "This interview link has been revoked."));
    return;
  }
  if (record.kind === "ONE_TIME" && record.usedAt) {
    next(new AppError("LINK_CONSUMED", "This interview link has already been used."));
    return;
  }
  if (record.expiresAt < new Date()) {
    next(new AppError("LINK_EXPIRED", "This interview link has expired."));
    return;
  }

  req.joinTokenRecord = record;
  next();
};
