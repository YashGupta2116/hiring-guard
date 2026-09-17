import { Router } from "express";
import { consent, getJoinSummary, getPolicy, preflight } from "../controllers/join.controller.js";
import { requireJoinToken } from "../middlewares/join-token.js";
import { createRateLimiter } from "../middlewares/rate-limit.js";
import { validate } from "../middlewares/validate.js";
import { consentSchema, joinTokenParamSchema, preflightSchema } from "../validators/join.schema.js";
import { isTest } from "../config/env.js";

export const joinRouter = Router();

const joinLimiter = createRateLimiter({ name: "join", windowMs: 60_000, limit: isTest ? 1_000 : 30 });

joinRouter.use("/join", joinLimiter);

joinRouter.get("/join/:token", validate(joinTokenParamSchema), requireJoinToken, getJoinSummary);
joinRouter.post("/join/:token/preflight", validate(preflightSchema), requireJoinToken, preflight);
joinRouter.get("/join/:token/policy", validate(joinTokenParamSchema), requireJoinToken, getPolicy);
joinRouter.post("/join/:token/consent", validate(consentSchema), requireJoinToken, consent);
