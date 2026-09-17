import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as jdService from "../services/jd.service.js";
import { accepted, ok } from "../utils/respond.js";
import { jdSessionParamSchema, jdTextBodySchema, patchJdSchema } from "../validators/jd.schema.js";
import { sessionIdParamSchema } from "../validators/session.schema.js";

export async function uploadJd(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  const text = req.file ? undefined : jdTextBodySchema.body.parse(req.body ?? {}).text;

  const result = await jdService.uploadJd(req.user!.orgId, params.id, req.user!.sub, {
    file: req.file,
    text,
  });
  accepted(res, result);
}

export async function getJd(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, jdSessionParamSchema);
  ok(res, await jdService.getJd(req.user!.orgId, params.id));
}

export async function patchJd(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, patchJdSchema);
  ok(res, await jdService.patchJd(req.user!.orgId, params.id, body.parsed));
}

export async function reparseJd(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, sessionIdParamSchema);
  accepted(res, await jdService.reparseJd(req.user!.orgId, params.id, req.user!.sub));
}
