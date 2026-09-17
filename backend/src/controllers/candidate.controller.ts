import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as candidateService from "../services/candidate.service.js";
import * as mediaService from "../services/media.service.js";
import { ok } from "../utils/respond.js";
import { mediaReadySchema } from "../validators/candidate.schema.js";

export async function getSession(req: Request, res: Response): Promise<void> {
  ok(res, await candidateService.getCandidateSession(req.candidateContext!.sessionId));
}

export async function mediaReady(req: Request, res: Response): Promise<void> {
  getInput(req, mediaReadySchema);
  ok(res, await mediaService.markMediaReady(req.candidateContext!.sessionId));
}
