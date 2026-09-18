import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as flagService from "../services/flag.service.js";
import { ok } from "../utils/respond.js";
import { adjudicateFlagSchema } from "../validators/live.schema.js";

export async function adjudicateFlag(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, adjudicateFlagSchema);
  ok(res, await flagService.adjudicateFlag(req.user!.orgId, params.flagId, req.user!.sub, req.user!.role, body));
}
