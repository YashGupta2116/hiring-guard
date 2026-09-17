import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as linkService from "../services/link.service.js";
import { created, list, noContent, ok } from "../utils/respond.js";
import { createLinkSchema, listLinksSchema, revokeLinkSchema } from "../validators/link.schema.js";

export async function createLink(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, createLinkSchema);
  created(res, await linkService.createLink(req.user!.orgId, params.id, req.user!.sub, body));
}

export async function listLinks(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, listLinksSchema);
  const items = await linkService.listLinks(req.user!.orgId, params.id);
  list(res, items, { nextCursor: null, limit: items.length });
}

export async function revokeLink(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, revokeLinkSchema);
  await linkService.revokeLink(req.user!.orgId, params.id, params.linkId, req.user!.sub);
  noContent(res);
}
