import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as orgService from "../services/org.service.js";
import { list, noContent, ok } from "../utils/respond.js";
import { addMemberSchema, removeMemberSchema, updateMemberSchema, updateOrgSchema } from "../validators/org.schema.js";

export async function getOrg(req: Request, res: Response): Promise<void> {
  ok(res, await orgService.getOrg(req.user!.orgId));
}

export async function updateOrg(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, updateOrgSchema);
  ok(res, await orgService.updateOrg(req.user!.orgId, body.name));
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const members = await orgService.listMembers(req.user!.orgId);
  list(res, members, { nextCursor: null, limit: members.length });
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, addMemberSchema);
  ok(res, await orgService.addMember(req.user!.orgId, req.user!.role, body.email, body.role));
}

export async function updateMember(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, updateMemberSchema);
  ok(res, await orgService.updateMemberRole(req.user!.orgId, req.user!.role, params.memberId, body.role));
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, removeMemberSchema);
  await orgService.removeMember(req.user!.orgId, req.user!.role, params.memberId);
  noContent(res);
}
