import { Router } from "express";
import { createLink, listLinks, revokeLink } from "../controllers/link.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireSessionAccess } from "../middlewares/session-access.js";
import { validate } from "../middlewares/validate.js";
import { createLinkSchema, listLinksSchema, revokeLinkSchema } from "../validators/link.schema.js";

export const linkRouter = Router();

linkRouter.use("/sessions", requireUser);

linkRouter.post("/sessions/:id/links", validate(createLinkSchema), requireSessionAccess({ write: true }), createLink);
linkRouter.get("/sessions/:id/links", validate(listLinksSchema), requireSessionAccess(), listLinks);
linkRouter.post(
  "/sessions/:id/links/:linkId/revoke",
  validate(revokeLinkSchema),
  requireSessionAccess({ write: true }),
  revokeLink,
);
