import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as auditService from "../services/audit.service.js";
import * as codingService from "../services/coding.service.js";
import * as configService from "../services/config.service.js";
import * as evidenceService from "../services/evidence.service.js";
import * as flagService from "../services/flag.service.js";
import * as lifecycleService from "../services/lifecycle.service.js";
import * as noteService from "../services/note.service.js";
import * as reportService from "../services/report.service.js";
import * as sessionService from "../services/session.service.js";
import * as suggestionService from "../services/suggestion.service.js";
import { accepted, created, list, noContent, ok } from "../utils/respond.js";
import { patchConfigSchema } from "../validators/config.schema.js";
import {
  acceptSuggestionSchema,
  addNoteSchema,
  listFlagsSchema,
  listNotesSchema,
  suggestionsRefreshSchema,
} from "../validators/live.schema.js";
import {
  addInterviewerSchema,
  createSessionSchema,
  listAuditLogSchema,
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

export async function getFlags(req: Request, res: Response): Promise<void> {
  const { params, query } = getInput(req, listFlagsSchema);
  ok(res, await flagService.listFlags(req.user!.orgId, params.id, query));
}

export async function getNotes(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, listNotesSchema);
  ok(res, await noteService.listNotes(params.id));
}

export async function addNote(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, addNoteSchema);
  created(res, await noteService.addNote(params.id, req.user!.sub, body.body));
}

export async function refreshSuggestions(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, suggestionsRefreshSchema);
  accepted(res, await suggestionService.refreshSuggestions(req.user!.orgId, params.id));
}

export async function acceptSuggestion(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, acceptSuggestionSchema);
  ok(res, await suggestionService.acceptSuggestion(req.user!.orgId, params.id, params.suggestionId, req.user!.sub));
}

export async function getSessionCode(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await codingService.getSessionCode(req.user!.orgId, params.id));
}

export async function getReport(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await reportService.getReport(req.user!.orgId, params.id));
}

export async function getPipelineStatus(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await reportService.getPipelineStatus(req.user!.orgId, params.id));
}

export async function recomputeReport(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  accepted(res, await reportService.recomputeReport(req.user!.orgId, params.id));
}

export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const { params, query } = getInput(req, listAuditLogSchema);
  const result = await auditService.listForSession(req.user!.orgId, params.id, query);
  list(res, result.items, { nextCursor: result.nextCursor, limit: query.limit });
}

export async function getEvidenceVerification(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  ok(res, await evidenceService.verifySession(req.user!.orgId, params.id));
}
