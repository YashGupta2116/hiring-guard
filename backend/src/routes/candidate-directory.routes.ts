import { Router } from "express";
import { createCandidate, getCandidate, listCandidates } from "../controllers/candidate-directory.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { createCandidateSchema, getCandidateSchema, listCandidatesSchema } from "../validators/candidate-directory.schema.js";

export const candidateDirectoryRouter = Router();

candidateDirectoryRouter.use("/candidates", requireUser);

candidateDirectoryRouter.get("/candidates", validate(listCandidatesSchema), listCandidates);
candidateDirectoryRouter.post("/candidates", validate(createCandidateSchema), createCandidate);
candidateDirectoryRouter.get("/candidates/:id", validate(getCandidateSchema), getCandidate);
