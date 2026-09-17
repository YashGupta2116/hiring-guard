import { Router } from "express";
import { getJd, patchJd, reparseJd, uploadJd } from "../controllers/jd.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireSessionAccess } from "../middlewares/session-access.js";
import { jdUpload } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { jdSessionParamSchema, patchJdSchema } from "../validators/jd.schema.js";
import { sessionIdParamSchema } from "../validators/session.schema.js";

export const jdRouter = Router();

jdRouter.use("/sessions", requireUser);

jdRouter.post(
  "/sessions/:id/jd",
  validate(sessionIdParamSchema),
  requireSessionAccess({ write: true }),
  jdUpload,
  uploadJd,
);
jdRouter.get("/sessions/:id/jd", validate(jdSessionParamSchema), requireSessionAccess(), getJd);
jdRouter.patch("/sessions/:id/jd", validate(patchJdSchema), requireSessionAccess({ write: true }), patchJd);
jdRouter.post(
  "/sessions/:id/jd/reparse",
  validate(sessionIdParamSchema),
  requireSessionAccess({ write: true }),
  reparseJd,
);
