import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as configService from "../services/config.service.js";
import * as lifecycleService from "../services/lifecycle.service.js";
import * as sessionService from "../services/session.service.js";
import { created, list, noContent, ok } from "../utils/respond.js";
import { patchConfigSchema } from "../validators/config.schema.js";
import {
  addInterviewerSchema,
  createSessionSchema,
  listSessionsSchema,
  removeInterviewerSchema,
  sessionIdParamSchema,
  updateSessionSchema,
} from "../validators/session.schema.js";

export async function createSession(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, createSessionSchema);
  created(res, await sessionService.createSession(req.user!.orgId, req.user!.sub, body));
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const { query } = getInput(req, listSessionsSchema);
  const result = await sessionService.listSessions(req.user!.orgId, query);
  list(res, result.items, { nextCursor: result.nextCursor, limit: query.limit });
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await sessionService.getSession(req.user!.orgId, params.id));
}

export async function updateSession(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, updateSessionSchema);
  ok(res, await sessionService.updateSession(req.user!.orgId, params.id, body));
}

export async function cancelSession(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await sessionService.cancelSession(req.user!.orgId, params.id, req.user!.sub));
}

export async function startSession(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await lifecycleService.startSession(req.user!.orgId, params.id, req.user!.sub));
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await lifecycleService.endSession(req.user!.orgId, params.id, "interviewer", req.user!.sub));
}

export async function getLiveSnapshot(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await lifecycleService.getLiveSnapshot(req.user!.orgId, params.id));
}

export async function patchConfig(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, patchConfigSchema);
  ok(res, await configService.patchConfig(req.user!.orgId, params.id, req.user!.sub, body));
}

export async function addInterviewer(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, addInterviewerSchema);
  ok(res, await sessionService.addInterviewer(req.user!.orgId, params.id, body.userId));
}

export async function removeInterviewer(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, removeInterviewerSchema);
  await sessionService.removeInterviewer(req.user!.orgId, params.id, params.userId);
  noContent(res);
}
