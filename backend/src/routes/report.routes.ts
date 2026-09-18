import { Router } from "express";
import { getReport, getReportHtml, getReportPdf, listReports } from "../controllers/report.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { listReportsSchema, reportIdParamSchema } from "../validators/report.schema.js";

export const reportRouter = Router();

reportRouter.use("/reports", requireUser);

reportRouter.get("/reports", validate(listReportsSchema), listReports);
reportRouter.get("/reports/:reportId", validate(reportIdParamSchema), getReport);
reportRouter.get("/reports/:reportId/html", validate(reportIdParamSchema), getReportHtml);
reportRouter.get("/reports/:reportId/pdf", validate(reportIdParamSchema), getReportPdf);
