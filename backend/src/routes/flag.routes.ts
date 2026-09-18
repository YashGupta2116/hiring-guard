import { Router } from "express";
import { adjudicateFlag } from "../controllers/flag.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { adjudicateFlagSchema } from "../validators/live.schema.js";

export const flagRouter = Router();

flagRouter.use("/flags", requireUser);

flagRouter.post("/flags/:flagId/adjudicate", validate(adjudicateFlagSchema), adjudicateFlag);
