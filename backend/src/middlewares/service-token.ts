import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { safeEqualHex, sha256Hex } from "../utils/hash.js";

/** Static service token for CV/ASR producers (Architecture.md §8). Constant-time compare via hashing first. */
export const requireServiceToken: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token || !safeEqualHex(sha256Hex(token), sha256Hex(env.INTERNAL_SERVICE_TOKEN))) {
    next(new AppError("UNAUTHENTICATED", "Invalid service token."));
    return;
  }
  next();
};
