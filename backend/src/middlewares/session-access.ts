import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

const PRIVILEGED_READ_ROLES = new Set(["OWNER", "ADMIN", "REVIEWER"]);
const PRIVILEGED_WRITE_ROLES = new Set(["OWNER", "ADMIN"]);

/**
 * Must run after requireUser. Loads `req.params.id` scoped to the caller's org (never leaks
 * cross-org existence: unknown or foreign session both 404) and checks the caller is either an
 * org-level OWNER/ADMIN (writes) or OWNER/ADMIN/REVIEWER (reads), or an interviewer bound to the
 * session via `session_interviewers`.
 */
export function requireSessionAccess(opts: { write?: boolean } = {}): RequestHandler {
  return async (req, _res, next) => {
    try {
      const sessionId = req.params.id as string;
      const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId: req.user!.orgId } });
      if (!session) {
        next(new AppError("NOT_FOUND", "Session not found."));
        return;
      }

      const privilegedRoles = opts.write ? PRIVILEGED_WRITE_ROLES : PRIVILEGED_READ_ROLES;
      if (!privilegedRoles.has(req.user!.role)) {
        const bound = await prisma.sessionInterviewer.findUnique({
          where: { sessionId_userId: { sessionId, userId: req.user!.sub } },
        });
        if (!bound) {
          next(new AppError("FORBIDDEN", "You are not assigned to this session."));
          return;
        }
      }

      req.sessionRecord = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}
