import { Router } from "express";
import {
  createCodingTask,
  deleteCodingTask,
  getCodingTask,
  listCodingTasks,
  updateCodingTask,
} from "../controllers/coding-task.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/org-role.js";
import { validate } from "../middlewares/validate.js";
import {
  codingTaskIdParamSchema,
  createCodingTaskSchema,
  listCodingTasksSchema,
  updateCodingTaskSchema,
} from "../validators/coding-task.schema.js";

export const codingTaskRouter = Router();

codingTaskRouter.use("/coding-tasks", requireUser);

codingTaskRouter.get("/coding-tasks", validate(listCodingTasksSchema), listCodingTasks);
codingTaskRouter.post("/coding-tasks", requireRole("OWNER", "ADMIN"), validate(createCodingTaskSchema), createCodingTask);
codingTaskRouter.get("/coding-tasks/:id", validate(codingTaskIdParamSchema), getCodingTask);
codingTaskRouter.patch(
  "/coding-tasks/:id",
  requireRole("OWNER", "ADMIN"),
  validate(updateCodingTaskSchema),
  updateCodingTask,
);
codingTaskRouter.delete(
  "/coding-tasks/:id",
  requireRole("OWNER", "ADMIN"),
  validate(codingTaskIdParamSchema),
  deleteCodingTask,
);
