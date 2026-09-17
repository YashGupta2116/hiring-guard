import type { RequestHandler } from "express";
import type { OrgRole } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";

/** Must run after requireUser. Checks req.user.role from the active-org access JWT. */
export function requireRole(...roles: OrgRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError("UNAUTHENTICATED", "Missing access token."));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError("FORBIDDEN", "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
