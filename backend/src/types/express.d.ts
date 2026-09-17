import "express";

declare global {
  namespace Express {
    interface Request {
      /** Set by middlewares/request-id.ts on every request. */
      requestId: string;
      /** Parsed output of middlewares/validate.ts. Read it with `getInput(req, schemas)`. */
      input?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}
