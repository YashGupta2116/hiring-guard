import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as questionService from "../services/question-bank.service.js";
import { created, list, noContent, ok } from "../utils/respond.js";
import {
  createQuestionSchema,
  listQuestionsSchema,
  questionIdParamSchema,
  updateQuestionSchema,
} from "../validators/question-bank.schema.js";

export async function listQuestions(req: Request, res: Response): Promise<void> {
  const { query } = getInput(req, listQuestionsSchema);
  const result = await questionService.listQuestions(req.user!.orgId, query);
  list(res, result.items, { nextCursor: result.nextCursor, limit: query.limit });
}

export async function createQuestion(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, createQuestionSchema);
  created(res, await questionService.createQuestion(req.user!.orgId, body));
}

export async function updateQuestion(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, updateQuestionSchema);
  ok(res, await questionService.updateQuestion(req.user!.orgId, params.id, body));
}

export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, questionIdParamSchema);
  await questionService.deleteQuestion(req.user!.orgId, params.id);
  noContent(res);
}
