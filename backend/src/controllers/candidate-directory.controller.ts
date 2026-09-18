import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as candidateService from "../services/candidate-directory.service.js";
import { created, list, ok } from "../utils/respond.js";
import {
  createCandidateSchema,
  getCandidateSchema,
  listCandidatesSchema,
  updateCandidateSchema,
} from "../validators/candidate-directory.schema.js";

export async function listCandidates(req: Request, res: Response): Promise<void> {
  const { query } = getInput(req, listCandidatesSchema);
  const result = await candidateService.listCandidates(req.user!.orgId, query);
  list(res, result.items, { nextCursor: result.nextCursor, limit: query.limit });
}

export async function getCandidateSummary(req: Request, res: Response): Promise<void> {
  ok(res, await candidateService.getCandidateSummary(req.user!.orgId));
}

export async function createCandidate(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, createCandidateSchema);
  created(res, await candidateService.createCandidate(req.user!.orgId, req.user!.sub, body));
}

export async function getCandidate(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, getCandidateSchema);
  ok(res, await candidateService.getCandidate(req.user!.orgId, params.id));
}

export async function updateCandidate(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, updateCandidateSchema);
  ok(res, await candidateService.updateCandidate(req.user!.orgId, req.user!.sub, params.id, body));
}
