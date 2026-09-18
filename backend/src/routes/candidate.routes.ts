import type { Request } from "express";
import { Router } from "express";
import { getSession, getTasks, mediaReady, runTask, submitTask } from "../controllers/candidate.controller.js";
import { requireCandidateToken } from "../middlewares/candidate-token.js";
import { createRateLimiter } from "../middlewares/rate-limit.js";
import { validate } from "../middlewares/validate.js";
import { CODE_RUN_RATE_LIMIT_MS } from "../config/constants.js";
import { mediaReadySchema } from "../validators/candidate.schema.js";
import { runTaskSchema, submitTaskSchema } from "../validators/coding.schema.js";

export const candidateRouter = Router();

candidateRouter.use("/candidate", requireCandidateToken);

const runTaskLimiter = createRateLimiter({
  name: "code-run",
  windowMs: CODE_RUN_RATE_LIMIT_MS,
  limit: 1,
  keyGenerator: (req: Request) => `${req.candidateContext!.sessionId}:${req.params.taskId}`,
});

candidateRouter.get("/candidate/session", getSession);
candidateRouter.post("/candidate/media-ready", validate(mediaReadySchema), mediaReady);
candidateRouter.get("/candidate/tasks", getTasks);
candidateRouter.post("/candidate/tasks/:taskId/run", validate(runTaskSchema), runTaskLimiter, runTask);
candidateRouter.post("/candidate/tasks/:taskId/submit", validate(submitTaskSchema), submitTask);
