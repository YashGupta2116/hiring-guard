import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as joinService from "../services/join.service.js";
import { ok } from "../utils/respond.js";
import { consentSchema, joinTokenParamSchema, preflightSchema } from "../validators/join.schema.js";

export async function getJoinSummary(req: Request, res: Response): Promise<void> {
  getInput(req, joinTokenParamSchema);
  ok(res, await joinService.getJoinSummary(req.joinTokenRecord!));
}

export async function preflight(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, preflightSchema);
  ok(res, await joinService.runPreflight(req.joinTokenRecord!, body));
}

export async function getPolicy(req: Request, res: Response): Promise<void> {
  getInput(req, joinTokenParamSchema);
  ok(res, await joinService.getPolicy(req.joinTokenRecord!));
}

export async function consent(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, consentSchema);
  ok(
    res,
    await joinService.submitConsent(req.joinTokenRecord!, {
      ...body,
      ip: req.ip ?? "0.0.0.0",
      userAgent: req.headers["user-agent"] ?? "unknown",
    }),
  );
}
