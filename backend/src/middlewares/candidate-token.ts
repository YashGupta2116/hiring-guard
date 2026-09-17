import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import { verifyCandidateToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

export const requireCandidateToken: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    next(new AppError("UNAUTHENTICATED", "Missing candidate token."));
    return;
  }

  let payload;
  try {
    payload = await verifyCandidateToken(token);
  } catch {
    next(new AppError("UNAUTHENTICATED", "Invalid or expired candidate token."));
    return;
  }

  const consent = await prisma.consent.findUnique({ where: { id: payload.consentId } });
  if (!consent || consent.sessionId !== payload.sid) {
    next(new AppError("UNAUTHENTICATED", "Invalid candidate token."));
    return;
  }

  req.candidateContext = { sessionId: payload.sid, consentId: payload.consentId };
  next();
};
