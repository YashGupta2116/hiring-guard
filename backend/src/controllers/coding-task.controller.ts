import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as codingTaskService from "../services/coding-task.service.js";
import { created, list, noContent, ok } from "../utils/respond.js";
import {
  codingTaskIdParamSchema,
  createCodingTaskSchema,
  listCodingTasksSchema,
  updateCodingTaskSchema,
} from "../validators/coding-task.schema.js";

const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

export async function listCodingTasks(req: Request, res: Response): Promise<void> {
  const { query } = getInput(req, listCodingTasksSchema);
  const result = await codingTaskService.listCodingTasks(req.user!.orgId, query);
  list(res, result.items, { nextCursor: result.nextCursor, limit: query.limit });
}

export async function getCodingTask(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, codingTaskIdParamSchema);
  const includeHidden = ADMIN_ROLES.has(req.user!.role);
  ok(res, await codingTaskService.getCodingTask(req.user!.orgId, params.id, includeHidden));
}

export async function createCodingTask(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, createCodingTaskSchema);
  created(res, await codingTaskService.createCodingTask(req.user!.orgId, body));
}

export async function updateCodingTask(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, updateCodingTaskSchema);
  ok(res, await codingTaskService.updateCodingTask(req.user!.orgId, params.id, body));
}

export async function deleteCodingTask(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, codingTaskIdParamSchema);
  await codingTaskService.deleteCodingTask(req.user!.orgId, params.id);
  noContent(res);
}
