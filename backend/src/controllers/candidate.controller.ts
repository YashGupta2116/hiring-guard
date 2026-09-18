import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as candidateService from "../services/candidate.service.js";
import * as codingService from "../services/coding.service.js";
import * as mediaService from "../services/media.service.js";
import { created, ok } from "../utils/respond.js";
import { mediaReadySchema } from "../validators/candidate.schema.js";
import { runTaskSchema, submitTaskSchema } from "../validators/coding.schema.js";

export async function getSession(req: Request, res: Response): Promise<void> {
  ok(res, await candidateService.getCandidateSession(req.candidateContext!.sessionId));
}

export async function mediaReady(req: Request, res: Response): Promise<void> {
  getInput(req, mediaReadySchema);
  ok(res, await mediaService.markMediaReady(req.candidateContext!.sessionId));
}

export async function getTasks(req: Request, res: Response): Promise<void> {
  ok(res, await codingService.getCandidateTasks(req.candidateContext!.sessionId));
}

export async function runTask(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, runTaskSchema);
  created(res, await codingService.runTask(req.candidateContext!.sessionId, params.taskId, body));
}

export async function submitTask(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, submitTaskSchema);
  ok(res, await codingService.submitTask(req.candidateContext!.sessionId, params.taskId, body));
}
