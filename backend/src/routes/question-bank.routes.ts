import { Router } from "express";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "../controllers/question-bank.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/org-role.js";
import { validate } from "../middlewares/validate.js";
import { createQuestionSchema, listQuestionsSchema, questionIdParamSchema, updateQuestionSchema } from "../validators/question-bank.schema.js";

export const questionBankRouter = Router();

questionBankRouter.use("/question-bank", requireUser);

questionBankRouter.get("/question-bank", validate(listQuestionsSchema), listQuestions);
questionBankRouter.post("/question-bank", requireRole("OWNER", "ADMIN"), validate(createQuestionSchema), createQuestion);
questionBankRouter.patch(
  "/question-bank/:id",
  requireRole("OWNER", "ADMIN"),
  validate(updateQuestionSchema),
  updateQuestion,
);
questionBankRouter.delete(
  "/question-bank/:id",
  requireRole("OWNER", "ADMIN"),
  validate(questionIdParamSchema),
  deleteQuestion,
);
