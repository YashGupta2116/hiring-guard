import { Router } from "express";
import {
  acceptSuggestion,
  addInterviewer,
  addNote,
  cancelSession,
  createSession,
  endSession,
  getEvidenceVerification,
  getFlags,
  getLiveSnapshot,
  getNotes,
  getPipelineStatus,
  getReport,
  getSession,
  getSessionCode,
  listSessions,
  patchConfig,
  recomputeReport,
  refreshSuggestions,
  removeInterviewer,
  startSession,
  updateSession,
} from "../controllers/session.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireSessionAccess } from "../middlewares/session-access.js";
import { validate } from "../middlewares/validate.js";
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
  listSessionsSchema,
  removeInterviewerSchema,
  sessionIdParamSchema,
  updateSessionSchema,
} from "../validators/session.schema.js";

export const sessionRouter = Router();

sessionRouter.use("/sessions", requireUser);

sessionRouter.post("/sessions", validate(createSessionSchema), createSession);
sessionRouter.get("/sessions", validate(listSessionsSchema), listSessions);
sessionRouter.get("/sessions/:id", validate(sessionIdParamSchema), requireSessionAccess(), getSession);
sessionRouter.patch("/sessions/:id", validate(updateSessionSchema), requireSessionAccess({ write: true }), updateSession);
sessionRouter.post("/sessions/:id/cancel", validate(sessionIdParamSchema), requireSessionAccess({ write: true }), cancelSession);
sessionRouter.patch("/sessions/:id/config", validate(patchConfigSchema), requireSessionAccess({ write: true }), patchConfig);
sessionRouter.post("/sessions/:id/start", validate(sessionIdParamSchema), requireSessionAccess({ write: true }), startSession);
sessionRouter.post("/sessions/:id/end", validate(sessionIdParamSchema), requireSessionAccess({ write: true }), endSession);
sessionRouter.get("/sessions/:id/live", validate(sessionIdParamSchema), requireSessionAccess(), getLiveSnapshot);
sessionRouter.post(
  "/sessions/:id/interviewers",
  validate(addInterviewerSchema),
  requireSessionAccess({ write: true }),
  addInterviewer,
);
sessionRouter.delete(
  "/sessions/:id/interviewers/:userId",
  validate(removeInterviewerSchema),
  requireSessionAccess({ write: true }),
  removeInterviewer,
);
sessionRouter.get("/sessions/:id/flags", validate(listFlagsSchema), requireSessionAccess(), getFlags);
sessionRouter.get("/sessions/:id/notes", validate(listNotesSchema), requireSessionAccess(), getNotes);
sessionRouter.post("/sessions/:id/notes", validate(addNoteSchema), requireSessionAccess({ write: true }), addNote);
sessionRouter.post(
  "/sessions/:id/suggestions/refresh",
  validate(suggestionsRefreshSchema),
  requireSessionAccess({ write: true }),
  refreshSuggestions,
);
sessionRouter.post(
  "/sessions/:id/suggestions/:suggestionId/accept",
  validate(acceptSuggestionSchema),
  requireSessionAccess({ write: true }),
  acceptSuggestion,
);
sessionRouter.get("/sessions/:id/code", validate(sessionIdParamSchema), requireSessionAccess(), getSessionCode);
sessionRouter.get(
  "/sessions/:id/evidence/verify",
  validate(sessionIdParamSchema),
  requireSessionAccess(),
  getEvidenceVerification,
);
sessionRouter.get("/sessions/:id/report", validate(sessionIdParamSchema), requireSessionAccess(), getReport);
sessionRouter.get("/sessions/:id/pipeline", validate(sessionIdParamSchema), requireSessionAccess(), getPipelineStatus);
sessionRouter.post(
  "/sessions/:id/report/recompute",
  validate(sessionIdParamSchema),
  requireSessionAccess(),
  recomputeReport,
);
