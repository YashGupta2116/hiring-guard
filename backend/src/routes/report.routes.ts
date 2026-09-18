import { Router } from "express";
import { getReportHtml, getReportPdf } from "../controllers/report.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { reportIdParamSchema } from "../validators/report.schema.js";

export const reportRouter = Router();

reportRouter.use("/reports", requireUser);

reportRouter.get("/reports/:reportId/html", validate(reportIdParamSchema), getReportHtml);
reportRouter.get("/reports/:reportId/pdf", validate(reportIdParamSchema), getReportPdf);
