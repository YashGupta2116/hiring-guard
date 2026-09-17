import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/jwt.js";

/** Verifies the access JWT from `Authorization: Bearer <token>` and sets req.user. */
export const requireUser: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new AppError("UNAUTHENTICATED", "Missing access token."));
    return;
  }

  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    next(new AppError("UNAUTHENTICATED", "Invalid or expired access token."));
  }
};
