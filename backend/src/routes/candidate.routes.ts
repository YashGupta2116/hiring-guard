import { Router } from "express";
import { getSession, mediaReady } from "../controllers/candidate.controller.js";
import { requireCandidateToken } from "../middlewares/candidate-token.js";
import { validate } from "../middlewares/validate.js";
import { mediaReadySchema } from "../validators/candidate.schema.js";

export const candidateRouter = Router();

candidateRouter.use("/candidate", requireCandidateToken);

candidateRouter.get("/candidate/session", getSession);
candidateRouter.post("/candidate/media-ready", validate(mediaReadySchema), mediaReady);
