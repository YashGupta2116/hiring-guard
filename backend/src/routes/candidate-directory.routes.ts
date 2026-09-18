import { Router } from "express";
import {
  createCandidate,
  getCandidate,
  getCandidateSummary,
  listCandidates,
  updateCandidate,
} from "../controllers/candidate-directory.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/org-role.js";
import { validate } from "../middlewares/validate.js";
import {
  createCandidateSchema,
  getCandidateSchema,
  listCandidatesSchema,
  updateCandidateSchema,
} from "../validators/candidate-directory.schema.js";

export const candidateDirectoryRouter = Router();

candidateDirectoryRouter.use("/candidates", requireUser);

// REVIEWER is read-only everywhere else in the product; the directory follows the same rule.
const canWrite = requireRole("OWNER", "ADMIN", "INTERVIEWER");

candidateDirectoryRouter.get("/candidates", validate(listCandidatesSchema), listCandidates);
// Registered before /:id so "summary" is not read as a candidate id.
candidateDirectoryRouter.get("/candidates/summary", getCandidateSummary);
candidateDirectoryRouter.post("/candidates", canWrite, validate(createCandidateSchema), createCandidate);
candidateDirectoryRouter.get("/candidates/:id", validate(getCandidateSchema), getCandidate);
candidateDirectoryRouter.patch("/candidates/:id", canWrite, validate(updateCandidateSchema), updateCandidate);
