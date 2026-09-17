import "express";
import type { InterviewSession } from "../generated/prisma/client.js";
import type { AccessTokenPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by middlewares/request-id.ts on every request. */
      requestId: string;
      /** Parsed output of middlewares/validate.ts. Read it with `getInput(req, schemas)`. */
      input?: { body?: unknown; query?: unknown; params?: unknown };
      /** Set by middlewares/auth.ts (requireUser) from the access JWT. */
      user?: AccessTokenPayload;
      /** Set by middlewares/session-access.ts (requireSessionAccess). */
      sessionRecord?: InterviewSession;
    }
  }
}
